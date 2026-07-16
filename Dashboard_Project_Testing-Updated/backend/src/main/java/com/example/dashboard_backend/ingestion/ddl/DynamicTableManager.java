package com.example.dashboard_backend.ingestion.ddl;

import com.example.dashboard_backend.ingestion.model.TableSchema;
import com.example.dashboard_backend.ingestion.model.TableSchemaSet;
import com.example.dashboard_backend.ingestion.support.IdentifierNaming;
import com.example.dashboard_backend.model.FieldAnalysis;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Owns all dynamic DDL: turning a discovered {@link TableSchema} into a real PostgreSQL table (with
 * the {@code (upload_id, row_id)} composite key, the {@code (upload_id, parent_row_id)} foreign key
 * back to its parent, and dimension indexes), and resolving stable, unique, legal table names for
 * every table path in an upload.
 */
@Component
public class DynamicTableManager {

    private final JdbcTemplate jdbcTemplate;

    public DynamicTableManager(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void createDynamicTable(String tableName, List<FieldAnalysis> fields, String parentTableName) {
        StringBuilder ddl = new StringBuilder();
        ddl.append("CREATE TABLE IF NOT EXISTS ").append(IdentifierNaming.quoteIdentifier(tableName)).append(" (");
        ddl.append("upload_id UUID NOT NULL, ");
        ddl.append("row_id BIGINT NOT NULL");
        if (parentTableName != null) {
            ddl.append(", parent_row_id BIGINT NOT NULL");
        }

        for (FieldAnalysis field : fields) {
            ddl.append(", ")
                    .append(IdentifierNaming.quoteIdentifier(field.normalizedFieldName()))
                    .append(" ")
                    .append(toSqlType(field.fieldType()));
        }

        ddl.append(", PRIMARY KEY (upload_id, row_id)");
        if (parentTableName != null) {
            ddl.append(", FOREIGN KEY (upload_id, parent_row_id) REFERENCES ")
                    .append(IdentifierNaming.quoteIdentifier(parentTableName)).append(" (upload_id, row_id)");
        }
        ddl.append(")");
        jdbcTemplate.execute(ddl.toString());

        // Widen an existing table to accommodate columns introduced by a later upload (schema evolution).
        // ADD COLUMN IF NOT EXISTS is idempotent: a no-op on a freshly-created table, and additive when a
        // subsequent upload for the same table carries new fields.
        for (FieldAnalysis field : fields) {
            jdbcTemplate.execute("ALTER TABLE " + IdentifierNaming.quoteIdentifier(tableName) +
                    " ADD COLUMN IF NOT EXISTS " + IdentifierNaming.quoteIdentifier(field.normalizedFieldName()) +
                    " " + toSqlType(field.fieldType()));
        }

        for (FieldAnalysis field : fields) {
            if (field.isDimension()) {
                String indexName = IdentifierNaming.sanitizeIdentifier(tableName + "_" + field.normalizedFieldName() + "_idx", "idx");
                jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS " + IdentifierNaming.quoteIdentifier(indexName) +
                        " ON " + IdentifierNaming.quoteIdentifier(tableName) + " (" + IdentifierNaming.quoteIdentifier(field.normalizedFieldName()) + ")");
            }
        }
    }

    public String toSqlType(String fieldType) {
        return switch (fieldType) {
            case "numeric" -> "NUMERIC";
            case "boolean" -> "BOOLEAN";
            case "date" -> "TIMESTAMPTZ";
            default -> "TEXT";
        };
    }

    /** Resolves a stable, unique, Postgres-legal table name for every table path (root + each child). */
    public Map<String, String> resolveTableNames(TableSchemaSet schemas, String requestedTableName, UUID uploadId) {
        String rootName = (requestedTableName != null && !requestedTableName.isBlank())
                ? IdentifierNaming.sanitizeIdentifier(requestedTableName, "upload_" + IdentifierNaming.shortId(uploadId, 8))
                : "upload_" + IdentifierNaming.shortId(uploadId, 12);

        Map<String, String> names = new LinkedHashMap<>();
        Set<String> used = new HashSet<>();
        for (TableSchema schema : schemas.orderedParentFirst()) {
            String candidate;
            if (schema.tablePath().equals("root")) {
                candidate = rootName;
            } else {
                String suffix = schema.tablePath().substring("root.".length()).replace('.', '_');
                candidate = IdentifierNaming.sanitizeIdentifier(rootName + "_" + suffix, rootName + "_child");
            }
            candidate = IdentifierNaming.truncateForPostgres(candidate);
            String unique = candidate;
            int n = 1;
            while (!used.add(unique)) {
                n++;
                unique = IdentifierNaming.truncateForPostgres(candidate) + "_" + n;
            }
            names.put(schema.tablePath(), unique);
        }
        return names;
    }

    public static String parentPathOf(String path) {
        int idx = path.lastIndexOf('.');
        return idx < 0 ? "root" : path.substring(0, idx);
    }
}
