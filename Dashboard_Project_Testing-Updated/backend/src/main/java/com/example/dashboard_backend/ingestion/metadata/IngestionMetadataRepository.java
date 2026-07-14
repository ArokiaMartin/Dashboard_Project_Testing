package com.example.dashboard_backend.ingestion.metadata;

import com.example.dashboard_backend.model.FieldAnalysis;
import jakarta.annotation.PostConstruct;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/**
 * Owns the platform's persistent bookkeeping tables and all writes to them: it provisions the core
 * tables on startup ({@code data_uploads}, {@code field_metadata}, {@code reports}, {@code widgets},
 * {@code audit_log}) and records each upload plus its per-field metadata. Isolating persistence here
 * keeps the ingestion pipeline classes free of catalog concerns.
 */
@Repository
public class IngestionMetadataRepository {

    private final JdbcTemplate jdbcTemplate;

    public IngestionMetadataRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void initializeCoreTables() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS data_uploads (
                  id UUID PRIMARY KEY,
                  user_id UUID NOT NULL,
                  table_name VARCHAR(255) UNIQUE NOT NULL,
                  original_filename VARCHAR(255),
                  row_count INT,
                  column_count INT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  status VARCHAR(50)
                )
                """);

        // Data versioning support: multiple data uploads for the same schema now share ONE physical
        // table (each upload is a distinct data version, identified by upload_id + version_number).
        // The table name therefore must no longer be globally unique.
        jdbcTemplate.execute("ALTER TABLE data_uploads DROP CONSTRAINT IF EXISTS data_uploads_table_name_key");
        jdbcTemplate.execute("ALTER TABLE data_uploads ADD COLUMN IF NOT EXISTS schema_id UUID");
        jdbcTemplate.execute("ALTER TABLE data_uploads ADD COLUMN IF NOT EXISTS version_number INT");
        // Content fingerprint of a version's data, so an identical re-upload can reuse the existing
        // version (same dashboard) instead of creating a duplicate version.
        jdbcTemplate.execute("ALTER TABLE data_uploads ADD COLUMN IF NOT EXISTS data_fingerprint VARCHAR(64)");

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS field_metadata (
                  id UUID PRIMARY KEY,
                  upload_id UUID REFERENCES data_uploads(id),
                  field_name VARCHAR(255),
                  normalized_field_name VARCHAR(255),
                  field_type VARCHAR(50),
                  display_name VARCHAR(255),
                  is_dimension BOOLEAN DEFAULT true,
                  is_measure BOOLEAN DEFAULT false,
                  distinct_count INT,
                  null_count INT,
                  min_value TEXT,
                  max_value TEXT,
                  UNIQUE(upload_id, field_name)
                )
                """);

        // Upgrade existing databases created with VARCHAR(255) metadata preview columns.
        jdbcTemplate.execute("ALTER TABLE field_metadata ALTER COLUMN min_value TYPE TEXT");
        jdbcTemplate.execute("ALTER TABLE field_metadata ALTER COLUMN max_value TYPE TEXT");

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS reports (
                  id UUID PRIMARY KEY,
                  user_id UUID NOT NULL,
                  upload_id UUID REFERENCES data_uploads(id),
                  title VARCHAR(255),
                  description TEXT,
                  configuration JSONB,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS widgets (
                  id UUID PRIMARY KEY,
                  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
                  chart_type VARCHAR(50),
                  dimensions JSONB,
                  measures JSONB,
                  filters JSONB,
                  sort_config JSONB,
                  position_row INT,
                  position_col INT,
                  width INT,
                  height INT,
                  query_sql TEXT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS audit_log (
                  id UUID PRIMARY KEY,
                  user_id UUID,
                  upload_id UUID REFERENCES data_uploads(id),
                  query_sql TEXT,
                  execution_time INT,
                  row_count INT,
                  status VARCHAR(50),
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """);
    }

    public void recordUpload(UUID uploadId, UUID userId, String rootTableName, String originalFilename,
                             long rootRowsInserted, int columnCount) {
        jdbcTemplate.update(
                """
                        INSERT INTO data_uploads (
                          id, user_id, table_name, original_filename, row_count, column_count, status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                uploadId, userId, rootTableName, originalFilename, rootRowsInserted, columnCount, "complete"
        );
    }

    public void saveFieldMetadata(UUID uploadId, String tablePath, List<FieldAnalysis> fields) {
        // Child-table fields are qualified with their table path (e.g. "orders.amount") so they stay
        // unique under the existing (upload_id, field_name) constraint without any schema migration.
        String prefix = tablePath.equals("root") ? "" : tablePath.substring("root.".length()) + ".";
        for (FieldAnalysis field : fields) {
            String qualifiedFieldName = prefix + field.fieldName();
            jdbcTemplate.update(
                    """
                            INSERT INTO field_metadata (
                              id, upload_id, field_name, normalized_field_name, field_type,
                              display_name, is_dimension, is_measure, distinct_count,
                              null_count, min_value, max_value
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT (upload_id, field_name)
                            DO UPDATE SET
                              normalized_field_name = EXCLUDED.normalized_field_name,
                              field_type = EXCLUDED.field_type,
                              display_name = EXCLUDED.display_name,
                              is_dimension = EXCLUDED.is_dimension,
                              is_measure = EXCLUDED.is_measure,
                              distinct_count = EXCLUDED.distinct_count,
                              null_count = EXCLUDED.null_count,
                              min_value = EXCLUDED.min_value,
                              max_value = EXCLUDED.max_value
                            """,
                    UUID.randomUUID(), uploadId, qualifiedFieldName, field.normalizedFieldName(), field.fieldType(),
                    qualifiedFieldName, field.isDimension(), field.isMeasure(), field.distinctCount(), field.nullCount(),
                    compactMetadataValue(field.minValue()), compactMetadataValue(field.maxValue())
            );
        }
    }

    private String compactMetadataValue(String value) {
        if (value == null) {
            return null;
        }
        int maxLength = 4000;
        if (value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength) + "...";
    }
}
