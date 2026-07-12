package com.example.dashboard_backend.ingestion.model;

import com.example.dashboard_backend.model.FieldAnalysis;

import java.util.List;
import java.util.Map;

/**
 * The inferred schema of one table (root or a nested child): its logical path within the JSON,
 * ordered fields, discovered row count, and a few sample rows for the analysis preview.
 */
public record TableSchema(String tablePath,
                          List<FieldAnalysis> fields,
                          long rowCount,
                          List<Map<String, Object>> sampleRows) {
}
