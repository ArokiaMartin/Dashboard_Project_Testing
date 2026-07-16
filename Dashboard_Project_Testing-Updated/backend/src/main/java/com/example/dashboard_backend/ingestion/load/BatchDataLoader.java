package com.example.dashboard_backend.ingestion.load;

import com.example.dashboard_backend.ingestion.support.IdentifierNaming;
import com.example.dashboard_backend.ingestion.support.JsonValueSupport;
import com.example.dashboard_backend.model.FieldAnalysis;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

/**
 * Loads the inline-data ingestion path (small payloads provided directly in the request body) via a
 * single JDBC batch insert per table, binding each value with the column's inferred type.
 */
@Component
public class BatchDataLoader {

    private final JdbcTemplate jdbcTemplate;

    public BatchDataLoader(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public long batchInsertRows(String tableName, boolean hasParent, UUID uploadId,
                                List<LinkedHashMap<String, JsonNode>> rows, List<Long> parentIds,
                                List<FieldAnalysis> fields) {
        if (rows.isEmpty()) {
            return 0;
        }

        StringBuilder sql = new StringBuilder();
        sql.append("INSERT INTO ").append(IdentifierNaming.quoteIdentifier(tableName)).append(" (upload_id, row_id");
        if (hasParent) sql.append(", parent_row_id");
        for (FieldAnalysis field : fields) sql.append(", ").append(IdentifierNaming.quoteIdentifier(field.normalizedFieldName()));
        sql.append(") VALUES (?, ?");
        if (hasParent) sql.append(", ?");
        sql.append(", ?".repeat(fields.size())).append(")");

        jdbcTemplate.batchUpdate(sql.toString(), new BatchPreparedStatementSetter() {
            @Override
            public void setValues(PreparedStatement ps, int i) throws SQLException {
                LinkedHashMap<String, JsonNode> row = rows.get(i);
                int idx = 1;
                ps.setObject(idx++, uploadId);
                ps.setLong(idx++, i + 1L);
                if (hasParent) {
                    Long parentId = parentIds.get(i);
                    ps.setObject(idx++, parentId);
                }
                for (FieldAnalysis field : fields) {
                    setTypedValue(ps, idx++, row.get(field.fieldName()), field.fieldType());
                }
            }

            @Override
            public int getBatchSize() {
                return rows.size();
            }
        });

        return rows.size();
    }

    private void setTypedValue(PreparedStatement ps, int index, JsonNode value, String fieldType) throws SQLException {
        if (value == null || value.isNull() || value.isMissingNode()) {
            ps.setObject(index, null);
            return;
        }
        switch (fieldType) {
            case "numeric" -> {
                try {
                    ps.setBigDecimal(index, new BigDecimal(value.isNumber() ? value.numberValue().toString() : value.asText().trim()));
                } catch (NumberFormatException ex) {
                    ps.setObject(index, null);
                }
            }
            case "boolean" -> {
                Boolean b = JsonValueSupport.coerceBoolean(value);
                if (b != null) ps.setBoolean(index, b); else ps.setObject(index, null);
            }
            case "date" -> ps.setTimestamp(index, JsonValueSupport.parseTimestamp(value));
            default -> ps.setString(index, value.isTextual() ? value.asText() : value.toString());
        }
    }
}
