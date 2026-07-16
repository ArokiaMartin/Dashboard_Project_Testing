package com.example.dashboard_backend.ingestion.load;

import com.example.dashboard_backend.ingestion.model.RowIdTracker;
import com.example.dashboard_backend.ingestion.model.TableSchema;
import com.example.dashboard_backend.ingestion.model.TableSchemaSet;
import com.example.dashboard_backend.ingestion.schema.JsonRecordStreamer;
import com.example.dashboard_backend.ingestion.support.JsonFlattener;
import com.example.dashboard_backend.ingestion.support.JsonValueSupport;
import com.example.dashboard_backend.model.FieldAnalysis;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Pass 2 of the file-upload ingestion path: streams the uploaded file a second time, flattening and
 * exploding each record straight into per-table temp CSV files on disk (one per discovered table),
 * ready for a later {@code COPY} bulk load. Never holds more than one record in memory at a time.
 */
@Component
public class CsvStagingWriter {

    private final JsonRecordStreamer recordStreamer;

    public CsvStagingWriter(JsonRecordStreamer recordStreamer) {
        this.recordStreamer = recordStreamer;
    }

    public Map<String, Path> writeStagedCsvFiles(MultipartFile file, TableSchemaSet schemas, UUID uploadId) throws IOException {
        Map<String, TableCsvWriter> writers = new LinkedHashMap<>();
        try {
            for (TableSchema schema : schemas.orderedParentFirst()) {
                writers.put(schema.tablePath(), new TableCsvWriter(schema, uploadId));
            }
            try (InputStream in = file.getInputStream()) {
                RowIdTracker tracker = new RowIdTracker();
                recordStreamer.forEachRecord(in, record -> writeRecord(record, "root", null, writers, tracker));
            }
            Map<String, Path> files = new LinkedHashMap<>();
            for (Map.Entry<String, TableCsvWriter> e : writers.entrySet()) {
                e.getValue().close();
                files.put(e.getKey(), e.getValue().file);
            }
            return files;
        } catch (IOException | RuntimeException ex) {
            for (TableCsvWriter w : writers.values()) {
                w.closeQuietly();
                w.deleteQuietly();
            }
            throw ex;
        }
    }

    private long writeRecord(JsonNode record, String tablePath, Long parentRowId,
                             Map<String, TableCsvWriter> writers, RowIdTracker tracker) {
        LinkedHashMap<String, JsonNode> scalars = new LinkedHashMap<>();
        LinkedHashMap<String, ArrayNode> arrays = new LinkedHashMap<>();
        JsonFlattener.flattenObject(record, "", scalars, arrays);

        long rowId = tracker.next(tablePath);
        TableCsvWriter writer = writers.get(tablePath);
        if (writer != null) {
            writer.writeRow(rowId, parentRowId, scalars);
        }

        for (Map.Entry<String, ArrayNode> entry : arrays.entrySet()) {
            String childPath = tablePath + "." + entry.getKey();
            for (JsonNode element : entry.getValue()) {
                if (element.isObject()) {
                    writeRecord(element, childPath, rowId, writers, tracker);
                } else if (!element.isNull() && !element.isMissingNode()) {
                    LinkedHashMap<String, JsonNode> valueRow = new LinkedHashMap<>();
                    valueRow.put("value", element);
                    long childRowId = tracker.next(childPath);
                    TableCsvWriter childWriter = writers.get(childPath);
                    if (childWriter != null) {
                        childWriter.writeRow(childRowId, rowId, valueRow);
                    }
                }
            }
        }
        return rowId;
    }

    /** Streams one table's flattened rows straight to a temp CSV file, ready for {@code COPY}. */
    private static final class TableCsvWriter {
        final TableSchema schema;
        final UUID uploadId;
        final Path file;
        final CSVPrinter printer;

        TableCsvWriter(TableSchema schema, UUID uploadId) throws IOException {
            this.schema = schema;
            this.uploadId = uploadId;
            this.file = Files.createTempFile("ingest-" + schema.tablePath().replace('.', '_') + "-", ".csv");
            this.file.toFile().deleteOnExit();
            this.printer = new CSVPrinter(
                    Files.newBufferedWriter(file, StandardCharsets.UTF_8),
                    CSVFormat.DEFAULT.builder().setRecordSeparator("\n").setNullString("").build()
            );
        }

        void writeRow(long rowId, Long parentRowId, Map<String, JsonNode> scalars) {
            try {
                List<Object> values = new ArrayList<>();
                values.add(uploadId.toString());
                values.add(rowId);
                if (!schema.tablePath().equals("root")) {
                    values.add(parentRowId);
                }
                for (FieldAnalysis field : schema.fields()) {
                    values.add(JsonValueSupport.formatForCsv(scalars.get(field.fieldName()), field.fieldType()));
                }
                printer.printRecord(values);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }

        void close() throws IOException {
            printer.close();
        }

        void closeQuietly() {
            try {
                printer.close();
            } catch (IOException ignored) {
            }
        }

        void deleteQuietly() {
            try {
                Files.deleteIfExists(file);
            } catch (IOException ignored) {
            }
        }
    }
}
