package com.example.dashboard_backend.model;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Result of checking if data is a duplicate")
public record VersionCheckResult(
        @Schema(description = "True if this data matches an existing version", example = "true")
        boolean isDuplicate,

        @Schema(description = "The existing version if isDuplicate=true", example = "{...}")
        DataVersion existingVersion,

        @Schema(description = "The checksum of the checked data", example = "a3f5d8e2b9c1d4e6f7a8b9c0d1e2f3a4")
        String newChecksum
) {
}
