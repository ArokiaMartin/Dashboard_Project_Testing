package com.example.dashboard_backend.dashboard;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
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

    public DashboardService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
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
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """);
    }

        public Map<String, Object> createDashboard(Map<String, Object> request) {
        UUID dashboardId = UUID.randomUUID();
        String userId = defaultIfBlank(asText(request.get("user_id")), "anonymous");
        String name = defaultIfBlank(asText(request.get("name")), "Untitled Dashboard");
        String description = asText(request.get("description"));

        jdbcTemplate.update(
            """
            INSERT INTO dashboards (dashboard_id, user_id, name, description)
            VALUES (?, ?, ?, ?)
            """,
            dashboardId,
            userId,
            name,
            description
        );

        List<Map<String, Object>> widgets = extractWidgets(request.get("widgets"));
        for (Map<String, Object> widget : widgets) {
            jdbcTemplate.update(
                """
                INSERT INTO dashboard_widgets (
                  widget_name,
                  dashboard_id,
                  layout_json,
                  chart_config_json,
                  database_config_json
                ) VALUES (?, ?, ?::jsonb, ?::jsonb, ?::jsonb)
                """,
                defaultIfBlank(asText(widget.get("widget_name")), "widget"),
                dashboardId,
                toJson(widget.get("layout_json")),
                toJson(widget.get("chart_config_json")),
                toJson(widget.get("database_config_json"))
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

        jdbcTemplate.update(
            """
            UPDATE dashboards
            SET user_id = ?, name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
            WHERE dashboard_id = ?
            """,
            userId,
            name,
            description,
            dashboardId
        );

        jdbcTemplate.update("DELETE FROM dashboard_widgets WHERE dashboard_id = ?", dashboardId);

        List<Map<String, Object>> widgets = extractWidgets(request.get("widgets"));
        for (Map<String, Object> widget : widgets) {
            jdbcTemplate.update(
                """
                INSERT INTO dashboard_widgets (
                  widget_name,
                  dashboard_id,
                  layout_json,
                  chart_config_json,
                  database_config_json
                ) VALUES (?, ?, ?::jsonb, ?::jsonb, ?::jsonb)
                """,
                defaultIfBlank(asText(widget.get("widget_name")), "widget"),
                dashboardId,
                toJson(widget.get("layout_json")),
                toJson(widget.get("chart_config_json")),
                toJson(widget.get("database_config_json"))
            );
        }

        return getDashboardById(dashboardId);
        }

    public List<Map<String, Object>> getDashboards() {
        List<Map<String, Object>> dashboards = jdbcTemplate.queryForList(
                """
                SELECT dashboard_id, user_id, name, description, created_at, updated_at
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
                SELECT dashboard_id, user_id, name, description, created_at, updated_at
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

    public List<Map<String, Object>> getDashboardsByUserId(String userId) {
        List<Map<String, Object>> dashboards = jdbcTemplate.queryForList(
                """
                SELECT dashboard_id, user_id, name, description, created_at, updated_at
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
            mapped.put("database_config_json", fromJson(widget.get("database_config_json")));
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

    private String defaultIfBlank(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value;
    }
}
