package com.example.dashboard_backend.ingestion.model;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * All table schemas discovered from a single upload, keyed by table path ({@code root},
 * {@code root.items}, {@code root.items.tags}, ...). Iterating {@link #orderedParentFirst()}
 * guarantees a parent table is always created before its children, so foreign keys resolve.
 */
public record TableSchemaSet(Map<String, TableSchema> byPath) {

    public TableSchema get(String path) {
        return byPath.get(path);
    }

    public int size() {
        return byPath.size();
    }

    public List<TableSchema> orderedParentFirst() {
        List<TableSchema> list = new ArrayList<>(byPath.values());
        list.sort(Comparator.comparingInt(t -> depthOf(t.tablePath())));
        return list;
    }

    private static int depthOf(String path) {
        return (int) path.chars().filter(c -> c == '.').count();
    }
}
