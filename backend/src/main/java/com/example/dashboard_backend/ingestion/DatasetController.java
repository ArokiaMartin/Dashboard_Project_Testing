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

    /** Get up to 500 rows for a dataset, with column names and types. */
    @GetMapping("/{uploadId}/rows")
    public ResponseEntity<Map<String, Object>> getRows(@PathVariable UUID uploadId) {
        List<Map<String, Object>> meta = jdbcTemplate.queryForList(
            "SELECT table_name FROM data_uploads WHERE id = ?",
            uploadId
        );
        if (meta.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        String tableName = (String) meta.get(0).get("table_name");

        List<Map<String, Object>> fields = jdbcTemplate.queryForList(
            "SELECT field_name, field_type FROM field_metadata WHERE upload_id = ? ORDER BY id",
            uploadId
        );

        List<String> columns = fields.stream()
            .map(f -> (String) f.get("field_name"))
            .collect(Collectors.toList());

        List<String> types = fields.stream()
            .map(f -> (String) f.get("field_type"))
            .collect(Collectors.toList());

        List<Map<String, Object>> rows;
        if (columns.isEmpty()) {
            rows = Collections.emptyList();
        } else {
            String colList = columns.stream()
                .map(this::quoteIdentifier)
                .collect(Collectors.joining(", "));
            rows = jdbcTemplate.queryForList(
                "SELECT " + colList + " FROM " + quoteIdentifier(tableName) +
                " WHERE upload_id = ? ORDER BY row_id LIMIT 500",
                uploadId
            );
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("columns", columns);
        result.put("types", types);
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
