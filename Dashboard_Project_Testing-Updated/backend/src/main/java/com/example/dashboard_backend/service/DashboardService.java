package com.example.dashboard_backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.dashboard_backend.controller.QueryController;
import com.example.dashboard_backend.query.QueryConfigNormalizer;
import jakarta.annotation.PostConstruct;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class DashboardService {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final QueryConfigNormalizer configNormalizer;

    public DashboardService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper,
                            QueryConfigNormalizer configNormalizer) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.configNormalizer = configNormalizer;
    }

    @PostConstruct
    public void initializeTables() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS dashboards (
                  dashboard_id UUID PRIMARY KEY,
                  user_id VARCHAR(255),
                  name VARCHAR(255),
                  description TEXT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS dashboard_widgets (
                  widget_name VARCHAR(255),
                  dashboard_id UUID REFERENCES dashboards(dashboard_id) ON DELETE CASCADE,
                  layout_json JSONB,
                  chart_config_json JSONB,
                  database_config_json JSONB,
                  generated_sql TEXT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """);

        // Add generated_sql column to existing tables that predate this column
        jdbcTemplate.execute("""
                ALTER TABLE dashboard_widgets
                ADD COLUMN IF NOT EXISTS generated_sql TEXT
                """);

        // Scope each dashboard to the schema (dataset) it was built from.
        jdbcTemplate.execute("""
                ALTER TABLE dashboards
                ADD COLUMN IF NOT EXISTS schema_id UUID
                """);

        // Ensure data_uploads.schema_id exists before the backfill JOIN references it.
        // IngestionMetadataRepository also adds this column but its @PostConstruct
        // may run after ours since there is no declared dependency between the two beans.
        jdbcTemplate.execute("""
                ALTER TABLE data_uploads
                ADD COLUMN IF NOT EXISTS schema_id UUID
                """);

        // Backfill schema_id for dashboards created before this column existed, by
        // resolving the earliest widget's dataset upload_id to its schema_id. The CASE
        // guard ensures the ::uuid cast only runs on values that look like a UUID.
        jdbcTemplate.execute("""
                UPDATE dashboards d
                SET schema_id = sub.schema_id
                FROM (
                  SELECT DISTINCT ON (v.dashboard_id) v.dashboard_id, du.schema_id
                  FROM (
                    SELECT dashboard_id,
                      CASE WHEN database_config_json->>'dataset' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                           THEN (database_config_json->>'dataset')::uuid END AS upload_id,
                      created_at
                    FROM dashboard_widgets
                  ) v
                  JOIN data_uploads du ON du.id = v.upload_id
                  WHERE v.upload_id IS NOT NULL AND du.schema_id IS NOT NULL
                  ORDER BY v.dashboard_id, v.created_at ASC
                ) sub
                WHERE d.dashboard_id = sub.dashboard_id
                  AND d.schema_id IS NULL
                  AND sub.schema_id IS NOT NULL
                """);
    }

        public Map<String, Object> createDashboard(Map<String, Object> request) {
        UUID dashboardId = UUID.randomUUID();
        String userId = defaultIfBlank(asText(request.get("user_id")), "anonymous");
        String name = defaultIfBlank(asText(request.get("name")), "Untitled Dashboard");
        String description = asText(request.get("description"));
        UUID schemaId = parseUuidOrNull(asText(request.get("schema_id")));

        jdbcTemplate.update(
            """
            INSERT INTO dashboards (dashboard_id, user_id, name, description, schema_id)
            VALUES (?, ?, ?, ?, ?)
            """,
            dashboardId,
            userId,
            name,
            description,
            schemaId
        );

        List<Map<String, Object>> widgets = extractWidgets(request.get("widgets"));
        for (Map<String, Object> widget : widgets) {
            String generatedSql = generateSqlForWidget(widget.get("database_config_json"));
            jdbcTemplate.update(
                """
                INSERT INTO dashboard_widgets (
                  widget_name,
                  dashboard_id,
                  layout_json,
                  chart_config_json,
                  database_config_json,
                  generated_sql
                ) VALUES (?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?)
                """,
                defaultIfBlank(asText(widget.get("widget_name")), "widget"),
                dashboardId,
                toJson(widget.get("layout_json")),
                toJson(widget.get("chart_config_json")),
                toJson(widget.get("database_config_json")),
                generatedSql
            );
        }

        return getDashboardById(dashboardId);
        }

        public Map<String, Object> updateDashboard(UUID dashboardId, Map<String, Object> request) {
        Integer count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM dashboards WHERE dashboard_id = ?",
            Integer.class,
            dashboardId
        );

        if (count == null || count == 0) {
            throw new IllegalArgumentException("Dashboard not found: " + dashboardId);
        }

        String userId = defaultIfBlank(asText(request.get("user_id")), "anonymous");
        String name = defaultIfBlank(asText(request.get("name")), "Untitled Dashboard");
        String description = asText(request.get("description"));
        UUID schemaId = parseUuidOrNull(asText(request.get("schema_id")));

        jdbcTemplate.update(
            """
            UPDATE dashboards
            SET user_id = ?, name = ?, description = ?, schema_id = COALESCE(?, schema_id), updated_at = CURRENT_TIMESTAMP
            WHERE dashboard_id = ?
            """,
            userId,
            name,
            description,
            schemaId,
            dashboardId
        );

        jdbcTemplate.update("DELETE FROM dashboard_widgets WHERE dashboard_id = ?", dashboardId);

        List<Map<String, Object>> widgets = extractWidgets(request.get("widgets"));
        for (Map<String, Object> widget : widgets) {
            String generatedSql = generateSqlForWidget(widget.get("database_config_json"));
            jdbcTemplate.update(
                """
                INSERT INTO dashboard_widgets (
                  widget_name,
                  dashboard_id,
                  layout_json,
                  chart_config_json,
                  database_config_json,
                  generated_sql
                ) VALUES (?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?)
                """,
                defaultIfBlank(asText(widget.get("widget_name")), "widget"),
                dashboardId,
                toJson(widget.get("layout_json")),
                toJson(widget.get("chart_config_json")),
                toJson(widget.get("database_config_json")),
                generatedSql
            );
        }

        return getDashboardById(dashboardId);
        }

    public List<Map<String, Object>> getDashboards() {
        List<Map<String, Object>> dashboards = jdbcTemplate.queryForList(
                """
                SELECT dashboard_id, user_id, name, description, schema_id, created_at, updated_at
                FROM dashboards
                ORDER BY created_at DESC
                """
        );

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> dashboardRow : dashboards) {
            UUID dashboardId = (UUID) dashboardRow.get("dashboard_id");
            Map<String, Object> mapped = new LinkedHashMap<>(dashboardRow);
            mapped.put("widgets", getWidgetsForDashboard(dashboardId));
            result.add(mapped);
        }

        return result;
    }

    public Map<String, Object> getDashboardById(UUID dashboardId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT dashboard_id, user_id, name, description, schema_id, created_at, updated_at
                FROM dashboards
                WHERE dashboard_id = ?
                """,
                dashboardId
        );

        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Dashboard not found: " + dashboardId);
        }

        Map<String, Object> dashboard = new LinkedHashMap<>(rows.get(0));
        dashboard.put("widgets", getWidgetsForDashboard(dashboardId));
        return dashboard;
    }

    public Map<String, Object> deleteDashboard(UUID dashboardId) {
        int deleted = jdbcTemplate.update(
            "DELETE FROM dashboards WHERE dashboard_id = ?",
            dashboardId
        );

        if (deleted == 0) {
            throw new IllegalArgumentException("Dashboard not found: " + dashboardId);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("dashboard_id", dashboardId.toString());
        return response;
    }

    public List<Map<String, Object>> getDashboardsByUserId(String userId) {
        List<Map<String, Object>> dashboards = jdbcTemplate.queryForList(
                """
                SELECT dashboard_id, user_id, name, description, schema_id, created_at, updated_at
                FROM dashboards
                WHERE user_id = ?
                ORDER BY created_at DESC
                """,
                userId
        );

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> dashboardRow : dashboards) {
            UUID dashboardId = (UUID) dashboardRow.get("dashboard_id");
            Map<String, Object> mapped = new LinkedHashMap<>(dashboardRow);
            mapped.put("widgets", getWidgetsForDashboard(dashboardId));
            result.add(mapped);
        }

        return result;
    }

    private List<Map<String, Object>> getWidgetsForDashboard(UUID dashboardId) {
        List<Map<String, Object>> widgets = jdbcTemplate.queryForList(
                """
                SELECT widget_name, dashboard_id, layout_json, chart_config_json, database_config_json, created_at, updated_at
                FROM dashboard_widgets
                WHERE dashboard_id = ?
                ORDER BY created_at ASC
                """,
                dashboardId
        );

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> widget : widgets) {
            Map<String, Object> mapped = new LinkedHashMap<>();
            mapped.put("widget_name", widget.get("widget_name"));
            mapped.put("dashboard_id", widget.get("dashboard_id"));
            mapped.put("layout_json", fromJson(widget.get("layout_json")));
            mapped.put("chart_config_json", fromJson(widget.get("chart_config_json")));
            Object dbConfig = fromJson(widget.get("database_config_json"));
            mapped.put("database_config_json", dbConfig);
            attachHydratedData(mapped, dbConfig);
            mapped.put("created_at", widget.get("created_at"));
            mapped.put("updated_at", widget.get("updated_at"));
            result.add(mapped);
        }

        return result;
    }

    private List<Map<String, Object>> extractWidgets(Object widgetsObject) {
        if (!(widgetsObject instanceof List<?> rawList)) {
            return Collections.emptyList();
        }

        List<Map<String, Object>> widgets = new ArrayList<>();
        for (Object item : rawList) {
            if (item instanceof Map<?, ?> map) {
                Map<String, Object> casted = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : map.entrySet()) {
                    casted.put(String.valueOf(entry.getKey()), entry.getValue());
                }
                widgets.add(casted);
            }
        }

        return widgets;
    }

    private String toJson(Object value) {
        try {
            if (value == null) {
                return "{}";
            }
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Invalid JSON payload in widget config", e);
        }
    }

    private Object fromJson(Object dbJson) {
        if (dbJson == null) {
            return Collections.emptyMap();
        }

        String jsonText = String.valueOf(dbJson);
        if (jsonText.isBlank()) {
            return Collections.emptyMap();
        }

        try {
            return objectMapper.readValue(jsonText, new TypeReference<Map<String, Object>>() {
            });
        } catch (JsonProcessingException ignored) {
            return jsonText;
        }
    }

    private String asText(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private UUID parseUuidOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private String defaultIfBlank(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value;
    }

    /**
     * Hydrates widget data by executing SQL generated from the widget's database config.
     *
     * <p>The raw config is run through the shared {@link QueryConfigNormalizer} — the SAME normalization
     * the live {@code /execute-query} path uses — so nested/joined datasets get their join-aware
     * {@code datasetFromSql} derived table and the hydration query returns real rows instead of failing
     * on child-only columns. No widget query SQL is hardcoded here; all query text comes from
     * {@link QueryController#generateSql}.
     */
    private void attachHydratedData(Map<String, Object> target, Object dbConfig) {
        if (!(dbConfig instanceof Map<?, ?>)) {
            return;
        }

        try {
            QueryController.GeneratedQuery generated = buildWidgetQuery(dbConfig);
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    generated.sql(),
                    generated.params().toArray()
            );
            target.put("generated_sql", QueryController.renderPreview(generated));
            target.put("hydrated_data", rows);
        } catch (Exception ignored) {
            // Keep dashboard retrieval resilient even if one widget's query config is invalid.
            target.put("generated_sql", "");
            target.put("hydrated_data", Collections.emptyList());
        }
    }

    /**
     * Builds the persisted {@code generated_sql} for a widget: a self-contained, join-aware SQL string
     * (bind values inlined via {@link QueryController#renderPreview}) so the value stored in
     * {@code dashboard_widgets.generated_sql} is a valid, runnable query for nested/joined datasets too.
     * Returns an empty string when the config is missing or invalid.
     */
    private String generateSqlForWidget(Object dbConfigObj) {
        if (dbConfigObj == null) {
            return "";
        }

        try {
            return QueryController.renderPreview(buildWidgetQuery(dbConfigObj));
        } catch (Exception e) {
            // If SQL generation fails, store empty string
            return "";
        }
    }

    /**
     * Turns a widget's stored {@code database_config_json} into an execution-ready {@link
     * QueryController.GeneratedQuery} using the shared normalizer (dataset resolution, field remap and
     * the join-aware derived table) followed by the pure SQL builder.
     */
    private QueryController.GeneratedQuery buildWidgetQuery(Object dbConfigObj) {
        JsonNode rawConfig = objectMapper.valueToTree(
                dbConfigObj instanceof Map<?, ?> map ? map : new LinkedHashMap<>()
        );
        JsonNode normalizedConfig = configNormalizer.normalize(rawConfig);
        return QueryController.generateSql(normalizedConfig);
    }
}
