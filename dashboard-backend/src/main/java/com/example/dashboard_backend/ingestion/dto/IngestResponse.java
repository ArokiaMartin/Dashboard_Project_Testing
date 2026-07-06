package com.example.dashboard_backend.ingestion.dto;

import java.util.List;

public record IngestResponse(
        String uploadId,
        String tableName,
        List<String> childTableNames,
        int rowsInserted,
        int columnCount,
        String status,
        List<String> errors,
        String message
) {
}
