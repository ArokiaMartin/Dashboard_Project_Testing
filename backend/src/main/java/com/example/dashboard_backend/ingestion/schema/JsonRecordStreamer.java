package com.example.dashboard_backend.ingestion.schema;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.util.function.Consumer;

/**
 * Streams the top-level records of an uploaded JSON document without ever materializing the whole
 * document in memory. Understands the three accepted top-level shapes: a bare array of objects, an
 * object wrapping a {@code data:[...]} array, or a single object. This is the one place that knows
 * how to walk the raw token stream, so both schema discovery and CSV staging reuse it.
 */
@Component
public class JsonRecordStreamer {

    private final ObjectMapper objectMapper;
    private final JsonFactory jsonFactory;

    public JsonRecordStreamer(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.jsonFactory = objectMapper.getFactory();
    }

    /**
     * Walks every top-level record in {@code in} and hands each one to {@code handler}, without ever
     * materializing more than one record's subtree at a time — the part of the document that can
     * actually be huge (the array of records) is never fully loaded into memory at once.
     */
    public void forEachRecord(InputStream in, Consumer<JsonNode> handler) throws IOException {
        try (JsonParser parser = jsonFactory.createParser(in)) {
            JsonToken first = parser.nextToken();

            if (first == JsonToken.START_ARRAY) {
                streamArrayElements(parser, handler);
                return;
            }

            if (first != JsonToken.START_OBJECT) {
                throw new IllegalArgumentException("JSON must be an object, array of objects, or object containing data[]");
            }

            ObjectNode bufferedFields = objectMapper.createObjectNode();
            boolean streamedDataArray = false;

            while (parser.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = parser.currentName();
                JsonToken valueToken = parser.nextToken();
                if ("data".equals(fieldName) && valueToken == JsonToken.START_ARRAY) {
                    streamArrayElements(parser, handler);
                    streamedDataArray = true;
                } else {
                    bufferedFields.set(fieldName, objectMapper.readTree(parser));
                }
            }

            if (!streamedDataArray) {
                handler.accept(bufferedFields);
            }
        }
    }

    private void streamArrayElements(JsonParser parser, Consumer<JsonNode> handler) throws IOException {
        while (parser.nextToken() != JsonToken.END_ARRAY) {
            JsonNode record = objectMapper.readTree(parser);
            if (record != null && record.isObject()) {
                handler.accept(record);
            }
        }
    }
}
