package com.example.dashboard_backend.controller;

import com.example.dashboard_backend.service.DataVersioningService;
import com.example.dashboard_backend.model.DataVersion;
import com.example.dashboard_backend.model.VersionCheckResult;
import com.example.dashboard_backend.model.CheckDuplicateRequest;
import com.example.dashboard_backend.model.RegisterVersionRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * REST API for data versioning operations.
 * Handles duplicate detection, version registration, and version retrieval.
 */
@RestController
@RequestMapping("/api/data/versions")
@Tag(name = "Data Versioning", description = "Manage data versions with checksum-based deduplication")
public class DataVersioningController {

    private static final Logger logger = LoggerFactory.getLogger(DataVersioningController.class);
    private final DataVersioningService versioningService;

    public DataVersioningController(DataVersioningService versioningService) {
        this.versioningService = versioningService;
    }

    /**
     * Check if data is a duplicate of an existing version.
     * Used before ingestion to detect if uploaded data matches a previous version.
     */
    @PostMapping("/check-duplicate")
    @Operation(summary = "Check if data is a duplicate",
            description = "Compares checksum against existing versions in the schema")
    @ApiResponse(responseCode = "200", description = "Duplicate check result",
            content = @Content(schema = @Schema(implementation = VersionCheckResult.class)))
    @ApiResponse(responseCode = "400", description = "Invalid request")
    public ResponseEntity<VersionCheckResult> checkDuplicate(@RequestBody CheckDuplicateRequest request) {
        try {
            logger.info("Checking duplicate for schema: {}", request.schemaId());

            if (request.schemaId() == null || request.schemaId().isEmpty()) {
                return ResponseEntity.badRequest().build();
            }
            if (request.checksum() == null || request.checksum().isEmpty()) {
                return ResponseEntity.badRequest().build();
            }

            VersionCheckResult result = versioningService.checkDuplicate(request);
            logger.info("Duplicate check result: isDuplicate={}", result.isDuplicate());

            return ResponseEntity.ok(result);
        } catch (Exception e) {
            logger.error("Error checking duplicate", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Register a new data version.
     * Called after successful data ingestion to record version metadata.
     */
    @PostMapping("/register")
    @Operation(summary = "Register a new data version",
            description = "Records version metadata including checksum, row count, and duplicate status")
    @ApiResponse(responseCode = "201", description = "Version registered successfully",
            content = @Content(schema = @Schema(implementation = DataVersion.class)))
    @ApiResponse(responseCode = "400", description = "Invalid request")
    @ApiResponse(responseCode = "500", description = "Internal server error")
    public ResponseEntity<DataVersion> registerVersion(@RequestBody RegisterVersionRequest request) {
        try {
            logger.info("Registering version for schema: {}, table: {}",
                    request.schemaId(), request.tableName());

            // Validate required fields
            if (request.schemaId() == null || request.schemaId().isEmpty()) {
                return ResponseEntity.badRequest().build();
            }
            if (request.checksum() == null || request.checksum().isEmpty()) {
                return ResponseEntity.badRequest().build();
            }

            DataVersion version = versioningService.registerVersion(request);
            logger.info("Version registered successfully: id={}, number={}",
                    version.versionId(), version.versionNumber());

            return ResponseEntity.status(HttpStatus.CREATED).body(version);
        } catch (Exception e) {
            logger.error("Error registering version", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Get all versions for a specific schema.
     * Used in dashboard builder to populate version selector.
     */
    @GetMapping("/schema/{schemaId}")
    @Operation(summary = "Get all versions for a schema",
            description = "Returns list of all data versions for the given schema, ordered by version number")
    @ApiResponse(responseCode = "200", description = "List of versions",
            content = @Content(schema = @Schema(implementation = DataVersion.class)))
    @ApiResponse(responseCode = "404", description = "Schema not found")
    public ResponseEntity<List<DataVersion>> getVersionsBySchema(
            @PathVariable String schemaId) {
        try {
            if (schemaId == null || schemaId.isEmpty()) {
                return ResponseEntity.badRequest().build();
            }

            logger.info("Fetching versions for schema: {}", schemaId);
            List<DataVersion> versions = versioningService.getVersionsBySchema(schemaId);

            logger.info("Found {} versions for schema: {}", versions.size(), schemaId);
            return ResponseEntity.ok(versions);
        } catch (Exception e) {
            logger.error("Error fetching versions for schema: {}", schemaId, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Get a specific version by ID.
     * Used when loading version details for comparison or detailed view.
     */
    @GetMapping("/{versionId}")
    @Operation(summary = "Get version details",
            description = "Returns metadata for a specific data version")
    @ApiResponse(responseCode = "200", description = "Version details",
            content = @Content(schema = @Schema(implementation = DataVersion.class)))
    @ApiResponse(responseCode = "404", description = "Version not found")
    public ResponseEntity<DataVersion> getVersion(@PathVariable String versionId) {
        try {
            if (versionId == null || versionId.isEmpty()) {
                return ResponseEntity.badRequest().build();
            }

            logger.info("Fetching version: {}", versionId);

            return versioningService.getVersion(versionId)
                    .map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            logger.error("Error fetching version: {}", versionId, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Delete a version.
     * Useful for cleanup or removing corrupted uploads.
     */
    @DeleteMapping("/{versionId}")
    @Operation(summary = "Delete a data version",
            description = "Removes a specific version and its metadata")
    @ApiResponse(responseCode = "200", description = "Version deleted successfully")
    @ApiResponse(responseCode = "404", description = "Version not found")
    @ApiResponse(responseCode = "500", description = "Internal server error")
    public ResponseEntity<Map<String, String>> deleteVersion(@PathVariable String versionId) {
        try {
            if (versionId == null || versionId.isEmpty()) {
                return ResponseEntity.badRequest().build();
            }

            logger.info("Deleting version: {}", versionId);

            boolean deleted = versioningService.deleteVersion(versionId);
            if (!deleted) {
                logger.info("Version not found, nothing deleted: {}", versionId);
                return ResponseEntity.notFound().build();
            }

            Map<String, String> response = new HashMap<>();
            response.put("message", "Version deleted successfully");
            response.put("versionId", versionId);

            logger.info("Version deleted: {}", versionId);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Error deleting version: {}", versionId, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
