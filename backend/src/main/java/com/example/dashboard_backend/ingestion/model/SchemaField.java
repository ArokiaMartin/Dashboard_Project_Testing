package com.example.dashboard_backend.ingestion.model;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;

public record SchemaField(
    UUID id,
    UUID schemaId,
    String fieldName,
    String fieldType,
    Boolean isRequired,
    Boolean isDimension,
    Boolean isMeasure,
    Boolean isPrimaryKey,
    String description,
    JsonNode validationRules,
    Integer position
) {
    public static SchemaField create(
        UUID schemaId,
        String fieldName,
        String fieldType,
        Boolean isRequired,
        Boolean isDimension,
        Boolean isMeasure,
        Boolean isPrimaryKey,
        String description,
        JsonNode validationRules,
        Integer position
    ) {
        return new SchemaField(
            UUID.randomUUID(),
            schemaId,
            fieldName,
            fieldType,
            isRequired,
            isDimension,
            isMeasure,
            isPrimaryKey,
            description,
            validationRules,
            position
        );
    }
}
