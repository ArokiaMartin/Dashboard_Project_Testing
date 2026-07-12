package com.example.dashboard_backend.controller;

import com.example.dashboard_backend.ingestion.schema.SchemaValidationService;
import com.example.dashboard_backend.model.SchemaResponse;
import com.example.dashboard_backend.model.SchemaUploadRequest;
import com.example.dashboard_backend.service.SchemaManagementService;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@CrossOrigin(origins = "*")
@RequestMapping("/api/schemas")
@Tag(name = "Schema Management", description = "APIs for managing data schemas for enterprise-level data ingestion")
public class SchemaController {

    private final SchemaManagementService schemaManagementService;

    public SchemaController(SchemaManagementService schemaManagementService) {
        this.schemaManagementService = schemaManagementService;
    }

    @Operation(
        summary = "Upload a new schema",
        description = "Upload a schema definition with field metadata. Schema must have a unique name per user.",
        responses = {
            @ApiResponse(responseCode = "200", description = "Schema created successfully"),
            @ApiResponse(responseCode = "400", description = "Invalid schema definition")
        }
    )
    @PostMapping("/upload")
    public ResponseEntity<SchemaResponse> uploadSchema(
        @RequestBody SchemaUploadRequest request,
        @RequestParam(defaultValue = "user_123") String userId
    ) {
        UUID userUuid = parseUserId(userId);
        SchemaResponse response = schemaManagementService.uploadSchema(
            userUuid,
            request,
            userId
        );
        return ResponseEntity.ok(response);
    }

    @Operation(
        summary = "Get schema by ID",
        description = "Retrieve a specific schema with all its field definitions.",
        responses = {
            @ApiResponse(responseCode = "200", description = "Schema retrieved successfully"),
            @ApiResponse(responseCode = "404", description = "Schema not found")
        }
    )
    @GetMapping("/{schemaId}")
    public ResponseEntity<SchemaResponse> getSchema(@PathVariable UUID schemaId) {
        SchemaResponse response = schemaManagementService.getSchema(schemaId);
        return ResponseEntity.ok(response);
    }

    @Operation(
        summary = "List all schemas for user",
        description = "Retrieve all active schemas created by the user.",
        responses = {
            @ApiResponse(responseCode = "200", description = "Schemas retrieved successfully")
        }
    )
    @GetMapping
    public ResponseEntity<List<SchemaResponse>> listSchemas(
        @RequestParam(defaultValue = "user_123") String userId
    ) {
        UUID userUuid = parseUserId(userId);
        List<SchemaResponse> schemas = schemaManagementService.listSchemasByUser(userUuid);
        return ResponseEntity.ok(schemas);
    }

    @Operation(
        summary = "Delete a schema",
        description = "Delete a schema and all associated audit logs.",
        responses = {
            @ApiResponse(responseCode = "200", description = "Schema deleted successfully"),
            @ApiResponse(responseCode = "404", description = "Schema not found")
        }
    )
    @DeleteMapping("/{schemaId}")
    public ResponseEntity<Map<String, String>> deleteSchema(
        @PathVariable UUID schemaId,
        @RequestParam(defaultValue = "user_123") String userId
    ) {
        schemaManagementService.deleteSchema(schemaId, userId);
        return ResponseEntity.ok(Map.of("message", "Schema deleted successfully"));
    }

    @Operation(
        summary = "Validate data against schema",
        description = "Validate JSON data against a schema definition without ingesting it. Returns validation errors and warnings.",
        responses = {
            @ApiResponse(responseCode = "200", description = "Validation complete"),
            @ApiResponse(responseCode = "404", description = "Schema not found")
        }
    )
    @PostMapping("/{schemaId}/validate")
    public ResponseEntity<Map<String, Object>> validateDataAgainstSchema(
        @PathVariable UUID schemaId,
        @RequestBody JsonNode data
    ) {
        SchemaValidationService.ValidationResult result = schemaManagementService.validateData(schemaId, data);

        Map<String, Object> response = new HashMap<>();
        response.put("isValid", result.isValid());
        response.put("errors", result.errors());
        response.put("warnings", result.warnings());
        response.put("errorCount", result.errors().size());
        response.put("warningCount", result.warnings().size());

        return ResponseEntity.ok(response);
    }

    @Operation(
        summary = "Validate data by schema name",
        description = "Validate JSON data against a schema identified by name. Returns validation errors and warnings.",
        responses = {
            @ApiResponse(responseCode = "200", description = "Validation complete"),
            @ApiResponse(responseCode = "404", description = "Schema not found")
        }
    )
    @PostMapping("/{schemaName}/validate-by-name")
    public ResponseEntity<Map<String, Object>> validateDataBySchemaName(
        @PathVariable String schemaName,
        @RequestBody JsonNode data,
        @RequestParam(defaultValue = "user_123") String userId
    ) {
        UUID userUuid = parseUserId(userId);
        SchemaValidationService.ValidationResult result = schemaManagementService.validateDataByName(userUuid, schemaName, data);

        Map<String, Object> response = new HashMap<>();
        response.put("isValid", result.isValid());
        response.put("errors", result.errors());
        response.put("warnings", result.warnings());
        response.put("errorCount", result.errors().size());
        response.put("warningCount", result.warnings().size());

        return ResponseEntity.ok(response);
    }

    private UUID parseUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            return com.example.dashboard_backend.util.AppConstants.USER_123;
        }
        try {
            return UUID.fromString(userId);
        } catch (IllegalArgumentException e) {
            return com.example.dashboard_backend.util.AppConstants.USER_123;
        }
    }
}
