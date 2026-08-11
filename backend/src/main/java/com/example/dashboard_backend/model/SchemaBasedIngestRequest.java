package com.example.dashboard_backend.model;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;

public record SchemaBasedIngestRequest(
    UUID schemaId,
    String tableName,
    String originalFilename,
    JsonNode data,
    String userId,
    Boolean validateOnly,
    Boolean skipValidation
) {}
