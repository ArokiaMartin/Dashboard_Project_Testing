package com.example.dashboard_backend.model;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "Field-level metadata inferred from an uploaded dataset")
public record FieldAnalysis(
        @Schema(description = "Original field name from the payload", example = "Region")
        String fieldName,
        @Schema(description = "Normalized field name used internally", example = "region")
        String normalizedFieldName,
        @Schema(description = "Inferred field type", example = "STRING")
        String fieldType,
        @Schema(description = "Whether the field can be used as a dimension", example = "true")
        boolean isDimension,
        @Schema(description = "Whether the field can be used as a measure", example = "false")
        boolean isMeasure,
        @Schema(description = "Distinct value count", example = "5")
        int distinctCount,
        @Schema(description = "Null value count", example = "0")
        int nullCount,
        @Schema(description = "Minimum detected value when applicable", example = "2024-01-01")
        String minValue,
        @Schema(description = "Maximum detected value when applicable", example = "2024-12-31")
        String maxValue,
        @Schema(description = "Representative sample values")
        List<String> sampleValues
) {
}
