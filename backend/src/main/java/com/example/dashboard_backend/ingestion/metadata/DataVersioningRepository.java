package com.example.dashboard_backend.ingestion.metadata;

import com.example.dashboard_backend.model.DataVersion;
import jakarta.annotation.PostConstruct;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Manages data versioning for schemas: tracks checksums, detects duplicates,
 * and maintains version metadata (row counts, file names, timestamps).
 */
@Repository
public class DataVersioningRepository {

    private final JdbcTemplate jdbcTemplate;

    public DataVersioningRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void initializeVersioningTable() {
        // Create data_versions table for checksum-based deduplication
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS data_versions (
                  version_id VARCHAR(255) PRIMARY KEY,
                  schema_id UUID NOT NULL,
                  schema_name VARCHAR(255) NOT NULL,
                  table_name VARCHAR(255) NOT NULL,
                  checksum VARCHAR(255) UNIQUE NOT NULL,
                  row_count INT NOT NULL,
                  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  file_name VARCHAR(255),
                  version_number INT NOT NULL,
                  is_duplicate BOOLEAN DEFAULT FALSE,
                  original_version_id VARCHAR(255),
                  created_by VARCHAR(255),
                  FOREIGN KEY (schema_id) REFERENCES schemas(id),
                  FOREIGN KEY (original_version_id) REFERENCES data_versions(version_id),
                  UNIQUE (schema_id, checksum)
                )
                """);

        // Create indexes for efficient queries
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_data_versions_schema_id ON data_versions(schema_id)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_data_versions_checksum ON data_versions(checksum)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_data_versions_schema_version ON data_versions(schema_id, version_number)");
    }

    /**
     * Check if data with this checksum already exists for the schema
     */
    public Optional<DataVersion> findByChecksumAndSchema(String schemaId, String checksum) {
        return jdbcTemplate.query(
                "SELECT * FROM data_versions WHERE schema_id = CAST(? AS uuid) AND checksum = ?",
                this::mapRowToDataVersion,
                schemaId, checksum
        ).stream().findFirst();
    }

    /**
     * Register a new version with metadata
     */
    public DataVersion registerVersion(String schemaId, String schemaName, String tableName,
                                       String checksum, int rowCount, String fileName,
                                       boolean isDuplicate, String originalVersionId, String createdBy) {
        String versionId = "v_" + UUID.randomUUID().toString().substring(0, 8);

        // Get next version number for this schema
        int versionNumber = getNextVersionNumber(schemaId);

        LocalDateTime uploadedAt = LocalDateTime.now();

        jdbcTemplate.update(
                """
                        INSERT INTO data_versions (
                          version_id, schema_id, schema_name, table_name, checksum,
                          row_count, uploaded_at, file_name, version_number,
                          is_duplicate, original_version_id, created_by
                        ) VALUES (?, CAST(? AS uuid), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                versionId, schemaId, schemaName, tableName, checksum,
                rowCount, uploadedAt, fileName, versionNumber,
                isDuplicate, originalVersionId, createdBy
        );

        return new DataVersion(
                versionId, schemaId, schemaName, tableName, checksum,
                rowCount, uploadedAt, fileName, versionNumber,
                isDuplicate, originalVersionId, createdBy
        );
    }

    /**
     * Get all versions for a schema, ordered by version number
     */
    public List<DataVersion> getVersionsBySchema(String schemaId) {
        return jdbcTemplate.query(
                "SELECT * FROM data_versions WHERE schema_id = CAST(? AS uuid) ORDER BY version_number ASC",
                this::mapRowToDataVersion,
                schemaId
        );
    }

    /**
     * Get a specific version by ID
     */
    public Optional<DataVersion> getVersionById(String versionId) {
        return jdbcTemplate.query(
                "SELECT * FROM data_versions WHERE version_id = ?",
                this::mapRowToDataVersion,
                versionId
        ).stream().findFirst();
    }

    /**
     * Delete a version (cascade should handle related data)
     */
    public void deleteVersion(String versionId) {
        jdbcTemplate.update("DELETE FROM data_versions WHERE version_id = ?", versionId);
    }

    /**
     * Get the next sequential version number for a schema
     */
    private int getNextVersionNumber(String schemaId) {
        List<Integer> result = jdbcTemplate.query(
                "SELECT COALESCE(MAX(version_number), 0) + 1 FROM data_versions WHERE schema_id = CAST(? AS uuid)",
                (rs, rowNum) -> rs.getInt(1),
                schemaId
        );
        return result.isEmpty() ? 1 : result.get(0);
    }

    /**
     * Map a result set row to a DataVersion object
     */
    private DataVersion mapRowToDataVersion(ResultSet rs, int rowNum) throws SQLException {
        return new DataVersion(
                rs.getString("version_id"),
                rs.getString("schema_id"),
                rs.getString("schema_name"),
                rs.getString("table_name"),
                rs.getString("checksum"),
                rs.getInt("row_count"),
                rs.getTimestamp("uploaded_at").toLocalDateTime(),
                rs.getString("file_name"),
                rs.getInt("version_number"),
                rs.getBoolean("is_duplicate"),
                rs.getString("original_version_id"),
                rs.getString("created_by")
        );
    }
}
