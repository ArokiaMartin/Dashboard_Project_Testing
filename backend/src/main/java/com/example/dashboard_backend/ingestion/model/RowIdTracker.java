package com.example.dashboard_backend.ingestion.model;

import java.util.HashMap;
import java.util.Map;

/**
 * Hands out monotonically increasing {@code row_id}s per table path within a single upload, so a
 * parent row and its child rows can be linked before anything touches the database.
 */
public final class RowIdTracker {

    private final Map<String, Long> counters = new HashMap<>();

    public long next(String tablePath) {
        return counters.merge(tablePath, 1L, Long::sum);
    }
}
