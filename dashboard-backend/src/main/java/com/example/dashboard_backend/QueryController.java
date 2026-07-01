package com.example.dashboard_backend;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
public class QueryController {

    public static String generateSql(JsonNode config) {

        String dataset = config.get("dataset").asText();

        List<String> selectParts = new ArrayList<>();
        List<String> groupByParts = new ArrayList<>();

        // 1. dimensions
        JsonNode dimensions = config.get("dimensions");

        if (dimensions != null && dimensions.isArray()) {
            for (JsonNode dimension : dimensions) {
                String field = dimension.asText();

                selectParts.add(field);
                groupByParts.add(field);
            }
        }

        // 2. measures
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

        // 3. SELECT
        sql.append("SELECT ");
        sql.append(String.join(", ", selectParts));

        // 4. FROM
        sql.append(" FROM ");
        sql.append(dataset);

        // 5. WHERE filters
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
                        values.add("'" + value.asText() + "'");
                    }

                    whereParts.add(field + " IN (" + String.join(", ", values) + ")");

                } else if (operator.equalsIgnoreCase("BETWEEN")) {

                    String from = rule.get("from").asText();
                    String to = rule.get("to").asText();

                    whereParts.add(field + " BETWEEN '" + from + "' AND '" + to + "'");

                } else {

                    JsonNode valueNode = rule.get("value");

                    String value;

                    if (valueNode.isNumber()) {
                        value = valueNode.asText();
                    } else {
                        value = "'" + valueNode.asText() + "'";
                    }

                    whereParts.add(field + " " + operator + " " + value);
                }
            }

            if (!whereParts.isEmpty()) {
                sql.append(" WHERE ");
                sql.append(String.join(" " + condition + " ", whereParts));
            }
        }

        // 6. GROUP BY
        if (!groupByParts.isEmpty() && measures != null && measures.isArray()) {
            sql.append(" GROUP BY ");
            sql.append(String.join(", ", groupByParts));
        }

        // 7. HAVING
        JsonNode having = config.get("having");

        if (having != null && having.isArray()) {
            List<String> havingParts = new ArrayList<>();

            for (JsonNode rule : having) {
                String measure = rule.get("measure").asText();
                String operator = cleanOperator(rule.get("operator").asText());
                JsonNode valueNode = rule.get("value");

                String value;

                if (valueNode.isNumber()) {
                    value = valueNode.asText();
                } else {
                    value = "'" + valueNode.asText() + "'";
                }

                havingParts.add(measure + " " + operator + " " + value);
            }

            if (!havingParts.isEmpty()) {
                sql.append(" HAVING ");
                sql.append(String.join(" AND ", havingParts));
            }
        }

        // 8. ORDER BY
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

        // 9. Pagination
        JsonNode pagination = config.get("pagination");

        if (pagination != null) {
            int top = pagination.get("top").asInt();
            int offset = pagination.get("offset").asInt();

            sql.append(" LIMIT ");
            sql.append(top);

            sql.append(" OFFSET ");
            sql.append(offset);
        }

        return sql.toString();
    }

    private static String cleanOperator(String operator) {
        return operator
                .replace("&gt;", ">")
                .replace("&lt;", "<")
                .replace("&gt;=", ">=")
                .replace("&lt;=", "<=");
    }

    @PostMapping("/generate-query")
    public Map<String, String> generateQuery(
            @RequestBody JsonNode config) {

        String sql = generateSql(config);

        return Map.of(
                "generatedSql",
                sql);
    }

}