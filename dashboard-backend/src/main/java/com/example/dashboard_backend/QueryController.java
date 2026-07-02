package com.example.dashboard_backend;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@CrossOrigin(origins = "*")
public class QueryController {

    private final JdbcTemplate jdbcTemplate;

    public QueryController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public static String generateSql(JsonNode config) {

        String dataset = config.get("dataset").asText();

        List<String> selectParts = new ArrayList<>();
        List<String> groupByParts = new ArrayList<>();

        // 1. Dimensions
        JsonNode dimensions = config.get("dimensions");

        if (dimensions != null && dimensions.isArray()) {
            for (JsonNode dimension : dimensions) {
                String field = dimension.asText();

                selectParts.add(field);
                groupByParts.add(field);
            }
        }

        // 2. Measures
        JsonNode measures = config.get("measures");

        if (measures != null && measures.isArray()) {
            for (JsonNode measure : measures) {
                String field = measure.get("field").asText();
                String aggregation = measure.get("aggregation").asText();
                String alias = measure.get("alias").asText();

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
                    ? filters.get("condition").asText()
                    : "AND";

            List<String> whereParts = new ArrayList<>();

            JsonNode rules = filters.get("rules");

            for (JsonNode rule : rules) {
                String field = rule.get("field").asText();
                String operator = cleanOperator(rule.get("operator").asText());

                if (operator.equalsIgnoreCase("IN")) {

                    List<String> values = new ArrayList<>();

                    for (JsonNode value : rule.get("values")) {
                        values.add(formatValue(value));
                    }

                    whereParts.add(field + " IN (" + String.join(", ", values) + ")");

                } else if (operator.equalsIgnoreCase("BETWEEN")) {

                    String from = rule.get("from").asText();
                    String to = rule.get("to").asText();

                    whereParts.add(field + " BETWEEN '" + from + "' AND '" + to + "'");

                } else {

                    JsonNode valueNode = rule.get("value");
                    String value = formatValue(valueNode);

                    whereParts.add(field + " " + operator + " " + value);
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
                String measure = rule.get("measure").asText();
                String operator = cleanOperator(rule.get("operator").asText());
                JsonNode valueNode = rule.get("value");

                String value = formatValue(valueNode);

                havingParts.add(measure + " " + operator + " " + value);
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
                String field = sort.get("field").asText();
                String direction = sort.get("direction").asText();

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

            sql.append(" LIMIT ");
            sql.append(top);

            sql.append(" OFFSET ");
            sql.append(offset);
        }

        return sql.toString();
    }

    private static String formatValue(JsonNode valueNode) {
        if (valueNode.isNumber() || valueNode.isBoolean()) {
            return valueNode.asText();
        }

        return "'" + valueNode.asText().replace("'", "''") + "'";
    }

    private static String cleanOperator(String operator) {
        return switch (operator.toUpperCase()) {
            case "=", "!=", "<>", ">", "<", ">=", "<=", "IN", "BETWEEN", "LIKE" -> operator.toUpperCase();
            default -> throw new IllegalArgumentException("Invalid operator: " + operator);
        };
    }

    @PostMapping("/generate-query")
    public Map<String, String> generateQuery(@RequestBody JsonNode config) {

        String sql = generateSql(config);

        return Map.of(
                "generatedSql", sql
        );
    }

    @PostMapping("/execute-query")
    public Map<String, Object> executeQuery(@RequestBody JsonNode config) {
        System.out.println("Received config: " + config.toString());
        String sql = generateSql(config);

        List<Map<String, Object>> result = jdbcTemplate.queryForList(sql);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("generatedSql", sql);
        response.put("data", result);

        return response;
    }
}