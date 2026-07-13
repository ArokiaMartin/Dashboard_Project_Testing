package com.example.dashboard_backend.ingestion.model;

import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;

/**
 * A file upload that has been analyzed and staged to per-table temp CSV files, awaiting the client's
 * confirmation to ingest. Held in memory keyed by upload token until {@code /api/data/ingest}
 * commits (and bulk-loads) it or it is discarded.
 */
public record StagedUpload(UUID uploadId,
                           String originalFilename,
                           TableSchemaSet schemas,
                           Map<String, Path> csvFilesByTablePath) {
}
