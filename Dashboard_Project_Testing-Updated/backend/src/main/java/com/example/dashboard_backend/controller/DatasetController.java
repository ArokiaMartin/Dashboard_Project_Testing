package com.example.dashboard_backend.controller;

import com.example.dashboard_backend.util.SqlIdentifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/datasets")
public class DatasetController {

    private static final Logger log = LoggerFactory.getLogger(DatasetController.class);


    private final JdbcTemplate jdbcTemplate;

    public DatasetController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Reads an optional integer "limit" from a POST request body, tolerating JSON numbers or numeric strings. */
    private static int extractLimit(Map<String, Object> body, int defaultValue) {
        if (body == null) {
            return defaultValue;
        }
        Object value = body.get("limit");
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            try {
                return Integer.parseInt(text.trim());
            } catch (NumberFormatException ignored) {
                return defaultValue;
            }
        }
        return defaultValue;
    }

    /** List all datasets uploaded by user_123. */
    @GetMapping
    public List<Map<String, Object>> listDatasets() {
        return jdbcTemplate.queryForList(
            "SELECT id, table_name, original_filename, row_count, column_count, status, created_at, " +
            "schema_id, version_number " +
            "FROM data_uploads ORDER BY created_at DESC"
        );
    }

    /** Get rows for a dataset (default 500, up to 10000 via a JSON body {"limit": n}), with column names and types. */
    @PostMapping("/{uploadId}/rows")
    public ResponseEntity<Map<String, Object>> getRows(@PathVariable UUID uploadId,
                                                       @RequestBody(required = false) Map<String, Object> body) {
        int rowLimit = Math.min(Math.max(extractLimit(body, 500), 1), 10000);
        List<Map<String, Object>> meta = jdbcTemplate.queryForList(
            "SELECT table_name FROM data_uploads WHERE id = ?",
            uploadId
        );
        if (meta.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        String tableName = (String) meta.get(0).get("table_name");

        List<Map<String, Object>> allFields = jdbcTemplate.queryForList(
            "SELECT field_name, normalized_field_name, field_type FROM field_metadata WHERE upload_id = ? ORDER BY id",
            uploadId
        );

        // A nested JSON upload stores field metadata for its root table AND every generated child
        // table under the same upload_id. Only the root table is shown here, so keep just the fields
        // whose column actually exists on that table — otherwise the SELECT would reference child-only
        // columns (e.g. array element fields) that don't exist on the root table.
        Set<String> realColumns = new HashSet<>(jdbcTemplate.queryForList(
            "SELECT column_name FROM information_schema.columns " +
            "WHERE table_schema = current_schema() AND table_name = ?",
            String.class, tableName
        ));
        List<Map<String, Object>> fields = allFields.stream()
            .filter(f -> realColumns.contains((String) f.get("normalized_field_name")))
            .collect(Collectors.toList());

        // Display names (original CSV/JSON headers) shown to the user...
        List<String> columns = fields.stream()
            .map(f -> (String) f.get("field_name"))
            .collect(Collectors.toList());

        // ...and the actual DB column names (normalized/lowercased) used to query the table.
        List<String> normalizedColumns = fields.stream()
            .map(f -> (String) f.get("normalized_field_name"))
            .collect(Collectors.toList());

        List<String> types = fields.stream()
            .map(f -> (String) f.get("field_type"))
            .collect(Collectors.toList());

        List<Map<String, Object>> rows;
        if (normalizedColumns.isEmpty()) {
            rows = Collections.emptyList();
        } else {
            // Select real columns, but alias each back to its original header so the response
            // keys match the display column names.
            String colList = java.util.stream.IntStream.range(0, normalizedColumns.size())
                .mapToObj(i -> quoteIdentifier(normalizedColumns.get(i)) + " AS " + quoteIdentifier(columns.get(i)))
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
     * Returns every physical table that belongs to a dataset — the root table plus all generated child
     * tables. A nested JSON array becomes its own child table (named {@code <root>_<field>}) carrying a
     * {@code parent_row_id} back to its parent. Each entry ships its display columns, types and rows so
     * the UI can render the full nested structure, not just the root.
     */
    @GetMapping("/{uploadId}/tables")
    public ResponseEntity<Map<String, Object>> getTables(@PathVariable UUID uploadId,
                                                        @RequestParam(defaultValue = "500") int limit) {
        int rowLimit = Math.min(Math.max(limit, 1), 10000);
        List<Map<String, Object>> meta = jdbcTemplate.queryForList(
            "SELECT table_name, original_filename FROM data_uploads WHERE id = ?", uploadId);
        if (meta.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        String rootTable = (String) meta.get(0).get("table_name");
        String originalFilename = (String) meta.get(0).get("original_filename");

        // Display labels + types for the upload's fields. Child fields are stored as dotted paths
        // (e.g. "orders.amount"); map each normalized column to its leaf label and inferred type.
        List<Map<String, Object>> allFields = jdbcTemplate.queryForList(
            "SELECT field_name, normalized_field_name, field_type FROM field_metadata WHERE upload_id = ? ORDER BY id",
            uploadId);
        Map<String, String> displayByNorm = new HashMap<>();
        Map<String, String> typeByNorm = new HashMap<>();
        for (Map<String, Object> f : allFields) {
            String fieldName = (String) f.get("field_name");
            String normalized = (String) f.get("normalized_field_name");
            String fieldType = (String) f.get("field_type");
            String leaf = fieldName != null && fieldName.contains(".")
                ? fieldName.substring(fieldName.lastIndexOf('.') + 1) : fieldName;
            displayByNorm.putIfAbsent(normalized, leaf);
            typeByNorm.putIfAbsent(normalized, fieldType);
        }

        // Root first, then its child tables. Child tables are the ones with a parent_row_id column whose
        // physical name starts with the root table name; names come from the catalog so we never guess.
        List<String> parentTables = jdbcTemplate.queryForList(
            "SELECT table_name FROM information_schema.columns " +
            "WHERE table_schema = current_schema() AND column_name = 'parent_row_id'",
            String.class);
        List<String> tableNames = new ArrayList<>();
        tableNames.add(rootTable);
        parentTables.stream()
            .filter(t -> t.startsWith(rootTable + "_"))
            .distinct()
            .sorted()
            .forEach(tableNames::add);

        List<Map<String, Object>> tables = new ArrayList<>();
        for (String tableName : tableNames) {
            boolean isRoot = tableName.equals(rootTable);

            List<String> normalizedColumns = jdbcTemplate.queryForList(
                "SELECT column_name FROM information_schema.columns " +
                "WHERE table_schema = current_schema() AND table_name = ? " +
                "AND column_name NOT IN ('upload_id', 'row_id', 'parent_row_id') " +
                "ORDER BY ordinal_position",
                String.class, tableName);
            if (normalizedColumns.isEmpty()) {
                continue;
            }

            // A child table's physical rows are shared across versions; skip it when this upload has none.
            if (!isRoot) {
                Integer rowCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM " + quoteIdentifier(tableName) + " WHERE upload_id = ?",
                    Integer.class, uploadId);
                if (rowCount == null || rowCount == 0) {
                    continue;
                }
            }

            // Friendly labels (deduplicated so aliased result keys stay unique) and matching types.
            List<String> columns = new ArrayList<>();
            List<String> types = new ArrayList<>();
            Set<String> usedLabels = new HashSet<>();
            for (String normalized : normalizedColumns) {
                String label = displayByNorm.getOrDefault(normalized, normalized);
                if (!usedLabels.add(label)) {
                    String base = normalized;
                    label = base;
                    int k = 2;
                    while (!usedLabels.add(label)) {
                        label = base + "_" + k++;
                    }
                }
                columns.add(label);
                types.add(typeByNorm.getOrDefault(normalized, "string"));
            }

            String colList = java.util.stream.IntStream.range(0, normalizedColumns.size())
                .mapToObj(i -> quoteIdentifier(normalizedColumns.get(i)) + " AS " + quoteIdentifier(columns.get(i)))
                .collect(Collectors.joining(", "));
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT " + colList + " FROM " + quoteIdentifier(tableName) +
                " WHERE upload_id = ? ORDER BY row_id LIMIT " + rowLimit,
                uploadId);

            String title = isRoot
                ? (originalFilename != null && !originalFilename.isBlank() ? originalFilename : rootTable)
                : tableName.substring(rootTable.length() + 1);

            Map<String, Object> table = new LinkedHashMap<>();
            table.put("tableName", tableName);
            table.put("title", title);
            table.put("isRoot", isRoot);
            table.put("columns", columns);
            table.put("types", types);
            table.put("rows", rows);
            tables.add(table);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tables", tables);
        return ResponseEntity.ok(result);
    }

    /**
     * Returns a single flat rowset that combines the root table with every one of its nested child
     * tables, so the dashboard builder can offer all fields (top-level and nested) in one field list.
     * Each child table is LEFT JOINed to its parent on {@code parent_row_id} (parents with no child
     * rows are still returned). Column keys are the friendly field names, de-duplicated on clash.
     * Note: two independent sibling collections under the same parent produce a cartesian expansion,
     * which is the inherent cost of flattening several nested arrays into one table.
     */
    @PostMapping("/{uploadId}/flat-rows")
    public ResponseEntity<Map<String, Object>> getFlatRows(@PathVariable UUID uploadId,
                                                          @RequestBody(required = false) Map<String, Object> body) {
        int rowLimit = Math.min(Math.max(extractLimit(body, 10000), 1), 50000);
        List<Map<String, Object>> meta = jdbcTemplate.queryForList(
            "SELECT table_name FROM data_uploads WHERE id = ?", uploadId);
        if (meta.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        String rootTable = (String) meta.get(0).get("table_name");

        // Friendly label + type for each normalized column (leaf of the dotted field_name).
        List<Map<String, Object>> allFields = jdbcTemplate.queryForList(
            "SELECT field_name, normalized_field_name, field_type FROM field_metadata WHERE upload_id = ? ORDER BY id",
            uploadId);
        Map<String, String> displayByNorm = new HashMap<>();
        Map<String, String> typeByNorm = new HashMap<>();
        for (Map<String, Object> f : allFields) {
            String fieldName = (String) f.get("field_name");
            String normalized = (String) f.get("normalized_field_name");
            String fieldType = (String) f.get("field_type");
            String leaf = fieldName != null && fieldName.contains(".")
                ? fieldName.substring(fieldName.lastIndexOf('.') + 1) : fieldName;
            displayByNorm.putIfAbsent(normalized, leaf);
            typeByNorm.putIfAbsent(normalized, fieldType);
        }

        // Child tables (have parent_row_id, name prefixed by "<root>_"), shortest-name first so a
        // table's parent is always seen before the table itself.
        List<String> childTables = jdbcTemplate.queryForList(
            "SELECT table_name FROM information_schema.columns " +
            "WHERE table_schema = current_schema() AND column_name = 'parent_row_id'",
            String.class).stream()
            .filter(t -> t.startsWith(rootTable + "_"))
            .distinct()
            .sorted(Comparator.comparingInt(String::length).thenComparing(Comparator.naturalOrder()))
            .collect(Collectors.toList());

        List<String> orderedTables = new ArrayList<>();
        orderedTables.add(rootTable);
        orderedTables.addAll(childTables);
        Map<String, String> aliasOf = new HashMap<>();
        for (int i = 0; i < orderedTables.size(); i++) {
            aliasOf.put(orderedTables.get(i), "t" + i);
        }

        // Build the FROM/JOIN chain. Each child joins onto its parent (the table whose name is the
        // longest prefix of the child's name).
        StringBuilder from = new StringBuilder(quoteIdentifier(rootTable) + " " + aliasOf.get(rootTable));
        List<Object> params = new ArrayList<>();
        for (String child : childTables) {
            String parent = rootTable;
            for (String cand : orderedTables) {
                if (!cand.equals(child) && child.startsWith(cand + "_") && cand.length() > parent.length()) {
                    parent = cand;
                }
            }
            String ca = aliasOf.get(child);
            String pa = aliasOf.get(parent);
            from.append(" LEFT JOIN ").append(quoteIdentifier(child)).append(" ").append(ca)
                .append(" ON ").append(ca).append(".parent_row_id = ").append(pa).append(".row_id")
                .append(" AND ").append(ca).append(".upload_id = ?");
            params.add(uploadId);
        }

        // Select every data column from every table with a globally-unique friendly label.
        List<String> columns = new ArrayList<>();
        List<String> types = new ArrayList<>();
        List<String> selectParts = new ArrayList<>();
        Set<String> usedLabels = new HashSet<>();
        for (String tableName : orderedTables) {
            String alias = aliasOf.get(tableName);
            List<String> normCols = jdbcTemplate.queryForList(
                "SELECT column_name FROM information_schema.columns " +
                "WHERE table_schema = current_schema() AND table_name = ? " +
                "AND column_name NOT IN ('upload_id', 'row_id', 'parent_row_id') " +
                "ORDER BY ordinal_position",
                String.class, tableName);
            for (String norm : normCols) {
                String label = displayByNorm.getOrDefault(norm, norm);
                if (!usedLabels.add(label)) {
                    String base = label;
                    int k = 2;
                    do { label = base + "_" + k++; } while (!usedLabels.add(label));
                }
                columns.add(label);
                types.add(typeByNorm.getOrDefault(norm, "string"));
                selectParts.add(alias + "." + quoteIdentifier(norm) + " AS " + quoteIdentifier(label));
            }
        }

        List<Map<String, Object>> rows;
        if (selectParts.isEmpty()) {
            rows = Collections.emptyList();
        } else {
            String sql = "SELECT " + String.join(", ", selectParts) +
                " FROM " + from +
                " WHERE " + aliasOf.get(rootTable) + ".upload_id = ?" +
                " ORDER BY " + aliasOf.get(rootTable) + ".row_id" +
                " LIMIT " + rowLimit;
            params.add(uploadId);
            rows = jdbcTemplate.queryForList(sql, params.toArray());
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("columns", columns);
        result.put("types", types);
        result.put("rows", rows);
        result.put("hasChildren", !childTables.isEmpty());
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

        // Valid columns (by display OR normalized name) mapped to their physical column, and which are
        // numeric (safe to CAST + aggregate). The physical table stores NORMALIZED column names, but the
        // UI sends DISPLAY names (e.g. "Total Sales"); resolve one to the other so camelCase/spaced
        // fields don't fail with "column does not exist".
        List<Map<String, Object>> fm = jdbcTemplate.queryForList(
            "SELECT field_name, normalized_field_name, field_type FROM field_metadata WHERE upload_id = ?", uploadId);
        Map<String, String> physicalColumnByName = new HashMap<>();
        Set<String> numericNames = new HashSet<>();
        for (Map<String, Object> f : fm) {
            String name = (String) f.get("field_name");
            String norm = (String) f.get("normalized_field_name");
            physicalColumnByName.put(name, norm);
            physicalColumnByName.put(norm, norm);
            if ("numeric".equals(f.get("field_type"))) {
                numericNames.add(name);
                numericNames.add(norm);
            }
        }

        String dimension = (String) body.get("dimension");
        String dimensionCol = null;
        if (dimension != null) {
            dimensionCol = physicalColumnByName.get(dimension);
            if (dimensionCol == null) {
                throw new IllegalArgumentException("Unknown dimension: " + dimension);
            }
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> measures = (List<Map<String, Object>>) body.getOrDefault("measures", List.of());

        List<String> selectParts = new ArrayList<>();
        // Alias the physical column back to the display name so response keys match what the UI sent.
        if (dimension != null) selectParts.add(quoteIdentifier(dimensionCol) + " AS " + quoteIdentifier(dimension));

        String firstMeasureExpr = null;
        for (Map<String, Object> m : measures) {
            String field = (String) m.get("field");
            String agg = String.valueOf(m.get("agg")).toUpperCase();
            String measureCol = physicalColumnByName.get(field);
            if (measureCol == null || !numericNames.contains(field)) {
                throw new IllegalArgumentException("Not a numeric measure: " + field);
            }
            if (!Set.of("SUM", "AVG", "MIN", "MAX", "COUNT").contains(agg)) {
                throw new IllegalArgumentException("Invalid aggregation: " + agg);
            }
            String col = quoteIdentifier(measureCol);
            // Only cast strictly-numeric text; empty/whitespace/non-numeric values become NULL
            // (ignored by the aggregate) instead of failing the whole query.
            String expr = agg + "(CASE WHEN trim(" + col + "::text) ~ '^-?[0-9]+(\\.[0-9]+)?$' "
                + "THEN CAST(trim(" + col + "::text) AS NUMERIC) ELSE NULL END)";
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
            sql.append(" AND ").append(quoteIdentifier(dimensionCol)).append(" IN (").append(placeholders).append(")");
            params.addAll(filterValues);
        }

        if (dimension != null) {
            sql.append(" GROUP BY ").append(quoteIdentifier(dimensionCol));
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

        // A nested dataset also generates child tables (named "<root>_<field>", each carrying a
        // parent_row_id). Collect them so this version's child rows are purged and — when the root is
        // dropped — the child tables are dropped too, instead of being left orphaned.
        List<String> childTables = jdbcTemplate.queryForList(
            "SELECT table_name FROM information_schema.columns " +
            "WHERE table_schema = current_schema() AND column_name = 'parent_row_id'",
            String.class
        ).stream()
            .filter(t -> t.startsWith(tableName + "_"))
            .distinct()
            .collect(Collectors.toList());

        // A physical table can be shared by multiple data versions of the same schema (each version is
        // a separate data_uploads row / upload_id). Only remove this version's rows here, and drop the
        // table itself solely when no other upload still references it.
        for (String table : prependRoot(tableName, childTables)) {
            try {
                jdbcTemplate.update(
                    "DELETE FROM " + quoteIdentifier(table) + " WHERE upload_id = ?",
                    uploadId
                );
            } catch (Exception ex) {
                log.warn("Failed to delete rows for upload {} from table '{}'", uploadId, table, ex);
            }
        }

        Integer otherUploads = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM data_uploads WHERE table_name = ? AND id <> ?",
            Integer.class, tableName, uploadId
        );
        if (otherUploads == null || otherUploads == 0) {
            // Drop children first (they reference the root via parent_row_id), then the root table.
            for (String table : appendRoot(tableName, childTables)) {
                try {
                    jdbcTemplate.execute("DROP TABLE IF EXISTS " + quoteIdentifier(table) + " CASCADE");
                } catch (Exception ex) {
                    // Metadata is still removed below, but a failed drop leaves an orphaned table — surface it in logs.
                    log.warn("Failed to drop backing table '{}' for upload {}", table, uploadId, ex);
                }
            }
        }

        // schema_data_ingestion has a FK on upload_id -> data_uploads; purge those rows first,
        // otherwise deleting the upload fails with a foreign key violation.
        try {
            jdbcTemplate.update("DELETE FROM schema_data_ingestion WHERE upload_id = ?", uploadId);
        } catch (Exception ex) {
            log.warn("Failed to delete schema_data_ingestion rows for upload {}", uploadId, ex);
        }

        jdbcTemplate.update("DELETE FROM field_metadata WHERE upload_id = ?", uploadId);
        jdbcTemplate.update("DELETE FROM data_uploads WHERE id = ?", uploadId);

        return ResponseEntity.ok(Map.of("message", "Dataset deleted"));
    }

    private String quoteIdentifier(String name) {
        return SqlIdentifier.quote(name);
    }

    /** Root table first, then its child tables — order for deleting this version's rows. */
    private static List<String> prependRoot(String rootTable, List<String> childTables) {
        List<String> all = new ArrayList<>();
        all.add(rootTable);
        all.addAll(childTables);
        return all;
    }

    /** Child tables first, then the root — order for dropping (children reference the root). */
    private static List<String> appendRoot(String rootTable, List<String> childTables) {
        List<String> all = new ArrayList<>(childTables);
        all.add(rootTable);
        return all;
    }
}
