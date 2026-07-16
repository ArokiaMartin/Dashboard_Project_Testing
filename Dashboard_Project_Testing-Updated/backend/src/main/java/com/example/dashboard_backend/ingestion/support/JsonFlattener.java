package com.example.dashboard_backend.ingestion.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;

import java.util.Iterator;
import java.util.Map;

/**
 * Flattens a JSON object into dot-path scalar fields. Nested objects are inlined
 * (e.g. {@code customer.name}); array fields are collected separately because each array becomes
 * its own related child table rather than a mangled column.
 */
public final class JsonFlattener {

    private JsonFlattener() {
    }

    public static void flattenObject(JsonNode obj, String prefix,
                                     Map<String, JsonNode> scalarsOut,
                                     Map<String, ArrayNode> arraysOut) {
        Iterator<Map.Entry<String, JsonNode>> fieldIterator = obj.properties().iterator();
        while (fieldIterator.hasNext()) {
            Map.Entry<String, JsonNode> e = fieldIterator.next();
            String key = prefix.isEmpty() ? e.getKey() : prefix + "." + e.getKey();
            JsonNode value = e.getValue();
            if (value == null || value.isMissingNode()) {
                continue;
            }
            if (value.isObject()) {
                flattenObject(value, key, scalarsOut, arraysOut);
            } else if (value.isArray()) {
                arraysOut.put(key, (ArrayNode) value);
            } else {
                scalarsOut.put(key, value);
            }
        }
    }
}
