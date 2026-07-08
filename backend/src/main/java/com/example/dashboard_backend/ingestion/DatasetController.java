package com.example.dashboard_backend.ingestion;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@CrossOrigin(origins = "*")
@RequestMapping("/api/datasets")
public class DatasetController {

    /** Fixed UUID representing the single test user "user_123". */
    static final UUID USER_123 = UUID.fromString("00000000-0000-0000-0000-000000000123");

    private final JdbcTemplate jdbcTemplate;

    public DatasetController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** List all datasets uploaded by user_123. */
    @GetMapping
    public List<Map<String, Object>> listDatasets() {
        return jdbcTemplate.queryForList(
            "SELECT id, table_name, original_filename, row_count, column_count, status, created_at " +
            "FROM data_uploads ORDER BY created_at DESC"
        );
    }

    /** Get rows for a dataset (default 500, up to 10000 via ?limit=), with column names and types. */
    @GetMapping("/{uploadId}/rows")
    public ResponseEntity<Map<String, Object>> getRows(@PathVariable UUID uploadId,
                                                       @RequestParam(defaultValue = "500") int limit) {
        int rowLimit = Math.min(Math.max(limit, 1), 10000);
        List<Map<String, Object>> meta = jdbcTemplate.queryForList(
            "SELECT table_name FROM data_uploads WHERE id = ?",
            uploadId
        );
        if (meta.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        String tableName = (String) meta.get(0).get("table_name");

        List<Map<String, Object>> fields = jdbcTemplate.queryForList(
            "SELECT field_name, normalized_field_name, field_type FROM field_metadata WHERE upload_id = ? ORDER BY id",
            uploadId
        );

        // Display names (original CSV/JSON headers) shown to the user...
        List<String> columns = fields.stream()
            .map(f -> (String) f.get("field_name"))
            .collect(Collectors.toList());

        // ...and the actual DB column names (normalized/lowercased) used to query the table.
        List<String> dbColumns = fields.stream()
            .map(f -> (String) f.get("normalized_field_name"))
            .collect(Collectors.toList());

        List<String> types = fields.stream()
            .map(f -> (String) f.get("field_type"))
            .collect(Collectors.toList());

        List<Map<String, Object>> rows;
        if (dbColumns.isEmpty()) {
            rows = Collections.emptyList();
        } else {
            // Select real columns, but alias each back to its original header so the response
            // keys match the display column names.
            String colList = java.util.stream.IntStream.range(0, dbColumns.size())
                .mapToObj(i -> quoteIdentifier(dbColumns.get(i)) + " AS " + quoteIdentifier(columns.get(i)))
                .collect(Collectors.joining(", "));
            rows = jdbcTemplate.queryForList(
                "SELECT " + colList + " FROM " + quoteIdentifier(tableName) +
                " WHERE upload_id = ? ORDER BY row_id LIMIT " + rowLimit,
                uploadId
            );
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("columns", columns);
        result.put("types", types);
        result.put("rows", rows);
        return ResponseEntity.ok(result);
    }

    /**
     * Runs a grouped aggregation in PostgreSQL for one dataset (no 500-row cap — the DB does the work).
     * The table name is resolved from the trusted data_uploads record (never taken from the client), and
     * every dimension/measure name must exactly match a real column from field_metadata, so nothing
     * user-supplied is concatenated into SQL. Values (category filters) are passed as bind parameters.
     * Measures are CAST to numeric because the ingested columns are stored as TEXT.
     *
     * Body: { "dimension": "Region"|null, "measures": [{"field":"Sales","agg":"SUM"}],
     *         "filterValues": ["North",...]|null, "orderDesc": true|false|null, "limit": 1000|null }
     */
    @PostMapping("/{uploadId}/aggregate")
    public ResponseEntity<Map<String, Object>> aggregate(@PathVariable UUID uploadId,
                                                         @RequestBody Map<String, Object> body) {
        List<Map<String, Object>> meta = jdbcTemplate.queryForList(
            "SELECT table_name FROM data_uploads WHERE id = ?", uploadId);
        if (meta.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        String tableName = (String) meta.get(0).get("table_name");

        // Valid columns and which of them are numeric (safe to CAST + aggregate).
        List<Map<String, Object>> fm = jdbcTemplate.queryForList(
            "SELECT field_name, field_type FROM field_metadata WHERE upload_id = ?", uploadId);
        Set<String> validColumns = new HashSet<>();
        Set<String> numericColumns = new HashSet<>();
        for (Map<String, Object> f : fm) {
            String name = (String) f.get("field_name");
            validColumns.add(name);
            if ("numeric".equals(f.get("field_type"))) numericColumns.add(name);
        }

        String dimension = (String) body.get("dimension");
        if (dimension != null && !validColumns.contains(dimension)) {
            throw new IllegalArgumentException("Unknown dimension: " + dimension);
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> measures = (List<Map<String, Object>>) body.getOrDefault("measures", List.of());

        List<String> selectParts = new ArrayList<>();
        if (dimension != null) selectParts.add(quoteIdentifier(dimension));

        String firstMeasureExpr = null;
        for (Map<String, Object> m : measures) {
            String field = (String) m.get("field");
            String agg = String.valueOf(m.get("agg")).toUpperCase();
            if (!numericColumns.contains(field)) {
                throw new IllegalArgumentException("Not a numeric measure: " + field);
            }
            if (!Set.of("SUM", "AVG", "MIN", "MAX", "COUNT").contains(agg)) {
                throw new IllegalArgumentException("Invalid aggregation: " + agg);
            }
            String expr = agg + "(CAST(" + quoteIdentifier(field) + " AS NUMERIC))";
            if (firstMeasureExpr == null) firstMeasureExpr = expr;
            selectParts.add(expr + " AS " + quoteIdentifier(field));
        }
        if (selectParts.isEmpty()) {
            throw new IllegalArgumentException("At least one dimension or measure is required");
        }

        List<Object> params = new ArrayList<>();
        StringBuilder sql = new StringBuilder("SELECT ").append(String.join(", ", selectParts));
        sql.append(" FROM ").append(quoteIdentifier(tableName));
        sql.append(" WHERE upload_id = ?");
        params.add(uploadId);

        @SuppressWarnings("unchecked")
        List<Object> filterValues = (List<Object>) body.get("filterValues");
        if (dimension != null && filterValues != null && !filterValues.isEmpty()) {
            String placeholders = filterValues.stream().map(v -> "?").collect(Collectors.joining(", "));
            sql.append(" AND ").append(quoteIdentifier(dimension)).append(" IN (").append(placeholders).append(")");
            params.addAll(filterValues);
        }

        if (dimension != null) {
            sql.append(" GROUP BY ").append(quoteIdentifier(dimension));
        }

        // Top-N ordering by the first measure, when requested.
        Object orderDesc = body.get("orderDesc");
        if (orderDesc != null && firstMeasureExpr != null) {
            sql.append(" ORDER BY ").append(firstMeasureExpr).append(Boolean.TRUE.equals(orderDesc) ? " DESC" : " ASC");
        }

        int limit = body.get("limit") instanceof Number n ? n.intValue() : 1000;
        sql.append(" LIMIT ").append(Math.min(Math.max(limit, 1), 5000));

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql.toString(), params.toArray());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sql", sql.toString());
        result.put("rows", rows);
        return ResponseEntity.ok(result);
    }

    /** Delete a dataset: drop its data table, remove metadata and upload record. */
    @DeleteMapping("/{uploadId}")
    public ResponseEntity<Map<String, String>> deleteDataset(@PathVariable UUID uploadId) {
        List<Map<String, Object>> meta = jdbcTemplate.queryForList(
            "SELECT table_name FROM data_uploads WHERE id = ?",
            uploadId
        );
        if (meta.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        String tableName = (String) meta.get(0).get("table_name");

        try {
            jdbcTemplate.execute("DROP TABLE IF EXISTS " + quoteIdentifier(tableName));
        } catch (Exception ignored) { }

        jdbcTemplate.update("DELETE FROM field_metadata WHERE upload_id = ?", uploadId);
        jdbcTemplate.update("DELETE FROM data_uploads WHERE id = ?", uploadId);

        return ResponseEntity.ok(Map.of("message", "Dataset deleted"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleError(Exception ex) {
        return ResponseEntity.internalServerError()
            .body(Map.of("error", ex.getMessage() != null ? ex.getMessage() : "Internal error"));
    }

    private String quoteIdentifier(String name) {
        return "\"" + name.replace("\"", "\"\"") + "\"";
    }
}
