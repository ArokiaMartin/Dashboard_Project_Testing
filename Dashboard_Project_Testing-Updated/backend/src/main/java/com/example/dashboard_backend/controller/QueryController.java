package com.example.dashboard_backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api")
@Tag(name = "Query API", description = "Endpoints for generating and executing SQL queries from a dashboard configuration")
public class QueryController {

    /**
     * Identifiers (dataset/field/alias names) are validated + quoted via
     * {@link com.example.dashboard_backend.util.SqlIdentifier} before being concatenated into SQL.
     * Values, by contrast, are never concatenated as literals for execution — they're passed as JDBC
     * bind parameters (see {@link #generateSql}).
     */
    private static final Set<String> VALID_AGGREGATIONS = Set.of("SUM", "AVG", "COUNT", "MIN", "MAX");
    private static final Set<String> VALID_DIRECTIONS = Set.of("ASC", "DESC");

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public QueryController(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    /** Result of building a query: the SQL text (for display) plus the bind parameters (for safe execution). */
    public record GeneratedQuery(String sql, List<Object> params) {}
    private record DatasetMeta(UUID uploadId, String tableName) {}

    public static GeneratedQuery generateSql(JsonNode config) {

        String dataset = quoteIdentifier(validateIdentifier(requireText(config, "dataset", "query config"), "dataset"));

        List<Object> params = new ArrayList<>();
        List<String> selectParts = new ArrayList<>();
        List<String> groupByParts = new ArrayList<>();

        // 1. Dimensions
        JsonNode dimensions = config.get("dimensions");

        if (dimensions != null && dimensions.isArray()) {
            for (JsonNode dimension : dimensions) {
                String field = quoteIdentifier(validateIdentifier(dimension.asText(), "dimension field"));

                selectParts.add(field);
                groupByParts.add(field);
            }
        }

        // 2. Measures
        JsonNode measures = config.get("measures");

        if (measures != null && measures.isArray()) {
            for (JsonNode measure : measures) {
                String field = quoteIdentifier(validateIdentifier(requireText(measure, "field", "measure"), "measure field"));
                String aggregation = validateAggregation(requireText(measure, "aggregation", "measure"));
                String alias = quoteIdentifier(validateIdentifier(requireText(measure, "alias", "measure"), "measure alias"));

                String measureTarget = switch (aggregation) {
                    // Only cast strictly-numeric text to NUMERIC; empty/whitespace/non-numeric
                    // values become NULL (ignored by the aggregate) instead of failing the query.
                    case "SUM", "AVG", "MIN", "MAX" ->
                        "CASE WHEN trim(" + field + "::text) ~ '^-?[0-9]+(\\.[0-9]+)?$' "
                        + "THEN CAST(trim(" + field + "::text) AS NUMERIC) ELSE NULL END";
                    // Cast to text before comparing to '' so COUNT works for numeric/date/boolean
                    // columns too (NULLIF(numericCol, '') would fail to cast '' to numeric).
                    case "COUNT" -> "NULLIF(trim(" + field + "::text), '')";
                    default -> throw new IllegalArgumentException("Invalid aggregation: " + aggregation);
                };
                String measureExpression = aggregation + "(" + measureTarget + ") AS " + alias;
                selectParts.add(measureExpression);
            }
        }

        StringBuilder sql = new StringBuilder();

        // If no dimensions or measures are given
        if (selectParts.isEmpty()) {
            sql.append("SELECT *");
        } else {
            sql.append("SELECT ");
            sql.append(String.join(", ", selectParts));
        }

        // 3. FROM
        // When the dataset has nested child tables, the caller supplies a pre-built flattened
        // derived table (root LEFT JOINed with its children) so fields from any table resolve.
        // Otherwise fall back to the plain single-table name.
        sql.append(" FROM ");
        JsonNode datasetFromSql = config.get("datasetFromSql");
        if (datasetFromSql != null && !datasetFromSql.isNull() && !datasetFromSql.asText().isBlank()) {
            sql.append(datasetFromSql.asText());
        } else {
            sql.append(dataset);
        }

        // 4. WHERE filters
        JsonNode filters = config.get("filters");

        if (filters != null && filters.has("rules")) {
            String condition = filters.has("condition")
                    ? validateLogicalConnector(filters.get("condition").asText())
                    : "AND";

            List<String> whereParts = new ArrayList<>();

            JsonNode rules = filters.get("rules");

            for (JsonNode rule : rules) {
                String field = quoteIdentifier(validateIdentifier(requireText(rule, "field", "filter rule"), "filter field"));
                String operator = cleanOperator(requireText(rule, "operator", "filter rule"));

                if (operator.equalsIgnoreCase("IN")) {

                    JsonNode valuesNode = requireNode(rule, "values", "IN filter");
                    if (!valuesNode.isArray() || valuesNode.isEmpty()) {
                        throw new IllegalArgumentException("IN filter requires a non-empty 'values' array");
                    }

                    List<String> placeholders = new ArrayList<>();

                    for (JsonNode value : valuesNode) {
                        placeholders.add("?");
                        params.add(valueOf(value));
                    }

                    whereParts.add(field + " IN (" + String.join(", ", placeholders) + ")");

                } else if (operator.equalsIgnoreCase("BETWEEN")) {

                    whereParts.add(field + " BETWEEN ? AND ?");
                    params.add(requireText(rule, "from", "BETWEEN filter"));
                    params.add(requireText(rule, "to", "BETWEEN filter"));

                } else {

                    JsonNode valueNode = requireNode(rule, "value", "filter rule");
                    whereParts.add(field + " " + operator + " ?");
                    params.add(valueOf(valueNode));
                }
            }

            if (!whereParts.isEmpty()) {
                sql.append(" WHERE ");
                sql.append(String.join(" " + condition + " ", whereParts));
            }
        }

        // 5. GROUP BY
        if (!groupByParts.isEmpty() && measures != null && measures.isArray() && measures.size() > 0) {
            sql.append(" GROUP BY ");
            sql.append(String.join(", ", groupByParts));
        }

        // 6. HAVING
        JsonNode having = config.get("having");

        if (having != null && having.isArray()) {
            List<String> havingParts = new ArrayList<>();

            for (JsonNode rule : having) {
                String measure = quoteIdentifier(validateIdentifier(requireText(rule, "measure", "having rule"), "having measure"));
                String operator = cleanOperator(requireText(rule, "operator", "having rule"));
                JsonNode valueNode = requireNode(rule, "value", "having rule");

                havingParts.add(measure + " " + operator + " ?");
                params.add(valueOf(valueNode));
            }

            if (!havingParts.isEmpty()) {
                sql.append(" HAVING ");
                sql.append(String.join(" AND ", havingParts));
            }
        }

        // 7. ORDER BY
        JsonNode sorting = config.get("sorting");

        if (sorting != null && sorting.isArray()) {
            List<String> orderParts = new ArrayList<>();

            for (JsonNode sort : sorting) {
                String field = quoteIdentifier(validateIdentifier(requireText(sort, "field", "sort rule"), "sort field"));
                String direction = validateDirection(requireText(sort, "direction", "sort rule"));

                orderParts.add(field + " " + direction);
            }

            if (!orderParts.isEmpty()) {
                sql.append(" ORDER BY ");
                sql.append(String.join(", ", orderParts));
            }
        }

        // 8. Pagination
        JsonNode pagination = config.get("pagination");

        if (pagination != null) {
            int top = pagination.has("top") ? pagination.get("top").asInt() : 100;
            int offset = pagination.has("offset") ? pagination.get("offset").asInt() : 0;

            sql.append(" LIMIT ?");
            params.add(top);

            sql.append(" OFFSET ?");
            params.add(offset);
        }

        return new GeneratedQuery(sql.toString(), params);
    }

    /** Renders a generated query's SQL with its parameter values inlined, for human-readable preview only — never executed. */
    private static String renderPreview(GeneratedQuery query) {
        String sql = query.sql();
        // Only substitute real bind placeholders: a '?' that sits outside a single-quoted string
        // literal. Measure expressions embed regex literals like '^-?[0-9]+...' whose '?' must be
        // left untouched, otherwise the preview SQL is corrupted.
        StringBuilder out = new StringBuilder(sql.length() + 32);
        List<Object> params = query.params();
        int paramIndex = 0;
        boolean inStringLiteral = false;
        for (int i = 0; i < sql.length(); i++) {
            char c = sql.charAt(i);
            if (c == '\'') {
                inStringLiteral = !inStringLiteral;
                out.append(c);
            } else if (c == '?' && !inStringLiteral && paramIndex < params.size()) {
                Object param = params.get(paramIndex++);
                String literal = (param instanceof Number || param instanceof Boolean)
                        ? String.valueOf(param)
                        : "'" + String.valueOf(param).replace("'", "''") + "'";
                out.append(literal);
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }

    private static Object valueOf(JsonNode valueNode) {
        if (valueNode.isNumber()) return valueNode.numberValue();
        if (valueNode.isBoolean()) return valueNode.booleanValue();
        return valueNode.asText();
    }

    /** Returns the child node, throwing a 400-mapped IllegalArgumentException when it is missing/null. */
    private static JsonNode requireNode(JsonNode parent, String field, String context) {
        JsonNode node = parent == null ? null : parent.get(field);
        if (node == null || node.isNull()) {
            throw new IllegalArgumentException("Missing required '" + field + "' in " + context);
        }
        return node;
    }

    /** Returns the child node's non-blank text, throwing a 400-mapped IllegalArgumentException when absent. */
    private static String requireText(JsonNode parent, String field, String context) {
        String text = requireNode(parent, field, context).asText(null);
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("Missing required '" + field + "' in " + context);
        }
        return text;
    }

    private static String validateIdentifier(String identifier, String kind) {
        if (identifier == null || identifier.isBlank()) {
            throw new IllegalArgumentException("Invalid " + kind + " name: " + identifier);
        }
        // Identifiers are always emitted as double-quoted names via quoteIdentifier(...),
        // so spaces/symbols from existing uploaded headers are safe and valid here.
        return identifier;
    }

    private static String quoteIdentifier(String identifier) {
        return com.example.dashboard_backend.util.SqlIdentifier.quote(identifier);
    }

    private static String validateAggregation(String aggregation) {
        String upper = aggregation == null ? "" : aggregation.toUpperCase();
        if (!VALID_AGGREGATIONS.contains(upper)) {
            throw new IllegalArgumentException("Invalid aggregation: " + aggregation);
        }
        return upper;
    }

    private static String validateDirection(String direction) {
        String upper = direction == null ? "" : direction.toUpperCase();
        if (!VALID_DIRECTIONS.contains(upper)) {
            throw new IllegalArgumentException("Invalid sort direction: " + direction);
        }
        return upper;
    }

    private static String validateLogicalConnector(String connector) {
        String upper = connector == null ? "" : connector.toUpperCase();
        if (!upper.equals("AND") && !upper.equals("OR")) {
            throw new IllegalArgumentException("Invalid filter condition: " + connector);
        }
        return upper;
    }

    private static String cleanOperator(String operator) {
        return switch (operator.toUpperCase()) {
            case "=", "!=", "<>", ">", "<", ">=", "<=", "IN", "BETWEEN", "LIKE" -> operator.toUpperCase();
            default -> throw new IllegalArgumentException("Invalid operator: " + operator);
        };
    }

    @Operation(
        summary = "Generate SQL from config",
        description = "Accepts a dashboard query configuration (dimensions, measures, filters, sorting, pagination) and returns the generated SQL string without executing it.",
        requestBody = @RequestBody(
            required = true,
            content = @Content(
                mediaType = "application/json",
                schema = @Schema(type = "object"),
                examples = @ExampleObject(
                    name = "Sample config",
                    value = "{\"dataset\":\"orders\",\"dimensions\":[\"region\"],\"measures\":[{\"field\":\"revenue\",\"aggregation\":\"SUM\",\"alias\":\"total_revenue\"}],\"filters\":{\"condition\":\"AND\",\"rules\":[{\"field\":\"status\",\"operator\":\"IN\",\"values\":[\"completed\",\"shipped\"]}]},\"sorting\":[{\"field\":\"total_revenue\",\"direction\":\"DESC\"}],\"pagination\":{\"top\":50,\"offset\":0}}"
                )
            )
        ),
        responses = {
            @ApiResponse(responseCode = "200", description = "Generated SQL returned successfully",
                content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"generatedSql\":\"SELECT region, SUM(revenue) AS total_revenue FROM orders WHERE status IN ('completed', 'shipped') GROUP BY region ORDER BY total_revenue DESC LIMIT 50 OFFSET 0\"}")
                )
            )
        }
    )
    @PostMapping("/generate-query")
    public Map<String, String> generateQuery(@org.springframework.web.bind.annotation.RequestBody JsonNode config) {
        JsonNode normalizedConfig = normalizeConfigForExecution(config);
        GeneratedQuery query = generateSql(normalizedConfig);

        return Map.of(
                "generatedSql", renderPreview(query)
        );
    }

    @Operation(
        summary = "Execute SQL from config",
        description = "Accepts a dashboard query configuration, generates the SQL, executes it against the database, and returns both the generated SQL and the query result rows.",
        requestBody = @RequestBody(
            required = true,
            content = @Content(
                mediaType = "application/json",
                schema = @Schema(type = "object"),
                examples = @ExampleObject(
                    name = "Sample config",
                    value = "{\"dataset\":\"orders\",\"dimensions\":[\"region\"],\"measures\":[{\"field\":\"revenue\",\"aggregation\":\"SUM\",\"alias\":\"total_revenue\"}],\"pagination\":{\"top\":10,\"offset\":0}}"
                )
            )
        ),
        responses = {
            @ApiResponse(responseCode = "200", description = "Query executed successfully",
                content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"generatedSql\":\"SELECT region, SUM(revenue) AS total_revenue FROM orders GROUP BY region LIMIT 10 OFFSET 0\",\"data\":[{\"region\":\"North\",\"total_revenue\":42000}]}")
                )
            )
        }
    )
    @PostMapping("/execute-query")
    public Map<String, Object> executeQuery(@org.springframework.web.bind.annotation.RequestBody JsonNode config) {
        JsonNode normalizedConfig = normalizeConfigForExecution(config);
        GeneratedQuery query = generateSql(normalizedConfig);

        List<Map<String, Object>> result = jdbcTemplate.queryForList(query.sql(), query.params().toArray());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("generatedSql", renderPreview(query));
        response.put("data", result);

        return response;
    }

    /**
     * Backend-owned config normalization: resolve dataset token to a real table and map user-facing
     * field names to normalized DB columns before SQL generation.
     */
    private JsonNode normalizeConfigForExecution(JsonNode config) {
        if (!(config instanceof ObjectNode objectNode)) {
            throw new IllegalArgumentException("Invalid query config payload");
        }

        ObjectNode normalized = objectNode.deepCopy();
        // Never trust a client-supplied FROM clause: the server is the sole authority for datasetFromSql.
        // Dropping it here closes the SQL-injection vector where arbitrary SQL spliced into the FROM would
        // otherwise be appended verbatim by generateSql(). The server rebuilds it below (nested or flat).
        normalized.remove("datasetFromSql");
        String datasetToken = normalized.path("dataset").asText(null);
        DatasetMeta datasetMeta = resolveDatasetMeta(datasetToken);
        normalized.put("dataset", datasetMeta.tableName());

        // When the dataset has nested child tables, build a flattened derived table (root + only the
        // referenced child tables and their ancestor chain) that exposes every field under the SAME
        // display name the UI shows. Because the derived table already uses display names, no field
        // remap is needed. Only unrelated sibling collections are left out, so parent-level measures
        // are never inflated by an irrelevant fan-out.
        String flatFrom = null;
        if (datasetMeta.uploadId() != null) {
            Set<String> referencedColumns = collectReferencedColumns(normalized);
            flatFrom = buildFlatFromClause(datasetMeta.uploadId(), datasetMeta.tableName(), referencedColumns);
        }

        if (flatFrom != null) {
            normalized.put("datasetFromSql", flatFrom);
        } else {
            // Flat dataset (no child tables): query the single physical table directly, mapping the
            // UI's display field names to their normalized physical column names.
            Map<String, String> fieldMap = datasetMeta.uploadId() == null
                    ? Collections.emptyMap()
                    : loadFieldMap(datasetMeta.uploadId());
            remapDimensions(normalized.withArray("dimensions"), fieldMap);
            remapMeasures(normalized.withArray("measures"), fieldMap);
            remapFilters(normalized.with("filters").withArray("rules"), fieldMap);
            remapHaving(normalized.withArray("having"), fieldMap);
            remapSorting(normalized.withArray("sorting"), fieldMap);

            // A single physical table holds EVERY version's rows (PK is (upload_id, row_id)). Scope the
            // query to this upload's rows only, otherwise measures/counts silently mix data across
            // versions. The upload id is a validated UUID (never user input), so the literal is safe.
            if (datasetMeta.uploadId() != null) {
                String scopedFrom = "(SELECT * FROM " + quoteIdentifier(datasetMeta.tableName())
                        + " WHERE upload_id = '" + datasetMeta.uploadId() + "'::uuid) AS "
                        + quoteIdentifier(datasetMeta.tableName());
                normalized.put("datasetFromSql", scopedFrom);
            }
        }

        return normalized;
    }

    /**
     * Collects the normalized column names referenced anywhere in a (already-remapped) query config:
     * dimensions, measure fields, filter fields, having fields and sorting fields. Names that are really
     * measure aliases (not physical columns) simply won't match any table column later and are ignored.
     */
    private Set<String> collectReferencedColumns(ObjectNode config) {
        Set<String> cols = new HashSet<>();
        JsonNode dims = config.get("dimensions");
        if (dims != null && dims.isArray()) {
            for (JsonNode d : dims) {
                if (d.isTextual()) cols.add(d.asText());
            }
        }
        JsonNode measures = config.get("measures");
        if (measures != null && measures.isArray()) {
            for (JsonNode m : measures) {
                if (m.hasNonNull("field")) cols.add(m.get("field").asText());
            }
        }
        JsonNode filters = config.get("filters");
        if (filters != null && filters.has("rules") && filters.get("rules").isArray()) {
            for (JsonNode r : filters.get("rules")) {
                if (r.hasNonNull("field")) cols.add(r.get("field").asText());
            }
        }
        JsonNode having = config.get("having");
        if (having != null && having.isArray()) {
            for (JsonNode h : having) {
                if (h.hasNonNull("field")) cols.add(h.get("field").asText());
            }
        }
        JsonNode sorting = config.get("sorting");
        if (sorting != null && sorting.isArray()) {
            for (JsonNode s : sorting) {
                if (s.hasNonNull("field")) cols.add(s.get("field").asText());
            }
        }
        return cols;
    }

    private DatasetMeta resolveDatasetMeta(String datasetToken) {
        if (datasetToken == null || datasetToken.isBlank()) {
            throw new IllegalArgumentException("Dataset is required");
        }

        try {
            UUID uploadId = UUID.fromString(datasetToken);
            List<Map<String, Object>> byId = jdbcTemplate.queryForList(
                    "SELECT id, table_name FROM data_uploads WHERE id = ?",
                    uploadId
            );
            if (!byId.isEmpty()) {
                return new DatasetMeta((UUID) byId.get(0).get("id"), String.valueOf(byId.get(0).get("table_name")));
            }
        } catch (IllegalArgumentException ignored) {
            // Dataset token is not a UUID; continue with name-based resolution.
        }

        List<Map<String, Object>> byName = jdbcTemplate.queryForList(
                "SELECT id, table_name FROM data_uploads WHERE table_name = ? OR original_filename = ? ORDER BY created_at DESC LIMIT 1",
                datasetToken,
                datasetToken
        );
        if (!byName.isEmpty()) {
            return new DatasetMeta((UUID) byName.get(0).get("id"), String.valueOf(byName.get(0).get("table_name")));
        }

        return new DatasetMeta(null, datasetToken);
    }

    private Map<String, String> loadFieldMap(UUID uploadId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT field_name, normalized_field_name FROM field_metadata WHERE upload_id = ?",
                uploadId
        );
        Map<String, String> map = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String fieldName = String.valueOf(row.get("field_name"));
            String normalizedName = String.valueOf(row.get("normalized_field_name"));
            map.put(fieldName, normalizedName);
            map.put(normalizedName, normalizedName);
        }
        return map;
    }

    /**
     * Builds a flattened derived-table FROM clause for a dataset that has nested child tables:
     * {@code (SELECT ... FROM root t0 LEFT JOIN child t1 ON t1.parent_row_id = t0.row_id ...) AS "root"}.
     * Each child joins onto its parent (longest-prefix table name). Every column is exposed under the
     * SAME friendly display name the UI shows (leaf of the dotted field name, de-duplicated first-wins
     * exactly like the {@code /flat-rows} endpoint), so query fields resolve without any remap.
     *
     * Only the tables whose columns are actually referenced by the query — plus every ancestor needed to
     * connect them back to the root — are joined. This keeps unrelated sibling collections out of the
     * join, so their fan-out can no longer multiply (and inflate) parent-level measures. When the dataset
     * has no child tables at all, {@code null} is returned so the caller falls back to the plain
     * single-table FROM (with the usual display→normalized remap).
     *
     * The upload id is inlined as a validated UUID literal (never user input) so the derived table needs
     * no bind parameters — keeping generateSql's parameter ordering intact.
     */
    private String buildFlatFromClause(UUID uploadId, String rootTable, Set<String> referencedColumns) {
        List<String> withParentRefs = jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.columns " +
                "WHERE table_schema = current_schema() AND column_name = 'parent_row_id'",
                String.class);
        List<String> childTables = new ArrayList<>();
        for (String t : withParentRefs) {
            if (t.startsWith(rootTable + "_") && !childTables.contains(t)) {
                childTables.add(t);
            }
        }
        if (childTables.isEmpty()) {
            return null;
        }
        childTables.sort(Comparator.comparingInt(String::length).thenComparing(Comparator.naturalOrder()));

        List<String> orderedTables = new ArrayList<>();
        orderedTables.add(rootTable);
        orderedTables.addAll(childTables);
        Map<String, String> aliasOf = new HashMap<>();
        for (int i = 0; i < orderedTables.size(); i++) {
            aliasOf.put(orderedTables.get(i), "t" + i);
        }

        // Friendly display label for each normalized column (leaf of the dotted field name), first-wins.
        List<Map<String, Object>> allFields = jdbcTemplate.queryForList(
                "SELECT field_name, normalized_field_name FROM field_metadata WHERE upload_id = ? ORDER BY id",
                uploadId);
        Map<String, String> displayByNorm = new HashMap<>();
        for (Map<String, Object> f : allFields) {
            String fieldName = String.valueOf(f.get("field_name"));
            String normalized = String.valueOf(f.get("normalized_field_name"));
            String leaf = fieldName != null && fieldName.contains(".")
                    ? fieldName.substring(fieldName.lastIndexOf('.') + 1) : fieldName;
            displayByNorm.putIfAbsent(normalized, leaf);
        }

        // Physical columns of each table, and the parent (longest-prefix) of each child.
        Map<String, List<String>> columnsOf = new LinkedHashMap<>();
        Map<String, String> parentOf = new HashMap<>();
        for (String tableName : orderedTables) {
            List<String> cols = jdbcTemplate.queryForList(
                    "SELECT column_name FROM information_schema.columns " +
                    "WHERE table_schema = current_schema() AND table_name = ? " +
                    "AND column_name NOT IN ('upload_id', 'row_id', 'parent_row_id') " +
                    "ORDER BY ordinal_position",
                    String.class, tableName);
            columnsOf.put(tableName, cols);
            if (!tableName.equals(rootTable)) {
                String parent = rootTable;
                for (String cand : orderedTables) {
                    if (!cand.equals(tableName) && tableName.startsWith(cand + "_") && cand.length() > parent.length()) {
                        parent = cand;
                    }
                }
                parentOf.put(tableName, parent);
            }
        }

        // Assign globally-unique display labels in the exact order /flat-rows does, and remember which
        // table owns each label so we can decide which tables the query actually needs.
        Map<String, Map<String, String>> labelOf = new LinkedHashMap<>();   // table -> (column -> label)
        Map<String, String> ownerOfLabel = new HashMap<>();                 // label -> owning table
        Set<String> usedLabels = new HashSet<>();
        for (String tableName : orderedTables) {
            Map<String, String> perColumn = new LinkedHashMap<>();
            for (String col : columnsOf.get(tableName)) {
                String label = displayByNorm.getOrDefault(col, col);
                if (!usedLabels.add(label)) {
                    String base = label;
                    int k = 2;
                    do { label = base + "_" + k++; } while (!usedLabels.add(label));
                }
                perColumn.put(col, label);
                ownerOfLabel.put(label, tableName);
            }
            labelOf.put(tableName, perColumn);
        }

        // Determine which tables the query needs: each referenced label's owning table plus its ancestor
        // chain up to the root. The root is always present.
        Set<String> included = new LinkedHashSet<>();
        included.add(rootTable);
        Set<String> refs = referencedColumns == null ? Collections.emptySet() : referencedColumns;
        for (String ref : refs) {
            String owner = ownerOfLabel.get(ref);
            if (owner == null) continue;                       // measure alias or unknown name — ignore
            for (String t = owner; t != null && included.add(t); t = parentOf.get(t)) {
                // walk up to the root, adding each ancestor once
            }
        }

        String uuidLiteral = "'" + uploadId + "'::uuid";

        StringBuilder from = new StringBuilder(quoteIdentifier(rootTable) + " " + aliasOf.get(rootTable));
        for (String child : childTables) {
            if (!included.contains(child)) continue;
            String ca = aliasOf.get(child);
            String pa = aliasOf.get(parentOf.get(child));
            from.append(" LEFT JOIN ").append(quoteIdentifier(child)).append(" ").append(ca)
                .append(" ON ").append(ca).append(".parent_row_id = ").append(pa).append(".row_id")
                .append(" AND ").append(ca).append(".upload_id = ").append(uuidLiteral);
        }

        List<String> selectParts = new ArrayList<>();
        for (String tableName : orderedTables) {
            if (!included.contains(tableName)) continue;
            String alias = aliasOf.get(tableName);
            Map<String, String> perColumn = labelOf.get(tableName);
            for (String col : columnsOf.get(tableName)) {
                selectParts.add(alias + "." + quoteIdentifier(col) + " AS " + quoteIdentifier(perColumn.get(col)));
            }
        }
        if (selectParts.isEmpty()) {
            return null;
        }

        return "(SELECT " + String.join(", ", selectParts) +
               " FROM " + from +
               " WHERE " + aliasOf.get(rootTable) + ".upload_id = " + uuidLiteral +
               ") AS " + quoteIdentifier(rootTable);
    }

    private static String resolveField(Map<String, String> fieldMap, String requestedField) {
        if (requestedField == null || requestedField.isBlank()) {
            return requestedField;
        }
        return fieldMap.getOrDefault(requestedField, requestedField);
    }

    private void remapDimensions(ArrayNode dimensions, Map<String, String> fieldMap) {
        for (int i = 0; i < dimensions.size(); i++) {
            String requested = dimensions.get(i).asText();
            dimensions.set(i, objectMapper.getNodeFactory().textNode(resolveField(fieldMap, requested)));
        }
    }

    private void remapMeasures(ArrayNode measures, Map<String, String> fieldMap) {
        for (JsonNode node : measures) {
            if (node instanceof ObjectNode measure && measure.has("field")) {
                String requested = measure.get("field").asText();
                measure.put("field", resolveField(fieldMap, requested));
            }
        }
    }

    private void remapFilters(ArrayNode rules, Map<String, String> fieldMap) {
        for (JsonNode node : rules) {
            if (node instanceof ObjectNode rule && rule.has("field")) {
                String requested = rule.get("field").asText();
                rule.put("field", resolveField(fieldMap, requested));
            }
        }
    }

    private void remapHaving(ArrayNode having, Map<String, String> fieldMap) {
        for (JsonNode node : having) {
            if (node instanceof ObjectNode rule && rule.has("measure")) {
                String requested = rule.get("measure").asText();
                rule.put("measure", resolveField(fieldMap, requested));
            }
        }
    }

    private void remapSorting(ArrayNode sorting, Map<String, String> fieldMap) {
        for (JsonNode node : sorting) {
            if (node instanceof ObjectNode sort && sort.has("field")) {
                String requested = sort.get("field").asText();
                sort.put("field", resolveField(fieldMap, requested));
            }
        }
    }

}