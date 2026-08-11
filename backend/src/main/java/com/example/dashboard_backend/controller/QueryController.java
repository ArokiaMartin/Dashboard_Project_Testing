package com.example.dashboard_backend.controller;

import com.example.dashboard_backend.query.QueryConfigNormalizer;
import com.fasterxml.jackson.databind.JsonNode;
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
    private final QueryConfigNormalizer normalizer;
    private final QueryConfigNormalizer.TrustedFromSqlProvider trustedFromSql;

    public QueryController(JdbcTemplate jdbcTemplate, QueryConfigNormalizer normalizer,
                           QueryConfigNormalizer.TrustedFromSqlProvider trustedFromSql) {
        this.jdbcTemplate = jdbcTemplate;
        this.normalizer = normalizer;
        this.trustedFromSql = trustedFromSql;
    }

    /** Result of building a query: the SQL text (for display) plus the bind parameters (for safe execution). */
    public record GeneratedQuery(String sql, List<Object> params) {}

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
                String field = quoteIdentifier(validateIdentifier(requiredText(measure, "field", "measure"), "measure field"));
                String aggregation = validateAggregation(requiredText(measure, "aggregation", "measure"));
                String aliasText = measure.hasNonNull("alias") && !measure.get("alias").asText().isBlank()
                        ? measure.get("alias").asText()
                        : requiredText(measure, "field", "measure");
                String alias = quoteIdentifier(validateIdentifier(aliasText, "measure alias"));

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
                String field = quoteIdentifier(validateIdentifier(requiredText(rule, "field", "filter"), "filter field"));
                String type = rule.hasNonNull("type") ? rule.get("type").asText().toLowerCase() : "string";
                String fieldExpr = filterFieldExpression(field, type);
                String bind = filterBindExpression(type);
                String operator = cleanOperator(requiredText(rule, "operator", "filter"));

                if (operator.equalsIgnoreCase("IS NULL") || operator.equalsIgnoreCase("IS NOT NULL")) {

                    // Null-bucket drill filters carry no value and bind no parameter.
                    whereParts.add(field + " " + operator);

                } else if (operator.equalsIgnoreCase("IN")) {

                    JsonNode values = rule.get("values");
                    if (values == null || !values.isArray() || values.isEmpty()) {
                        throw new IllegalArgumentException("IN filter on '" + rule.path("field").asText() + "' requires a non-empty 'values' array.");
                    }

                    List<String> placeholders = new ArrayList<>();

                    for (JsonNode value : values) {
                        placeholders.add("?");
                        params.add(valueOf(value));
                    }

                    whereParts.add(field + " IN (" + String.join(", ", placeholders) + ")");

                } else if (operator.equalsIgnoreCase("BETWEEN")) {

                    whereParts.add(fieldExpr + " BETWEEN " + bind + " AND " + bind);
                    params.add(rule.get("from").asText());
                    params.add(rule.get("to").asText());

                } else {

                    JsonNode valueNode = rule.get("value");
                    whereParts.add(fieldExpr + " " + operator + " " + bind);
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
                String measure = quoteIdentifier(validateIdentifier(requiredText(rule, "measure", "having"), "having measure"));
                String operator = cleanOperator(requiredText(rule, "operator", "having"));
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
                String field = quoteIdentifier(validateIdentifier(requiredText(sort, "field", "sort"), "sort field"));
                String direction = validateDirection(requiredText(sort, "direction", "sort"));

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

            // Guard against negative/absurd pagination (previously surfaced as a 500 leaking the raw SQL).
            if (top < 0 || offset < 0) {
                throw new IllegalArgumentException("Pagination top/offset must not be negative");
            }
            top = Math.min(top, 10000);

            sql.append(" LIMIT ?");
            params.add(top);

            sql.append(" OFFSET ?");
            params.add(offset);
        }

        return new GeneratedQuery(sql.toString(), params);
    }

    /** Renders a generated query's SQL with its parameter values inlined, for human-readable preview only — never executed. */
    public static String renderPreview(GeneratedQuery query) {
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

    private static String validateIdentifier(String identifier, String kind) {
        if (identifier == null || identifier.isBlank()) {
            throw new IllegalArgumentException("Invalid " + kind + " name: " + identifier);
        }
        // Identifiers are always emitted as double-quoted names via quoteIdentifier(...),
        // so spaces/symbols from existing uploaded headers are safe and valid here.
        return identifier;
    }

    /** Returns the text of a required config field, throwing a 400 (IllegalArgumentException)
     *  with a clear message when the key is absent, null, or blank — instead of an NPE/500. */
    private static String requiredText(JsonNode node, String key, String what) {
        JsonNode value = node == null ? null : node.get(key);
        if (value == null || value.isNull() || value.asText().isBlank()) {
            throw new IllegalArgumentException("Missing required '" + key + "' in " + what + " configuration.");
        }
        return value.asText();
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
            case "=", "!=", "<>", ">", "<", ">=", "<=", "IN", "BETWEEN", "LIKE", "IS NULL", "IS NOT NULL" ->
                operator.toUpperCase();
            default -> throw new IllegalArgumentException("Invalid operator: " + operator);
        };
    }

    /**
     * Left-hand-side expression for a WHERE filter. Columns are stored as text, so numeric and date
     * filters are cast to their real type first — otherwise comparisons run lexicographically
     * (e.g. '9' > '1000'). Non-numeric / non-date values fall back to NULL so they are excluded.
     */
    private static String filterFieldExpression(String field, String type) {
        return switch (type == null ? "string" : type.toLowerCase()) {
            case "number" -> "CASE WHEN trim(" + field + "::text) ~ '^-?[0-9]+(\\.[0-9]+)?$' "
                    + "THEN CAST(trim(" + field + "::text) AS NUMERIC) ELSE NULL END";
            case "date" -> "CASE WHEN trim(" + field + "::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' "
                    + "THEN CAST(left(trim(" + field + "::text), 10) AS DATE) ELSE NULL END";
            default -> field;
        };
    }

    /** Placeholder for a filter's bound value, cast to match {@link #filterFieldExpression}'s type. */
    private static String filterBindExpression(String type) {
        return switch (type == null ? "string" : type.toLowerCase()) {
            case "number" -> "CAST(? AS NUMERIC)";
            case "date" -> "CAST(? AS DATE)";
            default -> "?";
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
     * Backend-owned config normalization. Delegates to {@link QueryConfigNormalizer} — the single public
     * entry point every SQL-building path shares — and hands it the trusted server-side FROM-subquery
     * provider so live sources are read through their bucketed derived table.
     */
    private JsonNode normalizeConfigForExecution(JsonNode config) {
        return normalizer.normalize(config, trustedFromSql);
    }

}
