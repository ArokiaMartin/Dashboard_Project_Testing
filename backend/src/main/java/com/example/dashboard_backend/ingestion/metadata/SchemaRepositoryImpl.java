package com.example.dashboard_backend.ingestion.metadata;

import com.example.dashboard_backend.ingestion.model.Schema;
import com.example.dashboard_backend.ingestion.model.SchemaField;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class SchemaRepositoryImpl implements SchemaRepository {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public SchemaRepositoryImpl(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper,
                                IngestionMetadataRepository ingestionMetadataRepository) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        // Declaring the dependency guarantees the core tables (notably data_uploads, referenced by a
        // foreign key below) are provisioned before this repository initializes its own tables.
    }

    @PostConstruct
    public void initializeSchemaTables() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS schemas (
                  id UUID PRIMARY KEY,
                  user_id UUID NOT NULL,
                  schema_name VARCHAR(255) NOT NULL,
                  schema_version INTEGER NOT NULL DEFAULT 1,
                  schema_definition JSONB NOT NULL,
                  description TEXT,
                  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
                  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  created_by VARCHAR(255),
                  updated_by VARCHAR(255),
                  CONSTRAINT unique_schema_per_user UNIQUE(user_id, schema_name, schema_version)
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS schema_audit_log (
                  id UUID PRIMARY KEY,
                  schema_id UUID NOT NULL REFERENCES schemas(id) ON DELETE CASCADE,
                  action VARCHAR(50) NOT NULL,
                  old_definition JSONB,
                  new_definition JSONB,
                  changed_by VARCHAR(255),
                  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  reason TEXT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS schema_data_ingestion (
                  id UUID PRIMARY KEY,
                  schema_id UUID NOT NULL REFERENCES schemas(id),
                  upload_id UUID NOT NULL,
                  data_file_name VARCHAR(255),
                  rows_ingested BIGINT,
                  validation_status VARCHAR(50) NOT NULL,
                  validation_errors JSONB,
                  ingestion_started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  ingestion_completed_at TIMESTAMP,
                  ingested_by VARCHAR(255),
                  CONSTRAINT fk_upload_to_data_uploads FOREIGN KEY(upload_id) REFERENCES data_uploads(id)
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS schema_fields (
                  id UUID PRIMARY KEY,
                  schema_id UUID NOT NULL REFERENCES schemas(id) ON DELETE CASCADE,
                  field_name VARCHAR(255) NOT NULL,
                  field_type VARCHAR(50) NOT NULL,
                  is_required BOOLEAN NOT NULL DEFAULT false,
                  is_dimension BOOLEAN,
                  is_measure BOOLEAN,
                  is_primary_key BOOLEAN NOT NULL DEFAULT false,
                  description TEXT,
                  validation_rules JSONB,
                  position INTEGER,
                  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  CONSTRAINT unique_field_per_schema UNIQUE(schema_id, field_name)
                )
                """);

        // Backfill for pre-existing deployments where schema_fields predates the primary-key column.
        jdbcTemplate.execute("ALTER TABLE schema_fields ADD COLUMN IF NOT EXISTS is_primary_key BOOLEAN NOT NULL DEFAULT false");

        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_schemas_user_id ON schemas(user_id)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_schemas_status ON schemas(status)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_schemas_created_at ON schemas(created_at DESC)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_schema_audit_schema_id ON schema_audit_log(schema_id)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_schema_ingestion_schema_id ON schema_data_ingestion(schema_id)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_schema_ingestion_upload_id ON schema_data_ingestion(upload_id)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_schema_fields_schema_id ON schema_fields(schema_id)");
    }

    @Override
    @Transactional
    public Schema save(Schema schema) {
        String jsonDef;
        try {
            jsonDef = objectMapper.writeValueAsString(schema.schemaDefinition());
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize schema definition", e);
        }

        jdbcTemplate.update(
            "INSERT INTO schemas (id, user_id, schema_name, schema_version, schema_definition, description, status, created_at, updated_at, created_by, updated_by) " +
            "VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?) " +
            "ON CONFLICT (user_id, schema_name, schema_version) DO UPDATE SET " +
            "schema_definition = ?::jsonb, description = ?, updated_at = ?, updated_by = ?",
            schema.id(),
            schema.userId(),
            schema.schemaName(),
            schema.schemaVersion(),
            jsonDef,
            schema.description(),
            schema.status(),
            Timestamp.valueOf(schema.createdAt()),
            Timestamp.valueOf(schema.updatedAt()),
            schema.createdBy(),
            schema.updatedBy(),
            jsonDef,
            schema.description(),
            Timestamp.valueOf(schema.updatedAt()),
            schema.updatedBy()
        );

        return schema;
    }

    @Override
    public Optional<Schema> findById(UUID id) {
        List<Schema> schemas = jdbcTemplate.query(
            "SELECT id, user_id, schema_name, schema_version, schema_definition, description, status, created_at, updated_at, created_by, updated_by " +
            "FROM schemas WHERE id = ?",
            schemaRowMapper(),
            id
        );
        return schemas.stream().findFirst().map(this::enrichWithFields);
    }

    @Override
    public List<Schema> findByUserId(UUID userId) {
        List<Schema> schemas = jdbcTemplate.query(
            "SELECT id, user_id, schema_name, schema_version, schema_definition, description, status, created_at, updated_at, created_by, updated_by " +
            "FROM schemas WHERE user_id = ? ORDER BY created_at DESC",
            schemaRowMapper(),
            userId
        );
        return schemas.stream().map(this::enrichWithFields).toList();
    }

    @Override
    public List<Schema> findByUserIdAndStatus(UUID userId, String status) {
        List<Schema> schemas = jdbcTemplate.query(
            "SELECT id, user_id, schema_name, schema_version, schema_definition, description, status, created_at, updated_at, created_by, updated_by " +
            "FROM schemas WHERE user_id = ? AND status = ? ORDER BY created_at DESC",
            schemaRowMapper(),
            userId,
            status
        );
        return schemas.stream().map(this::enrichWithFields).toList();
    }

    @Override
    public Optional<Schema> findLatestByNameAndUserId(String schemaName, UUID userId) {
        List<Schema> schemas = jdbcTemplate.query(
            "SELECT id, user_id, schema_name, schema_version, schema_definition, description, status, created_at, updated_at, created_by, updated_by " +
            "FROM schemas WHERE schema_name = ? AND user_id = ? ORDER BY schema_version DESC LIMIT 1",
            schemaRowMapper(),
            schemaName,
            userId
        );
        return schemas.stream().findFirst().map(this::enrichWithFields);
    }

    @Override
    @Transactional
    public void delete(UUID schemaId) {
        jdbcTemplate.update("DELETE FROM schema_fields WHERE schema_id = ?", schemaId);
        jdbcTemplate.update("DELETE FROM schema_audit_log WHERE schema_id = ?", schemaId);
        jdbcTemplate.update("DELETE FROM schemas WHERE id = ?", schemaId);
    }

    @Override
    @Transactional
    public void updateStatus(UUID schemaId, String status) {
        jdbcTemplate.update(
            "UPDATE schemas SET status = ?, updated_at = ? WHERE id = ?",
            status,
            Timestamp.valueOf(LocalDateTime.now()),
            schemaId
        );
    }

    @Override
    @Transactional
    public void saveFields(UUID schemaId, List<SchemaField> fields) {
        jdbcTemplate.update("DELETE FROM schema_fields WHERE schema_id = ?", schemaId);

        for (SchemaField field : fields) {
            String validationRulesJson;
            try {
                validationRulesJson = field.validationRules() != null ?
                    objectMapper.writeValueAsString(field.validationRules()) : null;
            } catch (JsonProcessingException e) {
                throw new RuntimeException("Failed to serialize validation rules", e);
            }

            jdbcTemplate.update(
                "INSERT INTO schema_fields (id, schema_id, field_name, field_type, is_required, is_dimension, is_measure, is_primary_key, description, validation_rules, position, created_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?)",
                field.id(),
                schemaId,
                field.fieldName(),
                field.fieldType(),
                field.isRequired(),
                field.isDimension(),
                field.isMeasure(),
                Boolean.TRUE.equals(field.isPrimaryKey()),
                field.description(),
                validationRulesJson,
                field.position(),
                Timestamp.valueOf(LocalDateTime.now())
            );
        }
    }

    @Override
    public List<SchemaField> findFieldsBySchemaId(UUID schemaId) {
        return jdbcTemplate.query(
            "SELECT id, schema_id, field_name, field_type, is_required, is_dimension, is_measure, is_primary_key, description, validation_rules, position " +
            "FROM schema_fields WHERE schema_id = ? ORDER BY position ASC",
            (rs, rowNum) -> {
                JsonNode validationRules = null;
                try {
                    String rulesJson = rs.getString("validation_rules");
                    if (rulesJson != null) {
                        validationRules = objectMapper.readTree(rulesJson);
                    }
                } catch (Exception e) {
                    // Ignore parse errors
                }

                return new SchemaField(
                    UUID.fromString(rs.getString("id")),
                    UUID.fromString(rs.getString("schema_id")),
                    rs.getString("field_name"),
                    rs.getString("field_type"),
                    (Boolean) rs.getObject("is_required"),
                    (Boolean) rs.getObject("is_dimension"),
                    (Boolean) rs.getObject("is_measure"),
                    (Boolean) rs.getObject("is_primary_key"),
                    rs.getString("description"),
                    validationRules,
                    (Integer) rs.getObject("position")
                );
            },
            schemaId
        );
    }

    @Override
    @Transactional
    public void recordAuditLog(UUID schemaId, String action, String oldDef, String newDef, String changedBy, String reason) {
        jdbcTemplate.update(
            "INSERT INTO schema_audit_log (id, schema_id, action, old_definition, new_definition, changed_by, changed_at, reason) " +
            "VALUES (?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?)",
            UUID.randomUUID(),
            schemaId,
            action,
            oldDef,
            newDef,
            changedBy,
            Timestamp.valueOf(LocalDateTime.now()),
            reason
        );
    }

    @Override
    public boolean existsByNameAndUserId(String schemaName, UUID userId) {
        Integer count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM schemas WHERE schema_name = ? AND user_id = ? AND status = 'ACTIVE'",
            Integer.class,
            schemaName,
            userId
        );
        return count != null && count > 0;
    }

    private RowMapper<Schema> schemaRowMapper() {
        return (rs, rowNum) -> {
            JsonNode schemaDef = null;
            try {
                String defJson = rs.getString("schema_definition");
                if (defJson != null) {
                    schemaDef = objectMapper.readTree(defJson);
                }
            } catch (Exception e) {
                // Ignore parse errors
            }

            return new Schema(
                UUID.fromString(rs.getString("id")),
                UUID.fromString(rs.getString("user_id")),
                rs.getString("schema_name"),
                rs.getInt("schema_version"),
                schemaDef,
                rs.getString("description"),
                rs.getString("status"),
                new ArrayList<>(),
                rs.getTimestamp("created_at").toLocalDateTime(),
                rs.getTimestamp("updated_at").toLocalDateTime(),
                rs.getString("created_by"),
                rs.getString("updated_by")
            );
        };
    }

    private Schema enrichWithFields(Schema schema) {
        List<SchemaField> fields = findFieldsBySchemaId(schema.id());
        return new Schema(
            schema.id(),
            schema.userId(),
            schema.schemaName(),
            schema.schemaVersion(),
            schema.schemaDefinition(),
            schema.description(),
            schema.status(),
            fields,
            schema.createdAt(),
            schema.updatedAt(),
            schema.createdBy(),
            schema.updatedBy()
        );
    }
}
