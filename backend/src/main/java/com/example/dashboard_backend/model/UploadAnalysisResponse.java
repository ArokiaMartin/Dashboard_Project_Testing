package com.example.dashboard_backend.model;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "Result returned after analyzing an uploaded JSON file")
public record UploadAnalysisResponse(
        @Schema(description = "Temporary token used for subsequent ingestion", example = "up_12345")
        String uploadToken,
        @Schema(description = "Original uploaded file name", example = "orders.json")
        String originalFilename,
        @Schema(description = "Detected number of rows", example = "120")
        int rowCount,
        @Schema(description = "Detected number of columns", example = "4")
        int columnCount,
        @Schema(description = "Inferred metadata for each detected field")
        List<FieldAnalysis> fields,
        @Schema(description = "Sample parsed rows from the uploaded file")
        List<Object> sampleRows,
        @Schema(description = "Human-readable analysis result", example = "Upload analyzed successfully")
        String message
) {
}
