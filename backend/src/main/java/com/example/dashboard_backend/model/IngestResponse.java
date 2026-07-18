package com.example.dashboard_backend.model;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "Result returned after attempting to ingest a dataset")
public record IngestResponse(
        @Schema(description = "Identifier of the processed upload", example = "up_12345")
        String uploadId,
        @Schema(description = "Table that received the ingested rows", example = "orders")
        String tableName,
        @Schema(description = "Number of rows inserted", example = "120")
        int rowsInserted,
        @Schema(description = "Number of detected columns", example = "4")
        int columnCount,
        @Schema(description = "Outcome status", example = "SUCCESS")
        String status,
        @Schema(description = "Validation or ingestion errors, if any")
        List<String> errors,
        @Schema(description = "Human-readable result message", example = "Ingestion completed successfully")
        String message
) {
}
