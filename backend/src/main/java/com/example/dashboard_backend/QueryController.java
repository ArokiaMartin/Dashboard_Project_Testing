package com.example.dashboard_backend;

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
@CrossOrigin(origins = "*")
@Tag(name = "Query API", description = "Endpoints for generating and executing SQL queries from a dashboard configuration")
public class QueryController {

    /**
     * Identifiers (dataset/field/alias names) are validated against this pattern and quoted before
     * being concatenated into SQL. Values, by contrast, are never concatenated as literals for
     * execution — they're passed as JDBC bind parameters (see {@link #generateSql}).
     */
    private static final Pattern SAFE_IDENTIFIER = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");
    private static final Set<String> VALID_AGGREGATIONS = Set.of("SUM", "AVG", "COUNT", "MIN", "MAX");
    private static final Set<String> VALID_DIRECTIONS = Set.of("ASC", "DESC");
    private static final Set<String> VALID_JOIN_TYPES = Set.of(
            "INNER_JOIN", "LEFT_JOIN", "RIGHT_JOIN", "FULL_JOIN");

    private final JdbcTemplate jdbcTemplate;

    public QueryController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Result of building a query: the SQL text (for display) plus the bind parameters (for safe execution). */
    public record GeneratedQuery(String sql, List<Object> params) {}

    public static GeneratedQuery generateSql(JsonNode config) {

        // Multi-table mode is selected when the config carries a "tables" object (with a primary
        // table + the list of tables used). Otherwise we fall back to the original single-table
        // path that keys off "dataset". This keeps existing single-table configs working unchanged.
        JsonNode tablesNode = config.get("tables");
        boolean multiTable = tablesNode != null && tablesNode.has("primary");
        if (!multiTable && "multi_table".equals(optText(config.get("queryMode")))) {
            throw new IllegalArgumentException("queryMode is multi_table but tables.primary is missing");
        }
        if (multiTable) {
            return generateMultiTableSql(config);
        }

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

                String measureExpression = aggregation + "(" + field + ") AS " + alias;
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

    /**
     * Builds SQL that spans several tables joined together. Every column is qualified with the alias
     * of its owning table (t0, t1, ...) so that columns sharing a name across tables (id, name,
     * created_at, ...) stay unambiguous. The shape of the config is:
     *
     * <pre>
     * {
     *   "queryMode": "multi_table",
     *   "tables":   { "primary": "employees", "used": ["employees", "departments"] },
     *   "dimensions": [ { "table": "departments", "column": "department_name", "alias": "department_name" } ],
     *   "measures":   [ { "table": "employees", "column": "salary", "aggregation": "AVG", "alias": "avg_salary" } ],
     *   "joins":      [ { "leftTable": "employees", "leftColumn": "department_id",
     *                     "rightTable": "departments", "rightColumn": "department_id", "joinType": "LEFT_JOIN" } ],
     *   "filters":    { "condition": "AND", "rules": [ { "table": "employees", "column": "status", "operator": "=", "value": "Active" } ] },
     *   "sorting":    [ { "field": "avg_salary", "direction": "DESC" } ],
     *   "pagination": { "top": 50, "offset": 0 }
     * }
     * </pre>
     */
    public static GeneratedQuery generateMultiTableSql(JsonNode config) {

        List<Object> params = new ArrayList<>();
        List<String> selectParts = new ArrayList<>();
        List<String> groupByParts = new ArrayList<>();

        // 1. Read tables + assign a stable alias (t0, t1, ...) to each distinct table.
        JsonNode tablesNode = config.get("tables");
        if (tablesNode == null || !tablesNode.has("primary")) {
            throw new IllegalArgumentException("Missing tables.primary");
        }

        String primaryTable = validateIdentifier(tablesNode.get("primary").asText(), "primary table");

        JsonNode usedTablesNode = tablesNode.get("used");
        if (usedTablesNode == null || !usedTablesNode.isArray() || usedTablesNode.isEmpty()) {
            throw new IllegalArgumentException("Missing tables.used");
        }

        Map<String, String> tableAliases = new LinkedHashMap<>();
        int aliasIndex = 0;
        for (JsonNode tableNode : usedTablesNode) {
            String tableName = validateIdentifier(tableNode.asText(), "table name");
            if (!tableAliases.containsKey(tableName)) {
                tableAliases.put(tableName, "t" + aliasIndex);
                aliasIndex++;
            }
        }

        if (!tableAliases.containsKey(primaryTable)) {
            throw new IllegalArgumentException("Primary table must be present in tables.used");
        }

        // 2. Dimensions -> select + group by.
        JsonNode dimensions = config.get("dimensions");
        if (dimensions != null && dimensions.isArray()) {
            for (JsonNode dimension : dimensions) {
                String table = validateIdentifier(dimension.get("table").asText(), "dimension table");
                String column = validateIdentifier(dimension.get("column").asText(), "dimension column");
                String alias = dimension.has("alias")
                        ? validateIdentifier(dimension.get("alias").asText(), "dimension alias")
                        : column;

                String tableAlias = getTableAlias(tableAliases, table);
                String expression = tableAlias + "." + quoteIdentifier(column);

                selectParts.add(expression + " AS " + quoteIdentifier(alias));
                groupByParts.add(expression);
            }
        }

        // 3. Measures -> aggregated select.
        JsonNode measures = config.get("measures");
        if (measures != null && measures.isArray()) {
            for (JsonNode measure : measures) {
                String table = validateIdentifier(measure.get("table").asText(), "measure table");
                String column = validateIdentifier(measure.get("column").asText(), "measure column");
                String aggregation = validateAggregation(measure.get("aggregation").asText());
                String alias = validateIdentifier(measure.get("alias").asText(), "measure alias");

                String tableAlias = getTableAlias(tableAliases, table);

                String expression;
                if (aggregation.equals("COUNT") && column.equals("*")) {
                    expression = "COUNT(*)";
                } else {
                    expression = aggregation + "(" + tableAlias + "." + quoteIdentifier(column) + ")";
                }

                selectParts.add(expression + " AS " + quoteIdentifier(alias));
            }
        }

        StringBuilder sql = new StringBuilder();

        // 4. SELECT
        if (selectParts.isEmpty()) {
            sql.append("SELECT *");
        } else {
            sql.append("SELECT ").append(String.join(", ", selectParts));
        }

        // 5. FROM primary table
        sql.append(" FROM ")
           .append(quoteIdentifier(primaryTable))
           .append(" ")
           .append(getTableAlias(tableAliases, primaryTable));

        // 6. JOINS
        JsonNode joins = config.get("joins");
        if (joins != null && joins.isArray()) {
            for (JsonNode join : joins) {
                String leftTable = validateIdentifier(join.get("leftTable").asText(), "join left table");
                String leftColumn = validateIdentifier(join.get("leftColumn").asText(), "join left column");
                String rightTable = validateIdentifier(join.get("rightTable").asText(), "join right table");
                String rightColumn = validateIdentifier(join.get("rightColumn").asText(), "join right column");
                String joinType = validateJoinType(join.get("joinType").asText());

                String leftAlias = getTableAlias(tableAliases, leftTable);
                String rightAlias = getTableAlias(tableAliases, rightTable);

                sql.append(" ").append(joinType).append(" ")
                   .append(quoteIdentifier(rightTable)).append(" ").append(rightAlias)
                   .append(" ON ")
                   .append(leftAlias).append(".").append(quoteIdentifier(leftColumn))
                   .append(" = ")
                   .append(rightAlias).append(".").append(quoteIdentifier(rightColumn));
            }
        }

        // 7. WHERE filters
        JsonNode filters = config.get("filters");
        if (filters != null && filters.has("rules")) {
            String condition = filters.has("condition")
                    ? validateLogicalConnector(filters.get("condition").asText())
                    : "AND";

            List<String> whereParts = new ArrayList<>();
            for (JsonNode rule : filters.get("rules")) {
                String table = validateIdentifier(rule.get("table").asText(), "filter table");
                String column = validateIdentifier(rule.get("column").asText(), "filter column");
                String operator = cleanOperator(rule.get("operator").asText());

                String tableAlias = getTableAlias(tableAliases, table);
                String field = tableAlias + "." + quoteIdentifier(column);

                if (operator.equalsIgnoreCase("IN")) {
                    List<String> placeholders = new ArrayList<>();
                    for (JsonNode value : rule.get("values")) {
                        placeholders.add("?");
                        params.add(valueOf(value));
                    }
                    whereParts.add(field + " IN (" + String.join(", ", placeholders) + ")");
                } else if (operator.equalsIgnoreCase("BETWEEN")) {
                    whereParts.add(field + " BETWEEN ? AND ?");
                    params.add(valueOf(rule.get("from")));
                    params.add(valueOf(rule.get("to")));
                } else {
                    whereParts.add(field + " " + operator + " ?");
                    params.add(valueOf(rule.get("value")));
                }
            }

            if (!whereParts.isEmpty()) {
                sql.append(" WHERE ").append(String.join(" " + condition + " ", whereParts));
            }
        }

        // 8. GROUP BY (only when measures are present — otherwise it's a plain projection)
        if (!groupByParts.isEmpty() && measures != null && measures.isArray() && measures.size() > 0) {
            sql.append(" GROUP BY ").append(String.join(", ", groupByParts));
        }

        // 9. ORDER BY (sorts reference the output alias, e.g. avg_salary)
        JsonNode sorting = config.get("sorting");
        if (sorting != null && sorting.isArray()) {
            List<String> orderParts = new ArrayList<>();
            for (JsonNode sort : sorting) {
                String field = quoteIdentifier(validateIdentifier(sort.get("field").asText(), "sort field"));
                String direction = validateDirection(sort.get("direction").asText());
                orderParts.add(field + " " + direction);
            }
            if (!orderParts.isEmpty()) {
                sql.append(" ORDER BY ").append(String.join(", ", orderParts));
            }
        }

        // 10. Pagination
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
        if (identifier == null || !SAFE_IDENTIFIER.matcher(identifier).matches()) {
            throw new IllegalArgumentException("Invalid " + kind + " name: " + identifier);
        }
        return identifier;
    }

    private static String quoteIdentifier(String identifier) {
        return "\"" + identifier.replace("\"", "\"\"") + "\"";
    }

    private static String optText(JsonNode node) {
        return node == null || node.isNull() ? null : node.asText();
    }

    /** Resolves the alias (t0, t1, ...) previously assigned to a table, failing if it wasn't declared in tables.used. */
    private static String getTableAlias(Map<String, String> tableAliases, String tableName) {
        String alias = tableAliases.get(tableName);
        if (alias == null) {
            throw new IllegalArgumentException("Table not found in tables.used: " + tableName);
        }
        return alias;
    }

    private static String validateJoinType(String joinType) {
        String upper = joinType == null ? "" : joinType.toUpperCase();
        if (!VALID_JOIN_TYPES.contains(upper)) {
            throw new IllegalArgumentException("Invalid join type: " + joinType);
        }
        return switch (upper) {
            case "INNER_JOIN" -> "INNER JOIN";
            case "LEFT_JOIN" -> "LEFT JOIN";
            case "RIGHT_JOIN" -> "RIGHT JOIN";
            case "FULL_JOIN" -> "FULL JOIN";
            default -> throw new IllegalArgumentException("Invalid join type: " + joinType);
        };
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

        GeneratedQuery query = generateSql(config);

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
        GeneratedQuery query = generateSql(config);

        List<Map<String, Object>> result = jdbcTemplate.queryForList(query.sql(), query.params().toArray());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("generatedSql", renderPreview(query));
        response.put("data", result);

        return response;
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public org.springframework.http.ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException ex) {
        return org.springframework.http.ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }
}