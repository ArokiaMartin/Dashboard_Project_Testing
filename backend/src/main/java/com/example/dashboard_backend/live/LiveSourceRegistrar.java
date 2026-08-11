package com.example.dashboard_backend.live;

import com.example.dashboard_backend.ingestion.metadata.IngestionMetadataRepository;
import com.example.dashboard_backend.ingestion.support.IdentifierNaming;
import com.example.dashboard_backend.model.FieldAnalysis;
import com.example.dashboard_backend.util.AppConstants;
import com.example.dashboard_backend.util.SqlIdentifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Creates and catalogs a <em>live</em> source: a purpose-built, hand-written table that a high-frequency
 * append path writes single events into, plus the synthetic {@code data_uploads} / {@code field_metadata}
 * rows that make it selectable in the dashboard builder's pickers.
 *
 * <p>The DDL is written out by hand here rather than going through
 * {@link com.example.dashboard_backend.ingestion.ddl.DynamicTableManager} on purpose. That manager infers
 * a column's type from the data it has seen and falls back to {@code TEXT}; since nothing in this backend
 * ever issues an {@code ALTER COLUMN ... TYPE} on a dynamic data table, a column that starts out TEXT can
 * never be promoted to NUMERIC/TIMESTAMPTZ afterwards. A live stream has no "first upload" to infer from,
 * so its schema must be <strong>declared</strong> up front and created with its final types.
 *
 * <p>The table shape is fixed:
 * <pre>
 *   upload_id UUID NOT NULL          -- every read endpoint filters on this
 *   row_id    BIGSERIAL              -- monotonic, assigned by the sequence (never a per-request index)
 *   ts        TIMESTAMPTZ NOT NULL   -- the event timestamp the bucketed read path groups by
 *   &lt;declared dimensions&gt; TEXT
 *   &lt;declared measures&gt;   NUMERIC
 *   PRIMARY KEY (upload_id, row_id)
 *   BTREE (ts DESC)
 * </pre>
 */
@Component
public class LiveSourceRegistrar {

    /** Value written to {@code data_uploads.source_kind} for a live source. */
    public static final String SOURCE_KIND_LIVE = "live";

    /** The event-timestamp column; always present, never derived from a declared field. */
    public static final String TS_COLUMN = "ts";

    /** Columns the live table owns itself — a declared field may never claim one of these names. */
    private static final Set<String> RESERVED_COLUMNS = Set.of("upload_id", "row_id");

    /**
     * Room for the "<table>_row_id_seq" name BIGSERIAL derives, which PostgreSQL truncates at 63 chars
     * (silently, with a notice) — keeping the base short means two sources can never collide through it.
     */
    private static final int MAX_TABLE_NAME = 48;

    private final JdbcTemplate jdbcTemplate;
    private final IngestionMetadataRepository metadataRepository;

    /** upload_id -> live source (empty when the upload is NOT a live source). Kind never changes. */
    private final Map<UUID, Optional<LiveSource>> cache = new ConcurrentHashMap<>();

    public LiveSourceRegistrar(JdbcTemplate jdbcTemplate, IngestionMetadataRepository metadataRepository) {
        this.jdbcTemplate = jdbcTemplate;
        this.metadataRepository = metadataRepository;
    }

    /** One declared column of a live source: the label the UI shows, its physical column, and its type. */
    public record LiveField(String displayName, String columnName, String fieldType) {}

    /** A registered live source. {@code fields} excludes the reserved {@link #TS_COLUMN}. */
    public record LiveSource(UUID sourceId, String tableName, List<LiveField> fields) {}

    /**
     * Declares a new live source and provisions everything it needs to be both writable and visible:
     * the typed table, its index, the {@code data_uploads} row (so it appears in
     * {@code GET /api/datasets}) and one {@code field_metadata} row per column (so the builder can
     * classify each column — {@code field_type = 'numeric'} is what makes a column offerable as a
     * measure).
     */
    public LiveSource register(String displayName, List<String> dimensions, List<String> measures, UUID userId) {
        if (displayName == null || displayName.isBlank()) {
            throw new IllegalArgumentException("Live source name is required");
        }
        List<String> dims = dimensions == null ? List.of() : dimensions;
        List<String> meas = measures == null ? List.of() : measures;
        if (dims.isEmpty() && meas.isEmpty()) {
            throw new IllegalArgumentException("A live source must declare at least one dimension or measure");
        }

        UUID sourceId = UUID.randomUUID();
        String tableName = allocateTableName(displayName, sourceId);

        // One normalization pass over both lists so a dimension and a measure can never collide on the
        // same physical column name.
        List<String> declared = declaredNames(dims, meas);
        Map<String, String> columnOf = IdentifierNaming.uniqueNormalizedNames(declared);

        List<LiveField> fields = new ArrayList<>();
        for (String name : declared) {
            String column = columnOf.get(name);
            if (RESERVED_COLUMNS.contains(column)) {
                throw new IllegalArgumentException("Declared field '" + name + "' maps to reserved column '" + column + "'");
            }
            if (TS_COLUMN.equals(column)) {
                // The caller listed the event timestamp explicitly; it is already a declared column below.
                continue;
            }
            fields.add(new LiveField(name, column, meas.contains(name) ? "numeric" : "text"));
        }

        createLiveTable(tableName, fields);

        metadataRepository.recordUpload(sourceId, userId == null ? AppConstants.USER_123 : userId,
                tableName, displayName, 0L, fields.size() + 1);
        // Marks the upload as a stream rather than a file upload, so the dataset DELETE endpoint can
        // refuse to drop the physical table out from under a running writer.
        jdbcTemplate.update("UPDATE data_uploads SET source_kind = ? WHERE id = ?", SOURCE_KIND_LIVE, sourceId);

        List<FieldAnalysis> analyses = new ArrayList<>();
        analyses.add(new FieldAnalysis(TS_COLUMN, TS_COLUMN, "date", true, false, 0, 0, null, null, List.of()));
        for (LiveField f : fields) {
            boolean isMeasure = "numeric".equals(f.fieldType());
            analyses.add(new FieldAnalysis(f.displayName(), f.columnName(), f.fieldType(),
                    !isMeasure, isMeasure, 0, 0, null, null, List.of()));
        }
        metadataRepository.saveFieldMetadata(sourceId, "root", analyses);

        cache.remove(sourceId);
        return new LiveSource(sourceId, tableName, fields);
    }

    /**
     * Looks up a registered live source, or {@code null} when the upload id is unknown or is a normal
     * file upload rather than a live source. Cached because the read path consults it on every
     * {@code /api/execute-query} call and an upload's kind never changes.
     */
    public LiveSource resolve(UUID uploadId) {
        if (uploadId == null) {
            return null;
        }
        return cache.computeIfAbsent(uploadId, this::loadLiveSource).orElse(null);
    }

    /** Drops a cached lookup (used after a live source is deleted). */
    public void invalidate(UUID uploadId) {
        if (uploadId != null) {
            cache.remove(uploadId);
        }
    }

    private Optional<LiveSource> loadLiveSource(UUID uploadId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT table_name, source_kind FROM data_uploads WHERE id = ?", uploadId);
        if (rows.isEmpty() || !SOURCE_KIND_LIVE.equals(rows.get(0).get("source_kind"))) {
            return Optional.empty();
        }
        String tableName = String.valueOf(rows.get(0).get("table_name"));

        List<Map<String, Object>> fieldRows = jdbcTemplate.queryForList(
                "SELECT field_name, normalized_field_name, field_type FROM field_metadata WHERE upload_id = ? ORDER BY id",
                uploadId);
        List<LiveField> fields = new ArrayList<>();
        for (Map<String, Object> row : fieldRows) {
            String column = String.valueOf(row.get("normalized_field_name"));
            if (TS_COLUMN.equals(column) || RESERVED_COLUMNS.contains(column)) {
                continue;
            }
            fields.add(new LiveField(String.valueOf(row.get("field_name")), column,
                    String.valueOf(row.get("field_type"))));
        }
        return Optional.of(new LiveSource(uploadId, tableName, fields));
    }

    /**
     * Hand-written typed DDL. Types are DECLARED, never inferred — see the class javadoc for why nothing
     * here may go through the inferring dynamic-table path.
     */
    private void createLiveTable(String tableName, List<LiveField> fields) {
        StringBuilder ddl = new StringBuilder();
        ddl.append("CREATE TABLE IF NOT EXISTS ").append(SqlIdentifier.quote(tableName)).append(" (");
        ddl.append("upload_id UUID NOT NULL, ");
        // row_id comes from the sequence, so a second append into the same upload_id can never reuse a
        // value and trip PRIMARY KEY (upload_id, row_id).
        ddl.append("row_id BIGSERIAL, ");
        ddl.append(SqlIdentifier.quote(TS_COLUMN)).append(" TIMESTAMPTZ NOT NULL");
        for (LiveField field : fields) {
            ddl.append(", ").append(SqlIdentifier.quote(field.columnName()))
                    .append(" ").append("numeric".equals(field.fieldType()) ? "NUMERIC" : "TEXT");
        }
        ddl.append(", PRIMARY KEY (upload_id, row_id))");
        jdbcTemplate.execute(ddl.toString());

        // Newest-first reads (the windowed read path) and the retention/window cut both walk ts backwards.
        String indexName = IdentifierNaming.truncateForPostgres(tableName + "_ts_desc_idx");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS " + SqlIdentifier.quote(indexName)
                + " ON " + SqlIdentifier.quote(tableName) + " USING btree (" + SqlIdentifier.quote(TS_COLUMN) + " DESC)");
    }

    /**
     * Derives a physical table name from the display name, suffixing it with part of the source id when
     * the base is already taken. Two sources must never share a table: {@code CREATE TABLE IF NOT EXISTS}
     * would silently bind the second one to the first one's already-fixed column types.
     */
    private String allocateTableName(String displayName, UUID sourceId) {
        String base = IdentifierNaming.sanitizeIdentifier("live_" + displayName, "live_source");
        if (base.length() > MAX_TABLE_NAME) {
            base = base.substring(0, MAX_TABLE_NAME);
        }
        String candidate = base;
        if (tableNameTaken(candidate)) {
            candidate = base + "_" + IdentifierNaming.shortId(sourceId, 8);
        }
        return SqlIdentifier.validate(candidate, "live table");
    }

    private boolean tableNameTaken(String tableName) {
        Integer existing = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables " +
                "WHERE table_schema = current_schema() AND table_name = ?",
                Integer.class, tableName);
        if (existing != null && existing > 0) {
            return true;
        }
        Integer uploads = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM data_uploads WHERE table_name = ?", Integer.class, tableName);
        return uploads != null && uploads > 0;
    }

    /** Dimensions then measures, blanks dropped and duplicates collapsed, order preserved. */
    private static List<String> declaredNames(List<String> dimensions, List<String> measures) {
        Set<String> ordered = new LinkedHashSet<>();
        for (String s : dimensions) {
            if (s != null && !s.isBlank()) ordered.add(s);
        }
        for (String s : measures) {
            if (s != null && !s.isBlank()) ordered.add(s);
        }
        return new ArrayList<>(ordered);
    }
}
