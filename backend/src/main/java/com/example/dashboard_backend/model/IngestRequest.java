package com.example.dashboard_backend.model;

import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Request payload used to persist analyzed dataset rows into a target table")
public record IngestRequest(
        @Schema(description = "Token returned by the upload analysis endpoint", example = "up_12345")
        String uploadToken,
        @Schema(description = "Identifier for the user performing ingestion", example = "demo-user")
        String userId,
        @Schema(description = "Destination table name for the ingested data", example = "orders")
        String tableName,
        @Schema(description = "Original uploaded file name", example = "orders.json")
        String originalFilename,
        @Schema(description = "JSON array or object payload to ingest")
        JsonNode data
) {
}
