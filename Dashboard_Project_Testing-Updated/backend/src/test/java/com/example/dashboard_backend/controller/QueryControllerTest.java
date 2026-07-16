package com.example.dashboard_backend.controller;

import com.example.dashboard_backend.controller.QueryController.GeneratedQuery;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for the pure SQL-generation logic in {@link QueryController#generateSql(JsonNode)}.
 * These exercise the security-critical path (identifier validation + parameter binding) without a
 * database.
 */
class QueryControllerTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private GeneratedQuery generate(String json) throws Exception {
        JsonNode config = mapper.readTree(json);
        return QueryController.generateSql(config);
    }

    @Test
    void buildsGroupedAggregateQuery() throws Exception {
        GeneratedQuery query = generate("""
            {
              "dataset": "orders",
              "dimensions": ["region"],
              "measures": [{"field": "revenue", "aggregation": "SUM", "alias": "total_revenue"}]
            }
            """);

        assertTrue(query.sql().contains("\"region\""), "dimension should be quoted");
        assertTrue(query.sql().contains("SUM("), "measure should be aggregated");
        assertTrue(query.sql().contains("AS \"total_revenue\""), "alias should be quoted");
        assertTrue(query.sql().contains("FROM \"orders\""), "dataset should be quoted");
        assertTrue(query.sql().contains("GROUP BY \"region\""), "grouped by dimension");
    }

    @Test
    void selectsAllWhenNoDimensionsOrMeasures() throws Exception {
        GeneratedQuery query = generate("{\"dataset\": \"orders\"}");
        assertTrue(query.sql().startsWith("SELECT * FROM \"orders\""));
    }

    @Test
    void filterValuesArePassedAsBindParametersNotLiterals() throws Exception {
        GeneratedQuery query = generate("""
            {
              "dataset": "orders",
              "dimensions": ["region"],
              "filters": {"condition": "AND", "rules": [
                {"field": "status", "operator": "=", "value": "shipped"}
              ]}
            }
            """);

        assertTrue(query.sql().contains("\"status\" = ?"), "value must be a bind placeholder");
        assertFalse(query.sql().contains("shipped"), "raw value must not appear in the SQL text");
        assertEquals(List.of("shipped"), query.params());
    }

    @Test
    void inOperatorExpandsToMultiplePlaceholders() throws Exception {
        GeneratedQuery query = generate("""
            {
              "dataset": "orders",
              "filters": {"rules": [
                {"field": "status", "operator": "IN", "values": ["completed", "shipped"]}
              ]}
            }
            """);

        assertTrue(query.sql().contains("\"status\" IN (?, ?)"));
        assertEquals(List.of("completed", "shipped"), query.params());
    }

    @Test
    void isNullFilterEmitsNoBindParameter() throws Exception {
        GeneratedQuery query = generate("""
            {
              "dataset": "orders",
              "filters": {"rules": [
                {"field": "segment", "operator": "IS NULL"}
              ]}
            }
            """);

        assertTrue(query.sql().contains("\"segment\" IS NULL"), "null-bucket filter should render IS NULL");
        assertTrue(query.params().isEmpty(), "IS NULL must not bind a parameter");
    }

    @Test
    void appliesPaginationAsBoundLimitAndOffset() throws Exception {
        GeneratedQuery query = generate("""
            {"dataset": "orders", "pagination": {"top": 50, "offset": 10}}
            """);

        assertTrue(query.sql().contains("LIMIT ?"));
        assertTrue(query.sql().contains("OFFSET ?"));
        assertEquals(List.of(50, 10), query.params());
    }

    @Test
    void rejectsInvalidAggregation() {
        assertThrows(IllegalArgumentException.class, () -> generate("""
            {
              "dataset": "orders",
              "measures": [{"field": "revenue", "aggregation": "DROP", "alias": "x"}]
            }
            """));
    }

    @Test
    void rejectsInvalidSortDirection() {
        assertThrows(IllegalArgumentException.class, () -> generate("""
            {"dataset": "orders", "sorting": [{"field": "region", "direction": "SIDEWAYS"}]}
            """));
    }

    @Test
    void rejectsInvalidFilterOperator() {
        assertThrows(IllegalArgumentException.class, () -> generate("""
            {"dataset": "orders", "filters": {"rules": [
                {"field": "status", "operator": "; DROP", "value": "x"}
            ]}}
            """));
    }
}
