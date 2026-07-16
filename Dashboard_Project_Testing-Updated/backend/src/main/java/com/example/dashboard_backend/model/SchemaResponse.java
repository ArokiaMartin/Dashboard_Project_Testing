package com.example.dashboard_backend.model;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record SchemaResponse(
    UUID id,
    String schemaName,
    Integer schemaVersion,
    String status,
    String description,
    List<FieldResponse> fields,
    LocalDateTime createdAt,
    LocalDateTime updatedAt,
    String createdBy,
    String message
) {
    public record FieldResponse(
        UUID id,
        String fieldName,
        String fieldType,
        Boolean isRequired,
        Boolean isDimension,
        Boolean isMeasure,
        Boolean isPrimaryKey,
        String description,
        Integer position
    ) {}
}
