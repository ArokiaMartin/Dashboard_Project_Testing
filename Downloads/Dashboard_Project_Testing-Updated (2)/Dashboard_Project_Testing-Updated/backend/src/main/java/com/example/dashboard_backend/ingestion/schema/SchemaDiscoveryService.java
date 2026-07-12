package com.example.dashboard_backend.ingestion.schema;

import com.example.dashboard_backend.ingestion.model.TableSchemaSet;
import com.example.dashboard_backend.ingestion.support.JsonFlattener;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Pass 1 of ingestion: streams the uploaded file once to discover every table's schema (root plus
 * one child table per nested array, recursively) and its per-column type/cardinality statistics,
 * without ever holding all rows in memory.
 */
@Service
public class SchemaDiscoveryService {

    private final JsonRecordStreamer recordStreamer;

    public SchemaDiscoveryService(JsonRecordStreamer recordStreamer) {
        this.recordStreamer = recordStreamer;
    }

    public TableSchemaSet discoverSchema(MultipartFile file) throws IOException {
        SchemaAccumulator accumulator = new SchemaAccumulator();
        try (InputStream in = file.getInputStream()) {
            recordStreamer.forEachRecord(in, record -> collectSchema(record, "root", accumulator));
        }
        return accumulator.build();
    }

    private void collectSchema(JsonNode record, String tablePath, SchemaAccumulator acc) {
        LinkedHashMap<String, JsonNode> scalars = new LinkedHashMap<>();
        LinkedHashMap<String, ArrayNode> arrays = new LinkedHashMap<>();
        JsonFlattener.flattenObject(record, "", scalars, arrays);

        acc.recordRow(tablePath, scalars);

        for (Map.Entry<String, ArrayNode> entry : arrays.entrySet()) {
            String childPath = tablePath + "." + entry.getKey();
            for (JsonNode element : entry.getValue()) {
                if (element.isObject()) {
                    collectSchema(element, childPath, acc);
                } else if (!element.isNull() && !element.isMissingNode()) {
                    LinkedHashMap<String, JsonNode> valueRow = new LinkedHashMap<>();
                    valueRow.put("value", element);
                    acc.recordRow(childPath, valueRow);
                }
            }
        }
    }
}
