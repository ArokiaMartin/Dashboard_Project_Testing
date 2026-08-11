package com.example.dashboard_backend.live;

import com.example.dashboard_backend.util.AppConstants;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;

/**
 * Control-plane endpoints for live sources (list/create/detail/patch/delete + preview-ddl, test-event,
 * health, token rotation, external-Postgres connection probe). The ingest hot path itself stays in
 * {@link LiveIngestController}.
 *
 * <p>Every endpoint here is unauthenticated at the network level, like the rest of this app. Creation
 * mints a per-source ingest token whose plaintext is returned <strong>once</strong>; only its hash is
 * stored.
 */
@RestController
@RequestMapping("/api/live/sources")
@Tag(name = "Live Source API", description = "Manage live (streaming) sources")
public class LiveSourceController {

    private final LiveSourceService service;

    public LiveSourceController(LiveSourceService service) {
        this.service = service;
    }

    @Operation(summary = "List live sources with a liveness summary")
    @GetMapping
    public List<Map<String, Object>> list() {
        return service.list();
    }

    @Operation(summary = "Create a live source", description = "Body is the wizard's output. Returns the ingest token once.")
    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@RequestBody JsonNode payload) {
        LiveSourceService.CreateResult result = service.create(payload, AppConstants.USER_123);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", result.id().toString());
        body.put("ingestToken", result.ingestToken());
        body.put("ingestUrl", ingestUrl(result.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    @Operation(summary = "Preview the DDL a create would run. No side effects.")
    @PostMapping("/preview-ddl")
    public Map<String, Object> previewDdl(@RequestBody JsonNode payload) {
        return Map.of("ddl", service.previewDdl(payload));
    }

    @Operation(summary = "Validate an external Postgres connection. The password is never stored or returned.")
    @PostMapping("/test-connection")
    public Map<String, Object> testConnection(@RequestBody JsonNode body) {
        return probeConnection(body);
    }

    @Operation(summary = "Live source detail incl. field list and effective settings")
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> get(@PathVariable UUID id) {
        return service.detail(id, ingestUrl(id))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @Operation(summary = "Edit window/bucket/retention/timezone/refresh — never the schema")
    @PatchMapping("/{id}")
    public ResponseEntity<Map<String, Object>> patch(@PathVariable UUID id, @RequestBody JsonNode body) {
        return service.patch(id, body, ingestUrl(id))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @Operation(summary = "Delete a live source and drop its table (requires ?force=true)")
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> delete(@PathVariable UUID id,
                                                      @RequestParam(defaultValue = "false") boolean force) {
        if (!force) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                    "error", "force_required",
                    "message", "Deleting a live source drops its table and all events. Retry with ?force=true."));
        }
        boolean deleted = service.delete(id);
        return deleted ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @Operation(summary = "Health snapshot for a source")
    @GetMapping("/{id}/health")
    public ResponseEntity<Map<String, Object>> health(@PathVariable UUID id) {
        return service.health(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @Operation(summary = "Validate one sample event against the schema. Inserts nothing.")
    @PostMapping("/{id}/test-event")
    public ResponseEntity<Map<String, Object>> testEvent(@PathVariable UUID id, @RequestBody JsonNode event) {
        return service.testEvent(id, event)
                .<ResponseEntity<Map<String, Object>>>map(results -> ResponseEntity.ok(Map.of("results", results)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @Operation(summary = "Rotate the ingest token. The previous token stops working immediately.")
    @PostMapping("/{id}/regenerate-token")
    public ResponseEntity<Map<String, Object>> regenerateToken(@PathVariable UUID id) {
        return service.regenerateToken(id)
                .<ResponseEntity<Map<String, Object>>>map(token -> ResponseEntity.ok(Map.of("ingestToken", token)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** Absolute ingest URL for a source, built from the incoming request's host/context. */
    private String ingestUrl(UUID id) {
        return ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/api/live/{id}/events")
                .buildAndExpand(id)
                .toUriString();
    }

    /**
     * A transient connection probe for {@code external_pg}. The password is used only for this attempt
     * and is never persisted, returned or logged.
     */
    private Map<String, Object> probeConnection(JsonNode body) {
        JsonNode conn = body == null ? null : body.get("connection");
        String password = body == null || body.get("password") == null ? "" : body.get("password").asText();
        if (conn == null) {
            return Map.of("status", "host unreachable");
        }
        String host = asText(conn, "host", "");
        int port = conn.path("port").asInt(5432);
        String database = asText(conn, "database", "");
        String schema = asText(conn, "schema", "public");
        String table = asText(conn, "table", "");
        String username = asText(conn, "username", "");
        String sslMode = asText(conn, "sslMode", "require");

        String url = "jdbc:postgresql://" + host + ":" + port + "/" + database
                + "?connectTimeout=5&socketTimeout=5&sslmode=" + sslMode;
        Properties props = new Properties();
        props.setProperty("user", username);
        props.setProperty("password", password);

        try (Connection c = DriverManager.getConnection(url, props)) {
            boolean found = tableExists(c, schema, table);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("status", found ? "connected" : "table not found");
            return out;
        } catch (Exception e) {
            String msg = String.valueOf(e.getMessage()).toLowerCase();
            String status;
            if (msg.contains("password") || msg.contains("authentication")) {
                status = "authentication failed";
            } else if (msg.contains("permission") || msg.contains("denied")) {
                status = "permission denied";
            } else {
                status = "host unreachable";
            }
            return Map.of("status", status);
        }
    }

    private boolean tableExists(Connection c, String schema, String table) {
        if (table == null || table.isBlank()) {
            return false;
        }
        try (var ps = c.prepareStatement(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1")) {
            ps.setString(1, schema == null || schema.isBlank() ? "public" : schema);
            ps.setString(2, table);
            try (var rs = ps.executeQuery()) {
                return rs.next();
            }
        } catch (Exception e) {
            return false;
        }
    }

    private static String asText(JsonNode node, String field, String fallback) {
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? fallback : v.asText();
    }
}
