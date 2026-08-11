package com.example.dashboard_backend.live;

import com.example.dashboard_backend.ingestion.schema.JsonRecordStreamer;
import com.example.dashboard_backend.ingestion.support.JsonFlattener;
import com.example.dashboard_backend.ingestion.support.JsonValueSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The append endpoint for live sources, plus registration of a live source.
 *
 * <p>Events are read with {@link JsonRecordStreamer} straight off the request {@code InputStream}, so a
 * body carrying thousands of events is walked one record at a time instead of being materialized whole.
 * A single JSON object body is one event.
 *
 * <p>Nothing is written synchronously: each accepted event is coerced to its declared column types on
 * this (request) thread and handed to {@link LiveEventWriter}, whose timer batches them. When the writer's
 * buffer is full the request answers 429 — see the writer for why back-pressure was chosen over dropping.
 */
@RestController
@RequestMapping("/api/live")
@Tag(name = "Live Ingest API", description = "Register a live (streaming) source and append events to it")
public class LiveIngestController {

    private final LiveSourceRegistrar registrar;
    private final LiveEventWriter writer;
    private final JsonRecordStreamer streamer;

    public LiveIngestController(LiveSourceRegistrar registrar, LiveEventWriter writer,
                                JsonRecordStreamer streamer) {
        this.registrar = registrar;
        this.writer = writer;
        this.streamer = streamer;
    }

    /**
     * Declares a live source. The schema is DECLARED, never inferred from the first event: measures are
     * created as NUMERIC and dimensions as TEXT, and no column can be retyped afterwards.
     */
    @Operation(summary = "Register a live source",
            description = "Creates the typed live table plus the dataset/field metadata that makes it selectable in the builder.")
    @PostMapping("/sources")
    public ResponseEntity<Map<String, Object>> registerSource(@RequestBody Map<String, Object> body) {
        String name = body == null ? null : asText(body.get("name"));
        List<String> dimensions = asStringList(body == null ? null : body.get("dimensions"));
        List<String> measures = asStringList(body == null ? null : body.get("measures"));
        UUID userId = parseUuidOrNull(body == null ? null : asText(body.get("user_id")));

        LiveSourceRegistrar.LiveSource source = registrar.register(name, dimensions, measures, userId);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("source_id", source.sourceId().toString());
        response.put("table_name", source.tableName());
        response.put("timestamp_column", LiveSourceRegistrar.TS_COLUMN);
        List<Map<String, String>> fields = new ArrayList<>();
        for (LiveSourceRegistrar.LiveField field : source.fields()) {
            fields.add(Map.of("name", field.displayName(), "column", field.columnName(), "type", field.fieldType()));
        }
        response.put("fields", fields);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Appends one or more events to a live source. Accepts the same three top-level shapes as the upload
     * pipeline: a bare object (one event), a bare array, or an object wrapping {@code data:[...]}.
     */
    @Operation(summary = "Append events to a live source",
            description = "Streams the request body and buffers each event for the next batched flush. Returns 429 when the buffer is full.")
    @PostMapping("/{sourceId}/events")
    public ResponseEntity<Map<String, Object>> appendEvents(@PathVariable UUID sourceId,
                                                           HttpServletRequest request) throws IOException {
        LiveSourceRegistrar.LiveSource source = registrar.resolve(sourceId);
        if (source == null) {
            return ResponseEntity.notFound().build();
        }

        AtomicInteger accepted = new AtomicInteger();
        AtomicInteger rejectedShape = new AtomicInteger();
        AtomicInteger droppedFull = new AtomicInteger();

        streamer.forEachRecord(request.getInputStream(), record -> {
            LiveEventWriter.PendingEvent event = toPendingEvent(source, record);
            if (event == null) {
                rejectedShape.incrementAndGet();
            } else if (writer.enqueue(event)) {
                accepted.incrementAndGet();
            } else {
                droppedFull.incrementAndGet();
            }
        });

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("accepted", accepted.get());
        response.put("rejected", rejectedShape.get());
        response.put("dropped_buffer_full", droppedFull.get());
        response.put("queue_depth", writer.queueDepth());
        // 429 ONLY when nothing at all was buffered, because 429 is the universal "this request did nothing,
        // send it again" signal. Answering it after a partial accept is a duplication bug: a producer that
        // retries the same body re-enqueues everything already accepted, and row_id is a BIGSERIAL so there
        // is no key to collide on and nothing would reject the copies — every bucket silently inflates.
        // On a partial accept we report 202 with the counts and let the producer resend only the shortfall.
        if (droppedFull.get() > 0 && accepted.get() == 0) {
            // Back-pressure: the producer is outrunning the flusher and must retry the dropped events.
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(response);
        }
        response.put("retry_from_offset", accepted.get() + rejectedShape.get());
        return ResponseEntity.accepted().body(response);
    }

    /**
     * Maps one flattened event onto the source's declared columns. Returns {@code null} when the event
     * cannot be represented: a live source has a flat declared schema, so a nested array (which the upload
     * pipeline would fan out into a child table) is rejected rather than silently dropped on the floor.
     *
     * <p>Every declared column is always bound, missing ones as a typed NULL, so all events for a source
     * share one INSERT statement and batch together.
     */
    private LiveEventWriter.PendingEvent toPendingEvent(LiveSourceRegistrar.LiveSource source, JsonNode record) {
        if (record == null || !record.isObject()) {
            return null;
        }

        Map<String, JsonNode> scalars = new LinkedHashMap<>();
        Map<String, ArrayNode> arrays = new LinkedHashMap<>();
        JsonFlattener.flattenObject(record, "", scalars, arrays);
        if (!arrays.isEmpty()) {
            return null;
        }

        Timestamp ts = JsonValueSupport.parseTimestamp(scalars.get(LiveSourceRegistrar.TS_COLUMN));
        if (ts == null) {
            // No usable event timestamp supplied — stamp it server-side on arrival.
            ts = Timestamp.from(Instant.now());
        }

        List<String> columns = new ArrayList<>(source.fields().size());
        List<Object> values = new ArrayList<>(source.fields().size());
        List<Integer> sqlTypes = new ArrayList<>(source.fields().size());
        for (LiveSourceRegistrar.LiveField field : source.fields()) {
            JsonNode raw = scalars.get(field.displayName());
            if (raw == null) {
                raw = scalars.get(field.columnName());
            }
            columns.add(field.columnName());
            values.add(coerce(raw, field.fieldType()));
            sqlTypes.add("numeric".equals(field.fieldType()) ? Types.NUMERIC : Types.VARCHAR);
        }

        return new LiveEventWriter.PendingEvent(source.sourceId(), source.tableName(), ts,
                columns, values, sqlTypes);
    }

    /** Coerces a JSON value to the Java type the declared column expects; unusable values become NULL. */
    private static Object coerce(JsonNode value, String fieldType) {
        if (value == null || value.isNull() || value.isMissingNode()) {
            return null;
        }
        if ("numeric".equals(fieldType)) {
            try {
                return new BigDecimal(value.isNumber() ? value.numberValue().toString() : value.asText().trim());
            } catch (NumberFormatException ex) {
                return null;
            }
        }
        return value.isTextual() ? value.asText() : value.toString();
    }

    private static String asText(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static List<String> asStringList(Object value) {
        List<String> result = new ArrayList<>();
        if (value instanceof List<?> list) {
            for (Object item : list) {
                if (item != null) {
                    result.add(String.valueOf(item));
                }
            }
        }
        return result;
    }

    private static UUID parseUuidOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
