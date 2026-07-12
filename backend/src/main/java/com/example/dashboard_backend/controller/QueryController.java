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
@CrossOrigin(origins = "*")
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

    public QueryController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = new ObjectMapper();
    }

    /** Result of building a query: the SQL text (for display) plus the bind parameters (for safe execution). */
    public record GeneratedQuery(String sql, List<Object> params) {}
    private record DatasetMeta(UUID uploadId, String tableName) {}

    public static GeneratedQuery generateSql(JsonNode config) {

        String dataset = quoteIdentifier(validateIdentifier(config.get("dataset").asText(), "dataset"));

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
                String field = quoteIdentifier(validateIdentifier(measure.get("field").asText(), "measure field"));
                String aggregation = validateAggregation(measure.get("aggregation").asText());
                String alias = quoteIdentifier(validateIdentifier(measure.get("alias").asText(), "measure alias"));

                String measureTarget = switch (aggregation) {
                    // Only cast strictly-numeric text to NUMERIC; empty/whitespace/non-numeric
                    // values become NULL (ignored by the aggregate) instead of failing the query.
                    case "SUM", "AVG", "MIN", "MAX" ->
                        "CASE WHEN trim(" + field + "::text) ~ '^-?[0-9]+(\\.[0-9]+)?$' "
                        + "THEN CAST(trim(" + field + "::text) AS NUMERIC) ELSE NULL END";
                    case "COUNT" -> "NULLIF(" + field + ", '')";
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
        sql.append(" FROM ");
        sql.append(dataset);

        // 4. WHERE filters
        JsonNode filters = config.get("filters");

        if (filters != null && filters.has("rules")) {
            String condition = filters.has("condition")
                    ? validateLogicalConnector(filters.get("condition").asText())
                    : "AND";

            List<String> whereParts = new ArrayList<>();

            JsonNode rules = filters.get("rules");

            for (JsonNode rule : rules) {
                String field = quoteIdentifier(validateIdentifier(rule.get("field").asText(), "filter field"));
                String operator = cleanOperator(rule.get("operator").asText());

                if (operator.equalsIgnoreCase("IN")) {

                    List<String> placeholders = new ArrayList<>();

                    for (JsonNode value : rule.get("values")) {
                        placeholders.add("?");
                        params.add(valueOf(value));
                    }

                    whereParts.add(field + " IN (" + String.join(", ", placeholders) + ")");

                } else if (operator.equalsIgnoreCase("BETWEEN")) {

                    whereParts.add(field + " BETWEEN ? AND ?");
                    params.add(rule.get("from").asText());
                    params.add(rule.get("to").asText());

                } else {

                    JsonNode valueNode = rule.get("value");
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
                String measure = quoteIdentifier(validateIdentifier(rule.get("measure").asText(), "having measure"));
                String operator = cleanOperator(rule.get("operator").asText());
                JsonNode valueNode = rule.get("value");

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
                String field = quoteIdentifier(validateIdentifier(sort.get("field").asText(), "sort field"));
                String direction = validateDirection(sort.get("direction").asText());

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
        for (Object param : query.params()) {
            String literal = (param instanceof Number || param instanceof Boolean)
                    ? String.valueOf(param)
                    : "'" + String.valueOf(param).replace("'", "''") + "'";
            sql = sql.replaceFirst("\\?", java.util.regex.Matcher.quoteReplacement(literal));
        }
        return sql;
    }

    private static Object valueOf(JsonNode valueNode) {
        if (valueNode.isNumber()) return valueNode.numberValue();
        if (valueNode.isBoolean()) return valueNode.booleanValue();
        return valueNode.asText();
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
        String datasetToken = normalized.path("dataset").asText(null);
        DatasetMeta datasetMeta = resolveDatasetMeta(datasetToken);
        normalized.put("dataset", datasetMeta.tableName());

        Map<String, String> fieldMap = datasetMeta.uploadId() == null
                ? Collections.emptyMap()
                : loadFieldMap(datasetMeta.uploadId());

        remapDimensions(normalized.withArray("dimensions"), fieldMap);
        remapMeasures(normalized.withArray("measures"), fieldMap);
        remapFilters(normalized.with("filters").withArray("rules"), fieldMap);
        remapHaving(normalized.withArray("having"), fieldMap);
        remapSorting(normalized.withArray("sorting"), fieldMap);

        return normalized;
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