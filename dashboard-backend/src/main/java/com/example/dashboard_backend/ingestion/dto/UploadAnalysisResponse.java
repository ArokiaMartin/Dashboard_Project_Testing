package com.example.dashboard_backend.ingestion.dto;

import java.util.List;

public record UploadAnalysisResponse(
        String uploadToken,
        String originalFilename,
        int rowCount,
        int columnCount,
        List<FieldAnalysis> fields,
        List<Object> sampleRows,
        String message
) {
}
