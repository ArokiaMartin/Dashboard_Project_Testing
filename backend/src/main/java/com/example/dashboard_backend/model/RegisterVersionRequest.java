package com.example.dashboard_backend.model;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Request to register a new data version")
public record RegisterVersionRequest(
        @Schema(description = "Schema this version belongs to", example = "schema_123")
        String schemaId,

        @Schema(description = "Human-readable schema name", example = "customer_data")
        String schemaName,

        @Schema(description = "Table name for this version", example = "customer_data_2026_07_13")
        String tableName,

        @Schema(description = "SHA-256 checksum of the data", example = "a3f5d8e2b9c1d4e6f7a8b9c0d1e2f3a4")
        String checksum,

        @Schema(description = "Number of rows in this version", example = "1000")
        int rowCount,

        @Schema(description = "Original file name", example = "customers.json")
        String fileName,

        @Schema(description = "Whether this is a duplicate", example = "false")
        boolean isDuplicate,

        @Schema(description = "If duplicate, points to original version", example = "v_123abc")
        String originalVersionId,

        @Schema(description = "User ID performing the upload", example = "user_789")
        String createdBy
) {
}
