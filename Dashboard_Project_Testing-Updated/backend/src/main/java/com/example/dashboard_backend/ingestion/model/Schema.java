package com.example.dashboard_backend.ingestion.model;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record Schema(
    UUID id,
    UUID userId,
    String schemaName,
    Integer schemaVersion,
    JsonNode schemaDefinition,
    String description,
    String status,
    List<SchemaField> fields,
    LocalDateTime createdAt,
    LocalDateTime updatedAt,
    String createdBy,
    String updatedBy
) {
    public static Schema create(
        UUID userId,
        String schemaName,
        JsonNode schemaDefinition,
        String description,
        List<SchemaField> fields,
        String createdBy
    ) {
        return new Schema(
            UUID.randomUUID(),
            userId,
            schemaName,
            1,
            schemaDefinition,
            description,
            "ACTIVE",
            fields,
            LocalDateTime.now(),
            LocalDateTime.now(),
            createdBy,
            createdBy
        );
    }
}
