package com.example.dashboard_backend.live;

import com.example.dashboard_backend.ingestion.support.IdentifierNaming;
import com.example.dashboard_backend.util.SqlIdentifier;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * The live-source control plane: create/list/detail/patch/delete plus the diagnostic endpoints
 * (preview-ddl, test-event, health) and ingest-token lifecycle.
 *
 * <p>The physical table, the {@code data_uploads} row and the {@code field_metadata} rows are still
 * created by {@link LiveSourceRegistrar} (measures → NUMERIC, dimensions → TEXT, hand-written typed DDL
 * that never routes through the inferring dynamic-table path). This service persists the extra settings
 * and the hashed ingest token via {@link LiveSourceRepository}, and computes liveness by reading the
 * source's own table. It performs <strong>no aggregation</strong> — that belongs to
 * {@code QueryController.generateSql} alone.
 */
@Service
public class LiveSourceService {

    /** {@code date_trunc} units the read path ({@link LiveWindowedFromProvider}) can actually honour. */
    private static final Set<String> ALLOWED_BUCKETS = Set.of("second", "minute", "hour", "day", "week", "month");
    private static final Pattern SAFE_TIMEZONE = Pattern.compile("^[A-Za-z0-9_+/-]{1,64}$");
    private static final Set<String> ALLOWED_ARRIVALS = Set.of("http_push", "simulator", "external_pg");
    private static final Set<String> MEASURE_TYPES = Set.of("NUMERIC", "BIGINT", "DOUBLE PRECISION");
    private static final Set<String> AGGS = Set.of("SUM", "AVG", "COUNT", "MIN", "MAX");
    private static final int MAX_WINDOW_MINUTES = 60 * 24 * 31;

    private static final SecureRandom RANDOM = new SecureRandom();

    private final LiveSourceRegistrar registrar;
    private final LiveSourceRepository repository;
    private final LiveEventWriter writer;
    private final JdbcTemplate jdbcTemplate;

    public LiveSourceService(LiveSourceRegistrar registrar, LiveSourceRepository repository,
                             LiveEventWriter writer, JdbcTemplate jdbcTemplate) {
        this.registrar = registrar;
        this.repository = repository;
        this.writer = writer;
        this.jdbcTemplate = jdbcTemplate;
    }

    // ---- create --------------------------------------------------------------

    /** Result of a create: the id plus the plaintext ingest token, which is shown exactly once. */
    public record CreateResult(UUID id, String tableName, String ingestToken) {}

    public CreateResult create(JsonNode payload, UUID userId) {
        String name = text(payload, "name");
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("A live source name is required");
        }
        String arrival = firstNonBlank(text(payload, "arrival"), "http_push");
        if (!ALLOWED_ARRIVALS.contains(arrival)) {
            throw new IllegalArgumentException("Unsupported arrival: " + arrival);
        }

        JsonNode tsField = payload.get("timestampField");
        String tsName = tsField == null ? "ts" : firstNonBlank(text(tsField, "name"), "ts");

        List<DeclaredField> declared = readFields(payload);
        List<String> dimensions = new ArrayList<>();
        List<String> measures = new ArrayList<>();
        for (DeclaredField f : declared) {
            if (f.measure()) {
                measures.add(f.name());
            } else {
                dimensions.add(f.name());
            }
        }
        if (dimensions.isEmpty() && measures.isEmpty()) {
            throw new IllegalArgumentException("Declare at least one measure or dimension");
        }

        JsonNode time = payload.get("time");
        String timezone = validateTimezone(time == null ? "UTC" : firstNonBlank(text(time, "timezone"), "UTC"));
        String bucket = validateBucket(time == null ? "minute" : firstNonBlank(text(time, "bucket"), "minute"));
        int windowMinutes = clampWindow(intOr(time, "defaultWindowMinutes", 60));
        boolean excludeOpenBucket = boolOr(time, "excludeOpenBucket", true);
        Integer retentionDays = nullableInt(time, "retentionDays");

        JsonNode refresh = payload.get("refresh");
        int refreshIntervalMs = intOr(refresh, "intervalMs", 15000);
        Integer freshnessSeconds = nullableInt(refresh, "freshnessSeconds");

        // Physical table + data_uploads + field_metadata (measures NUMERIC, dimensions TEXT).
        LiveSourceRegistrar.LiveSource src = registrar.register(name, dimensions, measures, userId);

        // Persist the declared per-field detail (the physical column is NUMERIC/TEXT, but the detail page
        // shows exactly what the user declared).
        Map<String, String> columnByName = new LinkedHashMap<>();
        for (LiveSourceRegistrar.LiveField f : src.fields()) {
            columnByName.put(f.displayName(), f.columnName());
        }
        List<LiveSourceRepository.FieldRow> fieldRows = new ArrayList<>();
        fieldRows.add(new LiveSourceRepository.FieldRow(tsName, LiveSourceRegistrar.TS_COLUMN,
                "timestamp", "TIMESTAMPTZ", null, false));
        for (DeclaredField f : declared) {
            String column = columnByName.getOrDefault(f.name(), f.name());
            fieldRows.add(new LiveSourceRepository.FieldRow(
                    f.name(), column, f.measure() ? "measure" : "dimension",
                    f.sqlType(), f.measure() ? f.defaultAgg() : null, f.nullable()));
        }

        String token = newToken();
        repository.insertSource(new LiveSourceRepository.LiveSourceRow(
                src.sourceId(), name, src.tableName(), src.tableName(), tsName, arrival, timezone,
                bucket, windowMinutes, excludeOpenBucket, retentionDays, refreshIntervalMs,
                freshnessSeconds, sha256(token), Instant.now()));
        repository.insertFields(src.sourceId(), fieldRows);

        return new CreateResult(src.sourceId(), src.tableName(), token);
    }

    // ---- read ----------------------------------------------------------------

    public List<Map<String, Object>> list() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (LiveSourceRepository.LiveSourceRow r : repository.findAll()) {
            Stats s = stats(r.tableName(), r.id());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.id().toString());
            m.put("name", r.name());
            m.put("state", state(r, s).name());
            m.put("lastEventAt", s.lastEventAt() == null ? null : s.lastEventAt().toString());
            m.put("eventsPerMinute", s.eventsLastMinute());
            m.put("rows", s.rows());
            m.put("bucket", r.bucket());
            m.put("windowMinutes", r.windowMinutes());
            m.put("retentionDays", r.retentionDays());
            out.add(m);
        }
        return out;
    }

    public Optional<Map<String, Object>> detail(UUID id, String ingestUrl) {
        Optional<LiveSourceRepository.LiveSourceRow> found = repository.find(id);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        LiveSourceRepository.LiveSourceRow r = found.get();
        Stats s = stats(r.tableName(), r.id());

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.id().toString());
        m.put("name", r.name());
        m.put("slug", r.slug());
        m.put("tableName", r.tableName());
        m.put("tsColumn", r.tsColumn());
        m.put("state", state(r, s).name());
        m.put("lastEventAt", s.lastEventAt() == null ? null : s.lastEventAt().toString());
        m.put("eventsPerMinute", s.eventsLastMinute());
        m.put("rows", s.rows());
        m.put("bucket", r.bucket());
        m.put("windowMinutes", r.windowMinutes());
        m.put("timezone", r.timezone());
        m.put("excludeOpenBucket", r.excludeOpenBucket());
        m.put("retentionDays", r.retentionDays());
        m.put("refreshIntervalMs", r.refreshIntervalMs());
        m.put("freshnessSeconds", r.freshnessSeconds());
        m.put("ingestUrl", ingestUrl);

        List<Map<String, Object>> fields = new ArrayList<>();
        for (LiveSourceRepository.FieldRow f : repository.fields(id)) {
            Map<String, Object> fm = new LinkedHashMap<>();
            fm.put("name", f.name());
            fm.put("columnName", f.columnName());
            fm.put("role", f.role());
            fm.put("sqlType", f.sqlType());
            fm.put("defaultAgg", f.defaultAgg());
            fm.put("nullable", f.nullable());
            fields.add(fm);
        }
        m.put("fields", fields);
        return Optional.of(m);
    }

    public Optional<Map<String, Object>> health(UUID id) {
        Optional<LiveSourceRepository.LiveSourceRow> found = repository.find(id);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        LiveSourceRepository.LiveSourceRow r = found.get();
        Stats s = stats(r.tableName(), r.id());
        Long lag = s.lastEventAt() == null ? null
                : Math.max(0L, (System.currentTimeMillis() - s.lastEventAt().toEpochMilli()) / 1000);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("state", state(r, s).name());
        m.put("lastEventAt", s.lastEventAt() == null ? null : s.lastEventAt().toString());
        m.put("lagSeconds", lag);
        m.put("eventsLastMinute", s.eventsLastMinute());
        m.put("queueDepth", writer.queueDepth());
        m.put("failedBatches", writer.failedBatches(id));
        return Optional.of(m);
    }

    // ---- mutate --------------------------------------------------------------

    /** Patches window/bucket/retention/timezone/refresh only — never the schema. Returns detail or empty. */
    public Optional<Map<String, Object>> patch(UUID id, JsonNode body, String ingestUrl) {
        if (repository.find(id).isEmpty()) {
            return Optional.empty();
        }
        Map<String, Object> changes = new LinkedHashMap<>();
        if (has(body, "timezone")) changes.put("timezone", validateTimezone(text(body, "timezone")));
        if (has(body, "bucket")) changes.put("default_bucket", validateBucket(text(body, "bucket")));
        if (has(body, "defaultWindowMinutes")) changes.put("default_window_minutes", clampWindow(body.get("defaultWindowMinutes").asInt()));
        if (has(body, "excludeOpenBucket")) changes.put("exclude_open_bucket", body.get("excludeOpenBucket").asBoolean());
        if (body != null && body.has("retentionDays")) changes.put("retention_days", nullableInt(body, "retentionDays"));
        if (has(body, "refreshIntervalMs")) changes.put("refresh_interval_ms", body.get("refreshIntervalMs").asInt());
        if (body != null && body.has("freshnessSeconds")) changes.put("freshness_seconds", nullableInt(body, "freshnessSeconds"));
        repository.updateSettings(id, changes);
        return detail(id, ingestUrl);
    }

    /** Drops the physical table and all catalog rows. Mirrors DatasetController's force-delete path. */
    public boolean delete(UUID id) {
        Optional<LiveSourceRepository.LiveSourceRow> found = repository.find(id);
        if (found.isEmpty()) {
            return false;
        }
        String tableName = found.get().tableName();
        repository.delete(id);
        jdbcTemplate.update("DELETE FROM field_metadata WHERE upload_id = ?", id);
        jdbcTemplate.update("DELETE FROM data_uploads WHERE id = ?", id);
        jdbcTemplate.execute("DROP TABLE IF EXISTS " + SqlIdentifier.quote(tableName));
        registrar.invalidate(id);
        return true;
    }

    /** Rotates the ingest token; the previous one stops working immediately. Returns the new plaintext. */
    public Optional<String> regenerateToken(UUID id) {
        if (repository.find(id).isEmpty()) {
            return Optional.empty();
        }
        String token = newToken();
        repository.updateTokenHash(id, sha256(token));
        return Optional.of(token);
    }

    // ---- diagnostics ---------------------------------------------------------

    /** The DDL that a create with this payload WOULD run. No side effects. */
    public String previewDdl(JsonNode payload) {
        String name = firstNonBlank(text(payload, "name"), "live_source");
        List<DeclaredField> declared = readFields(payload);
        String base = IdentifierNaming.sanitizeIdentifier("live_" + name, "live_source");

        StringBuilder ddl = new StringBuilder();
        ddl.append("CREATE TABLE ").append(SqlIdentifier.quote(base)).append(" (\n");
        ddl.append("  upload_id UUID NOT NULL,\n");
        ddl.append("  row_id    BIGSERIAL,\n");
        ddl.append("  ").append(SqlIdentifier.quote(LiveSourceRegistrar.TS_COLUMN)).append(" TIMESTAMPTZ NOT NULL");
        for (DeclaredField f : declared) {
            String column = IdentifierNaming.sanitizeIdentifier(f.name(), "col");
            ddl.append(",\n  ").append(SqlIdentifier.quote(column)).append(" ")
                    .append(f.measure() ? "NUMERIC" : "TEXT")
                    .append(f.nullable() ? "" : " NOT NULL");
        }
        ddl.append(",\n  PRIMARY KEY (upload_id, row_id)\n);\n");
        ddl.append("CREATE INDEX ON ").append(SqlIdentifier.quote(base))
                .append(" USING btree (").append(SqlIdentifier.quote(LiveSourceRegistrar.TS_COLUMN)).append(" DESC);");
        return ddl.toString();
    }

    /** Validates one sample event against the declared schema WITHOUT inserting it. */
    public Optional<List<Map<String, Object>>> testEvent(UUID id, JsonNode event) {
        if (repository.find(id).isEmpty()) {
            return Optional.empty();
        }
        Map<String, JsonNode> flat = new LinkedHashMap<>();
        flatten(event, "", flat);

        List<Map<String, Object>> results = new ArrayList<>();
        for (LiveSourceRepository.FieldRow f : repository.fields(id)) {
            JsonNode raw = flat.get(f.name());
            if (raw == null) {
                raw = flat.get(f.columnName());
            }
            Coercion c = coerce(raw, f.role(), f.sqlType(), f.nullable());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("field", f.name());
            m.put("column", f.columnName());
            m.put("sqlType", f.sqlType());
            m.put("input", raw == null ? null : (raw.isValueNode() ? raw.asText() : raw.toString()));
            m.put("coerced", c.value());
            m.put("ok", c.ok());
            if (c.message() != null) {
                m.put("message", c.message());
            }
            results.add(m);
        }
        return Optional.of(results);
    }

    public boolean verifyToken(UUID id, String presentedToken) {
        if (presentedToken == null || presentedToken.isBlank()) {
            return false;
        }
        String stored = repository.tokenHash(id);
        if (stored == null) {
            return false;
        }
        return MessageDigest.isEqual(
                stored.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                sha256(presentedToken).getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    // ---- internals -----------------------------------------------------------

    private enum LiveState { LIVE, SLOW, STALLED, NEVER_CONNECTED }

    private record Stats(long rows, Instant lastEventAt, long eventsLastMinute) {}

    private record DeclaredField(String name, boolean measure, String sqlType, String defaultAgg, boolean nullable) {}

    private record Coercion(Object value, boolean ok, String message) {}

    private Stats stats(String tableName, UUID uploadId) {
        String sql = "SELECT count(*) AS n, max(" + SqlIdentifier.quote(LiveSourceRegistrar.TS_COLUMN) + ") AS mx, "
                + "count(*) FILTER (WHERE " + SqlIdentifier.quote(LiveSourceRegistrar.TS_COLUMN)
                + " >= now() - interval '1 minute') AS last_min "
                + "FROM " + SqlIdentifier.quote(tableName) + " WHERE upload_id = ?";
        return jdbcTemplate.query(sql, rs -> {
            if (rs.next()) {
                long n = rs.getLong("n");
                Timestamp mx = rs.getTimestamp("mx");
                long lastMin = rs.getLong("last_min");
                return new Stats(n, mx == null ? null : mx.toInstant(), lastMin);
            }
            return new Stats(0, null, 0);
        }, uploadId);
    }

    private LiveState state(LiveSourceRepository.LiveSourceRow r, Stats s) {
        if (s.rows() == 0 || s.lastEventAt() == null) {
            return LiveState.NEVER_CONNECTED;
        }
        long lagSeconds = Math.max(0L, (System.currentTimeMillis() - s.lastEventAt().toEpochMilli()) / 1000);
        long threshold = freshnessThresholdSeconds(r);
        if (lagSeconds <= threshold) {
            return LiveState.LIVE;
        }
        if (lagSeconds <= threshold * 3) {
            return LiveState.SLOW;
        }
        return LiveState.STALLED;
    }

    /** Explicit freshness, else 3 buckets (the Auto floor). Full p95-of-inter-arrival Auto is Phase 2. */
    private long freshnessThresholdSeconds(LiveSourceRepository.LiveSourceRow r) {
        if (r.freshnessSeconds() != null && r.freshnessSeconds() > 0) {
            return r.freshnessSeconds();
        }
        return Math.max(3L * bucketSeconds(r.bucket()), 60L);
    }

    private static long bucketSeconds(String bucket) {
        return switch (bucket) {
            case "second" -> 1;
            case "minute" -> 60;
            case "hour" -> 3600;
            case "day" -> 86400;
            case "week" -> 604800;
            case "month" -> 2592000;
            default -> 60;
        };
    }

    private static List<DeclaredField> readFields(JsonNode payload) {
        List<DeclaredField> out = new ArrayList<>();
        readFieldArray(payload, "measures", true, out);
        readFieldArray(payload, "dimensions", false, out);
        return out;
    }

    private static void readFieldArray(JsonNode payload, String key, boolean measure, List<DeclaredField> out) {
        JsonNode arr = payload == null ? null : payload.get(key);
        if (arr == null || !arr.isArray()) {
            return;
        }
        for (JsonNode node : arr) {
            String name = text(node, "name");
            if (name == null || name.isBlank()) {
                continue;
            }
            String type = firstNonBlank(text(node, "type"), measure ? "NUMERIC" : "TEXT").toUpperCase();
            if (measure && !MEASURE_TYPES.contains(type)) {
                throw new IllegalArgumentException("Invalid measure type '" + type + "' for field '" + name + "'");
            }
            if (!measure) {
                type = "TEXT";
            }
            String agg = null;
            if (measure) {
                agg = firstNonBlank(text(node, "defaultAgg"), "SUM").toUpperCase();
                if (!AGGS.contains(agg)) {
                    throw new IllegalArgumentException("Invalid aggregation '" + agg + "' for field '" + name + "'");
                }
            }
            boolean nullable = node.path("nullable").asBoolean(true);
            out.add(new DeclaredField(name.trim(), measure, type, agg, nullable));
        }
    }

    private static Coercion coerce(JsonNode raw, String role, String sqlType, boolean nullable) {
        if (raw == null || raw.isNull() || raw.isMissingNode()) {
            return nullable ? new Coercion(null, true, null)
                    : new Coercion(null, false, "missing (declared NOT NULL)");
        }
        if ("timestamp".equals(role)) {
            String s = raw.asText();
            try {
                return new Coercion(OffsetDateTime.parse(s).toString(), true, null);
            } catch (Exception e) {
                try {
                    return new Coercion(Instant.parse(s).toString(), true, null);
                } catch (Exception e2) {
                    return new Coercion(null, false, "not a parseable timestamp");
                }
            }
        }
        if ("measure".equals(role)) {
            try {
                BigDecimal d = new BigDecimal(raw.isNumber() ? raw.numberValue().toString() : raw.asText().trim());
                return new Coercion(d.toString(), true, null);
            } catch (NumberFormatException e) {
                return new Coercion(null, false, "not numeric");
            }
        }
        return new Coercion(raw.isTextual() ? raw.asText() : raw.toString(), true, null);
    }

    /** Flattens a JSON object to `a_b` keys, matching the wizard's detection. Arrays are skipped. */
    private static void flatten(JsonNode node, String prefix, Map<String, JsonNode> out) {
        if (node == null || !node.isObject()) {
            return;
        }
        node.fields().forEachRemaining(e -> {
            String key = prefix.isEmpty() ? e.getKey() : prefix + "_" + e.getKey();
            JsonNode v = e.getValue();
            if (v.isObject()) {
                flatten(v, key, out);
            } else if (!v.isArray()) {
                out.put(key, v);
            }
        });
    }

    private String validateTimezone(String tz) {
        String t = tz == null ? "UTC" : tz.trim();
        if (!SAFE_TIMEZONE.matcher(t).matches()) {
            throw new IllegalArgumentException("Invalid timezone: " + tz);
        }
        return t;
    }

    private String validateBucket(String bucket) {
        String b = bucket == null ? "" : bucket.trim().toLowerCase();
        if (!ALLOWED_BUCKETS.contains(b)) {
            throw new IllegalArgumentException(
                    "Unsupported bucket '" + bucket + "'. Supported: " + ALLOWED_BUCKETS);
        }
        return b;
    }

    private int clampWindow(int minutes) {
        if (minutes < 0) {
            return 0;
        }
        if (minutes > MAX_WINDOW_MINUTES) {
            throw new IllegalArgumentException("defaultWindowMinutes must be between 0 and " + MAX_WINDOW_MINUTES);
        }
        return minutes;
    }

    private static String newToken() {
        byte[] b = new byte[32];
        RANDOM.nextBytes(b);
        return "lsk_" + Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    private static String sha256(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte x : digest) {
                sb.append(Character.forDigit((x >> 4) & 0xF, 16)).append(Character.forDigit(x & 0xF, 16));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static boolean has(JsonNode node, String field) {
        return node != null && node.hasNonNull(field);
    }

    private static String text(JsonNode node, String field) {
        if (node == null) {
            return null;
        }
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static String firstNonBlank(String a, String b) {
        return a == null || a.isBlank() ? b : a;
    }

    private static int intOr(JsonNode node, String field, int fallback) {
        return has(node, field) ? node.get(field).asInt(fallback) : fallback;
    }

    private static boolean boolOr(JsonNode node, String field, boolean fallback) {
        return has(node, field) ? node.get(field).asBoolean(fallback) : fallback;
    }

    private static Integer nullableInt(JsonNode node, String field) {
        if (node == null || !node.has(field) || node.get(field).isNull()) {
            return null;
        }
        return node.get(field).asInt();
    }
}
