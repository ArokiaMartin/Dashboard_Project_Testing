package com.example.dashboard_backend.live;

import com.example.dashboard_backend.query.QueryConfigNormalizer;
import com.example.dashboard_backend.util.SqlIdentifier;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The read path for live sources: replaces the plain table with a bucketed, windowed derived table so a
 * chart over a continuously-appended stream reads a bounded, aligned time series instead of every raw
 * event ever written.
 *
 * <p>It is installed as {@link QueryConfigNormalizer.TrustedFromSqlProvider}, i.e. it runs AFTER the
 * normalizer has stripped any client-supplied {@code datasetFromSql}. That is the whole point: this is
 * server-built SQL that a request payload can never reach or influence beyond the three strictly
 * validated knobs below (bucket from a fixed whitelist, window as a bounded integer, timezone matched
 * against a conservative pattern).
 *
 * <p>The emitted derived table:
 * <pre>
 *   (SELECT date_trunc('&lt;bucket&gt;', "ts" AT TIME ZONE '&lt;tz&gt;') AS "ts", &lt;declared columns&gt;
 *      FROM "&lt;live table&gt;"
 *     WHERE upload_id = '&lt;uuid&gt;'::uuid
 *       AND "ts" &gt;= now() - interval '&lt;n&gt; minutes'
 *       AND "ts" &lt;  (date_trunc('&lt;bucket&gt;', now() AT TIME ZONE '&lt;tz&gt;') AT TIME ZONE '&lt;tz&gt;')
 *   ) AS "&lt;live table&gt;"
 * </pre>
 * The last predicate is the closed-bucket cut: the bucket that is still filling is excluded, so the final
 * point of a series never dips while it accumulates. Gap filling (a {@code generate_series} left join for
 * buckets with no events) is deliberately NOT done here — it would need the window bounds as parameters
 * to stay readable, and every character of this string must contribute zero bind parameters.
 *
 * <p><strong>Zero bind parameters is load-bearing.</strong> {@code generateSql} appends this text into the
 * FROM clause without pushing any parameter, and the first bind comes later from the WHERE loop; a single
 * {@code ?} in here would be consumed by the FROM clause and shift every subsequent parameter. Both the
 * upload id and the interval are therefore inlined as validated literals, and {@link #assertNoBinds} fails
 * fast if that invariant is ever broken.
 */
@Component
public class LiveWindowedFromProvider implements QueryConfigNormalizer.TrustedFromSqlProvider {

    /** {@code date_trunc} units accepted from a request. Anything else is rejected, never defaulted. */
    private static final Set<String> ALLOWED_BUCKETS = Set.of("second", "minute", "hour", "day", "week", "month");

    /** IANA zone names only: letters, digits, underscore, slash, plus and minus. Excludes any quote. */
    private static final Pattern SAFE_TIMEZONE = Pattern.compile("^[A-Za-z0-9_+/-]{1,64}$");

    private static final String DEFAULT_BUCKET = "minute";
    private static final String DEFAULT_TIMEZONE = "UTC";
    private static final int DEFAULT_WINDOW_MINUTES = 60;
    /** 31 days. Keeps a single chart query from scanning an unbounded stream. */
    private static final int MAX_WINDOW_MINUTES = 60 * 24 * 31;

    private final LiveSourceRegistrar registrar;

    public LiveWindowedFromProvider(LiveSourceRegistrar registrar) {
        this.registrar = registrar;
    }

    @Override
    public String fromSqlFor(QueryConfigNormalizer.DatasetRef dataset, ObjectNode normalizedConfig) {
        if (dataset == null || dataset.uploadId() == null) {
            return null;
        }
        LiveSourceRegistrar.LiveSource source = registrar.resolve(dataset.uploadId());
        if (source == null) {
            // Not a live source — leave the normalizer's own FROM clause exactly as it was.
            return null;
        }

        JsonNode live = normalizedConfig == null ? null : normalizedConfig.get("live");
        String bucket = bucketOf(live);
        Integer windowMinutes = windowMinutesOf(live);   // null => all time (no lower bound)
        boolean excludeOpenBucket = excludeOpenBucketOf(live);
        String timeZone = timeZoneOf(live);

        String ts = SqlIdentifier.quote(LiveSourceRegistrar.TS_COLUMN);
        String tzLiteral = "'" + timeZone + "'";
        String bucketExpr = "date_trunc('" + bucket + "', " + ts + " AT TIME ZONE " + tzLiteral + ")";

        List<String> selectParts = new ArrayList<>();
        selectParts.add(bucketExpr + " AS " + ts);
        for (LiveSourceRegistrar.LiveField field : source.fields()) {
            selectParts.add(SqlIdentifier.quote(field.columnName()));
        }

        // The window and the closed-bucket cut are per-widget, not forced on every query. A KPI or table
        // can ask for "all time" (windowMinutes <= 0 or "all") and/or keep the still-filling bucket, so a
        // "Total revenue" KPI is not silently "revenue in the last hour minus the current minute".
        StringBuilder where = new StringBuilder(" WHERE upload_id = '" + dataset.uploadId() + "'::uuid");
        if (windowMinutes != null) {
            where.append(" AND ").append(ts).append(" >= now() - interval '").append(windowMinutes).append(" minutes'");
        }
        if (excludeOpenBucket) {
            where.append(" AND ").append(ts).append(" < (date_trunc('").append(bucket)
                    .append("', now() AT TIME ZONE ").append(tzLiteral).append(") AT TIME ZONE ").append(tzLiteral).append(")");
        }

        String sql = "(SELECT " + String.join(", ", selectParts)
                + " FROM " + SqlIdentifier.quote(source.tableName())
                + where
                + ") AS " + SqlIdentifier.quote(source.tableName());

        return assertNoBinds(sql);
    }

    private static String bucketOf(JsonNode live) {
        if (live == null || !live.hasNonNull("bucket")) {
            return DEFAULT_BUCKET;
        }
        String bucket = live.get("bucket").asText().trim().toLowerCase();
        if (!ALLOWED_BUCKETS.contains(bucket)) {
            throw new IllegalArgumentException("Invalid live bucket: " + live.get("bucket").asText());
        }
        return bucket;
    }

    private static Integer windowMinutesOf(JsonNode live) {
        if (live == null || !live.hasNonNull("windowMinutes")) {
            return DEFAULT_WINDOW_MINUTES;
        }
        JsonNode node = live.get("windowMinutes");
        // Explicit "all time": the string "all", or a non-positive number, means no lower time bound.
        if (node.isTextual() && node.asText().trim().equalsIgnoreCase("all")) {
            return null;
        }
        if (!node.canConvertToInt()) {
            throw new IllegalArgumentException("Invalid live windowMinutes: " + node.asText());
        }
        int minutes = node.asInt();
        if (minutes <= 0) {
            return null; // all time
        }
        if (minutes > MAX_WINDOW_MINUTES) {
            throw new IllegalArgumentException("live windowMinutes must be between 1 and " + MAX_WINDOW_MINUTES);
        }
        return minutes;
    }

    /** The still-filling bucket is excluded by default; a widget may opt in to including it. */
    private static boolean excludeOpenBucketOf(JsonNode live) {
        if (live == null || !live.hasNonNull("excludeOpenBucket")) {
            return true;
        }
        return live.get("excludeOpenBucket").asBoolean(true);
    }

    private static String timeZoneOf(JsonNode live) {
        if (live == null || !live.hasNonNull("tz")) {
            return DEFAULT_TIMEZONE;
        }
        String tz = live.get("tz").asText().trim();
        if (!SAFE_TIMEZONE.matcher(tz).matches()) {
            throw new IllegalArgumentException("Invalid live tz: " + live.get("tz").asText());
        }
        return tz;
    }

    /** Guards the zero-bind-parameter contract that nothing else in the SQL pipeline enforces. */
    private static String assertNoBinds(String sql) {
        if (sql.indexOf('?') >= 0) {
            throw new IllegalStateException("Live derived table must contain no bind placeholders");
        }
        return sql;
    }
}
