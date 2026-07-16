package com.example.dashboard_backend.service;

import com.example.dashboard_backend.ingestion.metadata.SchemaRepository;
import com.example.dashboard_backend.ingestion.model.Schema;
import com.example.dashboard_backend.ingestion.model.SchemaField;
import com.example.dashboard_backend.ingestion.schema.SchemaValidationService;
import com.example.dashboard_backend.ingestion.support.IdentifierNaming;
import com.example.dashboard_backend.model.IngestRequest;
import com.example.dashboard_backend.model.IngestResponse;
import com.example.dashboard_backend.model.SchemaBasedIngestRequest;
import com.example.dashboard_backend.model.RegisterVersionRequest;
import com.example.dashboard_backend.util.VersioningUtil;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

@Service
public class SchemaBasedIngestionService {

    private static final Logger log = LoggerFactory.getLogger(SchemaBasedIngestionService.class);

    private final SchemaRepository schemaRepository;
    private final JsonIngestionService jsonIngestionService;
    private final SchemaValidationService validationService;
    private final DataVersioningService dataVersioningService;
    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;

    public SchemaBasedIngestionService(
        SchemaRepository schemaRepository,
        JsonIngestionService jsonIngestionService,
        SchemaValidationService validationService,
        DataVersioningService dataVersioningService,
        JdbcTemplate jdbcTemplate,
        PlatformTransactionManager transactionManager
    ) {
        this.schemaRepository = schemaRepository;
        this.jsonIngestionService = jsonIngestionService;
        this.validationService = validationService;
        this.dataVersioningService = dataVersioningService;
        this.jdbcTemplate = jdbcTemplate;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public IngestResponse ingestWithSchema(SchemaBasedIngestRequest request) {
        Schema schema = schemaRepository.findById(request.schemaId())
            .orElseThrow(() -> new IllegalArgumentException("Schema not found: " + request.schemaId()));

        // Validate data against schema unless explicitly skipped
        if (!Boolean.TRUE.equals(request.skipValidation())) {
            SchemaValidationService.ValidationResult validationResult = validationService.validateDataAgainstSchema(schema, request.data());

            if (!validationResult.isValid()) {
                throw new IllegalArgumentException(
                    "Data validation failed: " + String.join("; ", validationResult.errors())
                );
            }

            if (!validationResult.warnings().isEmpty()) {
                log.warn("Data validation warnings: {}", String.join("; ", validationResult.warnings()));
            }
        }

        // If only validation is requested, return early
        if (Boolean.TRUE.equals(request.validateOnly())) {
            return new IngestResponse(
                UUID.randomUUID().toString(),
                "validation_only",
                0,
                schema.fields().size(),
                "VALIDATED",
                null,
                "Data validated successfully against schema"
            );
        }

        // Perform actual ingestion.
        // Data versioning: use a STABLE physical table name that's consistent across all uploads for
        // this schema. All versions of a schema share the SAME table, and version tracking happens via
        // the data_versions table (not via separate physical tables). This allows efficient storage and
        // makes it easy to compare/overlay versions in the dashboard.
        String tableName = IdentifierNaming.sanitizeIdentifier(
            schema.schemaName() + "_v1",
            "schema_" + IdentifierNaming.shortId(schema.id(), 8)
        );

        // Identical re-uploads should show the SAME dashboard, not create a duplicate version. Compare a
        // content fingerprint of the incoming data against the latest version of this schema; if they
        // match, reuse that version instead of ingesting again.
        String fingerprint = computeFingerprint(request.data());
        List<Map<String, Object>> latest = jdbcTemplate.queryForList(
            "SELECT id, table_name, row_count, column_count, version_number, data_fingerprint " +
            "FROM data_uploads WHERE schema_id = ? ORDER BY version_number DESC NULLS LAST LIMIT 1",
            request.schemaId()
        );
        if (!latest.isEmpty() && fingerprint.equals(latest.get(0).get("data_fingerprint"))) {
            Map<String, Object> existing = latest.get(0);
            int existingVersion = existing.get("version_number") == null
                ? 1 : ((Number) existing.get("version_number")).intValue();
            log.info(
                "Schema-based ingestion skipped: identical data. Schema: {}, reusing version {}",
                schema.schemaName(), existingVersion
            );
            return new IngestResponse(
                existing.get("id").toString(),
                (String) existing.get("table_name"),
                existing.get("row_count") == null ? 0 : ((Number) existing.get("row_count")).intValue(),
                existing.get("column_count") == null
                    ? schema.fields().size() : ((Number) existing.get("column_count")).intValue(),
                "UNCHANGED",
                null,
                "Identical data — reusing existing version " + existingVersion + " (no new version created)."
            );
        }

        IngestRequest ingestRequest = new IngestRequest(
            null,
            request.userId(),
            tableName,
            request.originalFilename(),
            request.data()
        );

        IngestResponse ingestResponse = jsonIngestionService.ingest(ingestRequest);
        UUID uploadId = UUID.fromString(ingestResponse.uploadId());

        // Addition vs. change (incremental, key-based). The primary-key field(s) declared on the schema
        // identify a row. Because uploads are incremental (only new/changed rows), each incoming row is:
        //   * a NEW key value                        -> ADDITION     (grow the current version, same upload_id)
        //   * an existing key with changed values    -> MODIFICATION (create a new version snapshot)
        //   * an existing key with identical values  -> no-op
        // Additions keep the same upload_id so saved dashboards stay valid. When the schema declares no
        // primary key, fall back to whole-row superset detection (works for full re-uploads).
        if (!latest.isEmpty()) {
            IngestResponse merged = applyIncrementalUpload(
                latest.get(0), uploadId, tableName, fingerprint, ingestResponse, schema, request
            );
            if (merged != null) {
                return merged;
            }
        }

        // No previous version (or the upload could not be merged): keep the freshly ingested upload as a
        // new data version tagged with its schema, version number and fingerprint.
        int versionNumber = nextVersionNumber(request.schemaId());
        jdbcTemplate.update(
            "UPDATE data_uploads SET schema_id = ?, version_number = ?, data_fingerprint = ? WHERE id = ?",
            request.schemaId(), versionNumber, fingerprint, uploadId
        );

        recordIngestionAudit(
            request.schemaId(),
            uploadId,
            request.originalFilename(),
            (long) ingestResponse.rowsInserted(),
            "SUCCESS",
            null,
            request.userId()
        );

        // Register this upload as a new version in the data_versions table with checksum
        try {
            String jsonData = com.fasterxml.jackson.databind.ObjectMapper.class
                .getClassLoader()
                .getResourceAsStream("") != null ?
                new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(request.data()) :
                request.data().toString();
            String checksum = VersioningUtil.calculateChecksumFromString(jsonData);

            RegisterVersionRequest versionRequest = new RegisterVersionRequest(
                request.schemaId().toString(),
                schema.schemaName(),
                tableName,
                checksum,
                ingestResponse.rowsInserted(),
                request.originalFilename(),
                false,
                null,
                request.userId()
            );

            dataVersioningService.registerVersion(versionRequest);
            log.info("Version {} registered successfully for schema: {}", versionNumber, schema.schemaName());
        } catch (Exception e) {
            log.warn("Failed to register version in data_versions table, but ingestion succeeded", e);
            // Don't fail ingestion if version registration fails
        }

        log.info(
            "Schema-based ingestion completed. Schema: {}, Version: {}, Rows: {}, Table: {}",
            schema.schemaName(),
            versionNumber,
            ingestResponse.rowsInserted(),
            ingestResponse.tableName()
        );

        return ingestResponse;
    }

    /**
     * Applies a freshly-ingested incremental upload ({@code newUploadId}, currently holding only the newly
     * uploaded rows) on top of the previous latest version. Returns a response describing the ADDITION,
     * no-op or new-version outcome, or {@code null} to let the caller keep the upload as a brand-new
     * version (e.g. nested data, a structural schema change, or an unexpected error).
     */
    private IngestResponse applyIncrementalUpload(
        Map<String, Object> previous, UUID newUploadId, String tableName, String fingerprint,
        IngestResponse ingestResponse, Schema schema, SchemaBasedIngestRequest request
    ) {
        UUID oldUploadId;
        try {
            oldUploadId = UUID.fromString(String.valueOf(previous.get("id")));
        } catch (IllegalArgumentException ex) {
            return null;
        }
        String previousTable = (String) previous.get("table_name");
        if (previousTable == null || !previousTable.equals(tableName)) {
            return null; // different physical table (e.g. a structural schema change) -> separate lineage
        }

        // Nested uploads (child tables carry dotted field names) are out of scope for the merge logic.
        Integer nestedFields = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM field_metadata WHERE upload_id = ? AND field_name LIKE '%.%'",
            Integer.class, newUploadId
        );
        if (nestedFields != null && nestedFields > 0) {
            return null;
        }

        // Root data columns of the new upload: original field name -> normalized column name, in order.
        List<Map<String, Object>> fieldRows = jdbcTemplate.queryForList(
            "SELECT field_name, normalized_field_name FROM field_metadata " +
            "WHERE upload_id = ? AND field_name NOT LIKE '%.%' ORDER BY id",
            newUploadId
        );
        if (fieldRows.isEmpty()) {
            return null;
        }
        List<String> allCols = new ArrayList<>();
        Map<String, String> normalizedByFieldName = new LinkedHashMap<>();
        for (Map<String, Object> fr : fieldRows) {
            String fieldName = String.valueOf(fr.get("field_name"));
            String normalized = String.valueOf(fr.get("normalized_field_name"));
            allCols.add(normalized);
            normalizedByFieldName.put(fieldName, normalized);
        }

        // Primary-key columns declared on the schema (mapped to normalized column names).
        List<String> keyCols = new ArrayList<>();
        for (SchemaField field : schema.fields()) {
            if (Boolean.TRUE.equals(field.isPrimaryKey())) {
                String normalized = normalizedByFieldName.get(field.fieldName());
                if (normalized != null && !keyCols.contains(normalized)) {
                    keyCols.add(normalized);
                }
            }
        }

        try {
            if (keyCols.isEmpty()) {
                // No key declared: fall back to whole-row superset detection (full re-upload semantics).
                return tryWholeRowAppend(
                    previous, newUploadId, oldUploadId, tableName, fingerprint, ingestResponse,
                    schema, request, allCols
                );
            }
            return applyKeyedUpload(
                previous, newUploadId, oldUploadId, tableName, fingerprint, schema, request, allCols, keyCols
            );
        } catch (RuntimeException ex) {
            log.warn("Incremental merge failed for table {}; keeping upload as a new version instead.",
                tableName, ex);
            return null;
        }
    }

    /** Key-based upsert: additions (rows/columns) grow the current version; modifications create a new version snapshot. */
    private IngestResponse applyKeyedUpload(
        Map<String, Object> previous, UUID newUploadId, UUID oldUploadId, String tableName, String fingerprint,
        Schema schema, SchemaBasedIngestRequest request, List<String> allCols, List<String> keyCols
    ) {
        String qt = IdentifierNaming.quoteIdentifier(tableName);

        // Columns already present in the previous version (root fields only) vs. columns this upload introduces.
        List<String> oldCols = jdbcTemplate.queryForList(
            "SELECT normalized_field_name FROM field_metadata WHERE upload_id = ? AND field_name NOT LIKE '%.%'",
            String.class, oldUploadId
        );
        List<String> newCols = new ArrayList<>(allCols);
        newCols.removeAll(oldCols);

        String keyJoin = joinColumns(keyCols, "o.%1$s IS NOT DISTINCT FROM n.%1$s", " AND ");

        // A MODIFICATION exists when an incoming row shares a key with an existing row but an EXISTING
        // (already-known) non-key value differs. Newly-introduced columns are additions, not modifications,
        // so they must not trigger a new version. Any real modification promotes the upload to a new version.
        List<String> oldNonKeyCols = new ArrayList<>(oldCols);
        oldNonKeyCols.removeAll(keyCols);
        int modified = 0;
        if (!oldNonKeyCols.isEmpty()) {
            String diff = joinColumns(oldNonKeyCols, "o.%1$s IS DISTINCT FROM n.%1$s", " OR ");
            Integer m = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM " + qt + " n JOIN " + qt + " o " +
                "ON o.upload_id = ? AND " + keyJoin + " " +
                "WHERE n.upload_id = ? AND (" + diff + ")",
                Integer.class, oldUploadId, newUploadId
            );
            modified = m == null ? 0 : m;
        }

        if (modified > 0) {
            return createNewVersionSnapshot(
                newUploadId, oldUploadId, tableName, fingerprint, schema, request, allCols, keyJoin
            );
        }
        return appendNewKeys(
            previous, newUploadId, oldUploadId, tableName, fingerprint, schema, request, keyJoin, newCols
        );
    }

    /**
     * Appends incoming rows whose key is new, and backfills any newly-introduced columns onto the existing
     * version's rows (matched by key). Duplicate-key rows that carry no new column data are dropped. The
     * result stays on the SAME version (same {@code upload_id}); only a changed value in an existing column
     * would create a new version (detected earlier by {@link #applyKeyedUpload}).
     */
    private IngestResponse appendNewKeys(
        Map<String, Object> previous, UUID newUploadId, UUID oldUploadId, String tableName, String fingerprint,
        Schema schema, SchemaBasedIngestRequest request, String keyJoin, List<String> newCols
    ) {
        String qt = IdentifierNaming.quoteIdentifier(tableName);
        int previousRows = previous.get("row_count") == null
            ? 0 : ((Number) previous.get("row_count")).intValue();
        int previousVersion = previous.get("version_number") == null
            ? 1 : ((Number) previous.get("version_number")).intValue();

        int[] state = transactionTemplate.execute(status -> {
            // Case 3: newly-introduced columns — copy their values onto the matching existing rows and carry
            // the columns' metadata forward so this version now owns them.
            if (!newCols.isEmpty()) {
                String setClause = joinColumns(newCols, "%1$s = n.%1$s", ", ");
                jdbcTemplate.update(
                    "UPDATE " + qt + " o SET " + setClause + " FROM " + qt + " n " +
                    "WHERE o.upload_id = ? AND n.upload_id = ? AND " + keyJoin,
                    oldUploadId, newUploadId);
                for (String col : newCols) {
                    jdbcTemplate.update(
                        "UPDATE field_metadata SET upload_id = ? WHERE upload_id = ? AND normalized_field_name = ?",
                        oldUploadId, newUploadId, col);
                }
            }
            // Discard incoming rows whose key already exists in the current version (identical duplicates).
            jdbcTemplate.update(
                "DELETE FROM " + qt + " n WHERE n.upload_id = ? AND EXISTS (" +
                "SELECT 1 FROM " + qt + " o WHERE o.upload_id = ? AND " + keyJoin + ")",
                newUploadId, oldUploadId
            );
            Integer added = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM " + qt + " WHERE upload_id = ?", Integer.class, newUploadId);
            int addedRows = added == null ? 0 : added;
            if (addedRows > 0) {
                // Re-point the new-key rows into the current version, offsetting row_id to avoid PK collisions.
                Long offset = jdbcTemplate.queryForObject(
                    "SELECT COALESCE(MAX(row_id), -1) + 1 FROM " + qt + " WHERE upload_id = ?",
                    Long.class, oldUploadId);
                jdbcTemplate.update(
                    "UPDATE " + qt + " SET upload_id = ?, row_id = row_id + ? WHERE upload_id = ?",
                    oldUploadId, offset == null ? 0L : offset, newUploadId);
            }
            jdbcTemplate.update("DELETE FROM field_metadata WHERE upload_id = ?", newUploadId);
            jdbcTemplate.update("DELETE FROM data_uploads WHERE id = ?", newUploadId);

            if (addedRows == 0 && newCols.isEmpty()) {
                return null; // nothing genuinely new
            }
            Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM " + qt + " WHERE upload_id = ?", Integer.class, oldUploadId);
            Integer colCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM field_metadata WHERE upload_id = ? AND field_name NOT LIKE '%.%'",
                Integer.class, oldUploadId);
            jdbcTemplate.update(
                "UPDATE data_uploads SET row_count = ?, column_count = ?, data_fingerprint = ?, " +
                "updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                count, colCount, fingerprint, oldUploadId);
            return new int[] { count == null ? 0 : count, colCount == null ? 0 : colCount };
        });

        if (state == null) {
            int columnCount = previous.get("column_count") == null
                ? schema.fields().size() : ((Number) previous.get("column_count")).intValue();
            return new IngestResponse(
                oldUploadId.toString(), tableName, previousRows, columnCount, "UNCHANGED", null,
                "No new rows — data already present in version " + previousVersion + "."
            );
        }

        int total = state[0];
        int columnCount = state[1];
        int rowsAdded = total - previousRows;
        int columnsAdded = newCols.size();

        recordIngestionAudit(request.schemaId(), oldUploadId, request.originalFilename(),
            (long) total, "SUCCESS", null, request.userId());

        String message;
        if (columnsAdded > 0 && rowsAdded > 0) {
            message = "Detected " + rowsAdded + " new row(s) and " + columnsAdded +
                " new column(s) — appended to existing version " + previousVersion + " (no new version created).";
        } else if (columnsAdded > 0) {
            message = "Detected " + columnsAdded + " new column(s) — appended to existing version " +
                previousVersion + " (no new version created).";
        } else {
            message = "Detected new rows — appended to existing version " + previousVersion +
                " (no new version created).";
        }
        log.info("Schema-based ingestion APPENDED to version {}. Schema: {}, rows: {}, columns: {}.",
            previousVersion, schema.schemaName(), total, columnCount);
        return new IngestResponse(
            oldUploadId.toString(), tableName, total, columnCount, "APPENDED", null, message
        );
    }

    /** Materialises a full snapshot for the new upload (updated + unchanged + added rows) as a new version. */
    private IngestResponse createNewVersionSnapshot(
        UUID newUploadId, UUID oldUploadId, String tableName, String fingerprint, Schema schema,
        SchemaBasedIngestRequest request, List<String> allCols, String keyJoin
    ) {
        String qt = IdentifierNaming.quoteIdentifier(tableName);
        String insertCols = joinColumns(allCols, "%1$s", ", ");
        String selectCols = joinColumns(allCols, "o.%1$s", ", ");
        int versionNumber = nextVersionNumber(request.schemaId());

        Integer count = transactionTemplate.execute(status -> {
            // Copy forward previous-version rows NOT superseded by an incoming key, so the new upload holds
            // the complete dataset for this version (updated rows come from the incoming upload).
            Long offset = jdbcTemplate.queryForObject(
                "SELECT COALESCE(MAX(row_id), -1) + 1 FROM " + qt + " WHERE upload_id = ?",
                Long.class, newUploadId);
            jdbcTemplate.update(
                "INSERT INTO " + qt + " (upload_id, row_id, " + insertCols + ") " +
                "SELECT ?, o.row_id + ?, " + selectCols + " FROM " + qt + " o " +
                "WHERE o.upload_id = ? AND NOT EXISTS (" +
                "SELECT 1 FROM " + qt + " n WHERE n.upload_id = ? AND " + keyJoin + ")",
                newUploadId, offset == null ? 0L : offset, oldUploadId, newUploadId
            );
            Integer c = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM " + qt + " WHERE upload_id = ?", Integer.class, newUploadId);
            jdbcTemplate.update(
                "UPDATE data_uploads SET schema_id = ?, version_number = ?, data_fingerprint = ?, " +
                "row_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                request.schemaId(), versionNumber, fingerprint, c, newUploadId);
            return c;
        });

        int total = count == null ? 0 : count;
        recordIngestionAudit(request.schemaId(), newUploadId, request.originalFilename(),
            (long) total, "SUCCESS", null, request.userId());

        // Register this version in the data_versions table with checksum
        try {
            String jsonData = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(request.data());
            String checksum = VersioningUtil.calculateChecksumFromString(jsonData);

            RegisterVersionRequest versionRequest = new RegisterVersionRequest(
                request.schemaId().toString(),
                schema.schemaName(),
                tableName,
                checksum,
                total,
                request.originalFilename(),
                false,
                null,
                request.userId()
            );

            dataVersioningService.registerVersion(versionRequest);
            log.info("Version {} registered successfully for schema: {}", versionNumber, schema.schemaName());
        } catch (Exception e) {
            log.warn("Failed to register version in data_versions table, but snapshot creation succeeded", e);
            // Don't fail if version registration fails
        }

        log.info("Schema-based ingestion created NEW version {}. Schema: {}, snapshot rows: {}.",
            versionNumber, schema.schemaName(), total);
        return new IngestResponse(
            newUploadId.toString(), tableName, total, schema.fields().size(), "NEW_VERSION", null,
            "Detected changed rows — created new version " + versionNumber + "."
        );
    }

    /**
     * Fallback used when the schema declares no primary key: treat the upload as a FULL dataset and append
     * only when it is a strict superset of the previous version (every previous row still present, plus
     * more). Otherwise returns {@code null} so the caller creates a new version.
     */
    private IngestResponse tryWholeRowAppend(
        Map<String, Object> previous, UUID newUploadId, UUID oldUploadId, String tableName, String fingerprint,
        IngestResponse ingestResponse, Schema schema, SchemaBasedIngestRequest request, List<String> allCols
    ) {
        int newRowCount = ingestResponse.rowsInserted();
        int oldRowCount = previous.get("row_count") == null
            ? 0 : ((Number) previous.get("row_count")).intValue();
        if (newRowCount <= oldRowCount) {
            return null;
        }
        String qt = IdentifierNaming.quoteIdentifier(tableName);
        String cols = joinColumns(allCols, "%1$s", ", ");
        Integer missingOld = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM (" +
            "SELECT " + cols + " FROM " + qt + " WHERE upload_id = ? " +
            "EXCEPT SELECT " + cols + " FROM " + qt + " WHERE upload_id = ?) missing_rows",
            Integer.class, oldUploadId, newUploadId
        );
        if (missingOld == null || missingOld != 0) {
            return null; // some previous row is gone/changed -> treat as a new version
        }
        int previousVersion = previous.get("version_number") == null
            ? 1 : ((Number) previous.get("version_number")).intValue();
        int columnCount = previous.get("column_count") == null
            ? schema.fields().size() : ((Number) previous.get("column_count")).intValue();

        transactionTemplate.executeWithoutResult(status -> {
            jdbcTemplate.update("DELETE FROM " + qt + " WHERE upload_id = ?", oldUploadId);
            jdbcTemplate.update(
                "UPDATE " + qt + " SET upload_id = ? WHERE upload_id = ?", oldUploadId, newUploadId);
            jdbcTemplate.update("DELETE FROM field_metadata WHERE upload_id = ?", newUploadId);
            jdbcTemplate.update("DELETE FROM data_uploads WHERE id = ?", newUploadId);
            jdbcTemplate.update(
                "UPDATE data_uploads SET row_count = ?, data_fingerprint = ?, updated_at = CURRENT_TIMESTAMP " +
                "WHERE id = ?",
                newRowCount, fingerprint, oldUploadId);
        });

        recordIngestionAudit(request.schemaId(), oldUploadId, request.originalFilename(),
            (long) newRowCount, "SUCCESS", null, request.userId());
        return new IngestResponse(
            oldUploadId.toString(), tableName, newRowCount, columnCount, "APPENDED", null,
            "Detected added rows — appended to existing version " + previousVersion + " (no new version created)."
        );
    }

    /** Joins column names into a delimited SQL fragment, applying {@code template} (%1$s = quoted column). */
    private String joinColumns(List<String> cols, String template, String delimiter) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < cols.size(); i++) {
            if (i > 0) {
                sb.append(delimiter);
            }
            sb.append(String.format(template, IdentifierNaming.quoteIdentifier(cols.get(i))));
        }
        return sb.toString();
    }

    /** Returns the next monotonically increasing data version number for a schema (1-based). */
    private int nextVersionNumber(UUID schemaId) {
        Integer maxVersion = jdbcTemplate.queryForObject(
            "SELECT COALESCE(MAX(version_number), 0) FROM data_uploads WHERE schema_id = ?",
            Integer.class, schemaId
        );
        return (maxVersion == null ? 0 : maxVersion) + 1;
    }

    /**
     * Builds a stable, order-insensitive fingerprint of a dataset so identical re-uploads (even with
     * rows in a different order) produce the same hash. Any changed field value, added row, or removed
     * row changes the fingerprint and is therefore treated as a new version.
     */
    private String computeFingerprint(JsonNode data) {
        List<String> rows = new ArrayList<>();
        if (data != null && data.isArray()) {
            for (JsonNode row : data) {
                rows.add(canonicalizeRow(row));
            }
        } else if (data != null) {
            rows.add(canonicalizeRow(data));
        }
        Collections.sort(rows);
        return sha256(String.join("\n", rows));
    }

    /** Serializes a row's fields in name-sorted order so key order never affects the fingerprint. */
    private String canonicalizeRow(JsonNode row) {
        if (row == null || !row.isObject()) {
            return String.valueOf(row);
        }
        TreeMap<String, String> sorted = new TreeMap<>();
        row.fields().forEachRemaining(e -> sorted.put(e.getKey(), e.getValue().asText()));
        return sorted.toString();
    }

    private String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed on every JVM; fall back defensively.
            return Integer.toHexString(input.hashCode());
        }
    }

    private void recordIngestionAudit(
        UUID schemaId,
        UUID uploadId,
        String filename,
        long rowsIngested,
        String status,
        String validationErrors,
        String ingestedBy
    ) {
        try {
            jdbcTemplate.update(
                "INSERT INTO schema_data_ingestion " +
                "(id, schema_id, upload_id, data_file_name, rows_ingested, validation_status, validation_errors, ingestion_started_at, ingestion_completed_at, ingested_by) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?)",
                UUID.randomUUID(),
                schemaId,
                uploadId,
                filename,
                rowsIngested,
                status,
                validationErrors,
                Timestamp.valueOf(LocalDateTime.now()),
                Timestamp.valueOf(LocalDateTime.now()),
                ingestedBy
            );
        } catch (Exception e) {
            log.error("Failed to record ingestion audit log for schema {}", schemaId, e);
        }
    }
}
