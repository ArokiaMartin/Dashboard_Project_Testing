package com.example.dashboard_backend.ingestion.dto;

import java.util.List;

public record FieldAnalysis(
        String fieldName,
        String normalizedFieldName,
        String fieldType,
        boolean isDimension,
        boolean isMeasure,
        int distinctCount,
        int nullCount,
        String minValue,
        String maxValue,
        List<String> sampleValues
) {
}
