package com.example.dashboard_backend.ingestion.dto;

import com.fasterxml.jackson.databind.JsonNode;

public record IngestRequest(
        String uploadToken,
        String userId,
        String tableName,
        String originalFilename,
        JsonNode data
) {
}
