package com.example.dashboard_backend.model;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

public record SchemaUploadRequest(
    String schemaName,
    String description,
    JsonNode schemaDefinition,
    List<FieldDefinition> fields
) {
    public record FieldDefinition(
        String fieldName,
        String fieldType,
        Boolean isRequired,
        Boolean isDimension,
        Boolean isMeasure,
        Boolean isPrimaryKey,
        String description,
        JsonNode validationRules
    ) {}
}
