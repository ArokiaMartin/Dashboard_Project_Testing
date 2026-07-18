package com.example.dashboard_backend.model;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

@Schema(description = "Metadata for a specific version of uploaded data")
public record DataVersion(
        @Schema(description = "Unique version identifier", example = "v_123abc")
        String versionId,

        @Schema(description = "Schema this version belongs to", example = "schema_456")
        String schemaId,

        @Schema(description = "Human-readable schema name", example = "customer_data")
        String schemaName,

        @Schema(description = "Table that stores this version", example = "customer_data_2026_07_13")
        String tableName,

        @Schema(description = "SHA-256 checksum of the data", example = "a3f5d8e2b9c1d4e6f7a8b9c0d1e2f3a4")
        String checksum,

        @Schema(description = "Number of rows in this version", example = "1000")
        int rowCount,

        @Schema(description = "When this version was uploaded", example = "2026-07-13T10:15:30")
        LocalDateTime uploadedAt,

        @Schema(description = "Original file name", example = "customers.json")
        String fileName,

        @Schema(description = "Sequential version number within schema", example = "3")
        int versionNumber,

        @Schema(description = "Whether this is a duplicate of another version", example = "false")
        boolean isDuplicate,

        @Schema(description = "If duplicate=true, points to original version ID", example = "v_123abc")
        String originalVersionId,

        @Schema(description = "User who uploaded this version", example = "user_789")
        String createdBy
) {
}
