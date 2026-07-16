package com.example.dashboard_backend.model;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Request to check if data is a duplicate")
public record CheckDuplicateRequest(
        @Schema(description = "Schema ID to check within", example = "schema_123")
        String schemaId,

        @Schema(description = "Checksum of the data to check", example = "a3f5d8e2b9c1d4e6f7a8b9c0d1e2f3a4")
        String checksum
) {
}
