package com.example.dashboard_backend.service;

import com.example.dashboard_backend.model.FieldAnalysis;
import com.example.dashboard_backend.model.IngestRequest;
import com.example.dashboard_backend.model.IngestResponse;
import com.example.dashboard_backend.model.UploadAnalysisResponse;
import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.annotation.PostConstruct;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.postgresql.PGConnection;
import org.postgresql.copy.CopyManager;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.sql.DataSource;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Ingests uploaded JSON into PostgreSQL.
 *
 * <p>Two things this version specifically improves over a naive implementation:
 * <ul>
 *   <li><b>Streaming, not whole-file parsing</b>: {@link #analyzeUpload} never materializes the
 *       entire JSON document as one in-memory tree. It walks the top-level array token-by-token
 *       (see {@link #forEachRecord}), holding at most one record in memory at a time, then stages
 *       flattened rows straight to per-table temp CSV files on disk. Ingestion later bulk-loads
 *       those files with PostgreSQL's native {@code COPY}, which is far faster than row-by-row
 *       {@code INSERT} for large volumes.</li>
 *   <li><b>Arrays become related child tables</b>: a nested array field (e.g. {@code orders: [...]})
 *       is not flattened into a single mangled column. Each element becomes a row in its own child
 *       table (named {@code <parent>_<field>}), linked back via a {@code (upload_id, parent_row_id)}
 *       foreign key. Nesting recurses arbitrarily deep (arrays within arrays become grandchild
 *       tables).</li>
 * </ul>
 */
@Service
public class JsonIngestionService {

    private static final Pattern NON_IDENTIFIER = Pattern.compile("[^a-zA-Z0-9_]");
    private static final int SAMPLE_LIMIT = 5;
    private static final int DISTINCT_CAP = 1000;

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final JsonFactory jsonFactory;
    private final DataSource dataSource;

    private final Map<String, StagedUpload> stagedUploads = new ConcurrentHashMap<>();

    public JsonIngestionService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper, DataSource dataSource) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.jsonFactory = objectMapper.getFactory();
        this.dataSource = dataSource;
    }

    @PostConstruct
    public void initializeCoreTables() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS data_uploads (
                  id UUID PRIMARY KEY,
                  user_id UUID NOT NULL,
                  table_name VARCHAR(255) UNIQUE NOT NULL,
                  original_filename VARCHAR(255),
                  row_count INT,
                  column_count INT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  status VARCHAR(50)
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS field_metadata (
                  id UUID PRIMARY KEY,
                  upload_id UUID REFERENCES data_uploads(id),
                  field_name VARCHAR(255),
                  normalized_field_name VARCHAR(255),
                  field_type VARCHAR(50),
                  display_name VARCHAR(255),
                  is_dimension BOOLEAN DEFAULT true,
                  is_measure BOOLEAN DEFAULT false,
                  distinct_count INT,
                  null_count INT,
                  min_value TEXT,
                  max_value TEXT,
                  UNIQUE(upload_id, field_name)
                )
                """);

        // Upgrade existing databases created with VARCHAR(255) metadata preview columns.
        jdbcTemplate.execute("ALTER TABLE field_metadata ALTER COLUMN min_value TYPE TEXT");
        jdbcTemplate.execute("ALTER TABLE field_metadata ALTER COLUMN max_value TYPE TEXT");

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS reports (
                  id UUID PRIMARY KEY,
                  user_id UUID NOT NULL,
                  upload_id UUID REFERENCES data_uploads(id),
                  title VARCHAR(255),
                  description TEXT,
                  configuration JSONB,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS widgets (
                  id UUID PRIMARY KEY,
                  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
                  chart_type VARCHAR(50),
                  dimensions JSONB,
                  measures JSONB,
                  filters JSONB,
                  sort_config JSONB,
                  position_row INT,
                  position_col INT,
                  width INT,
                  height INT,
                  query_sql TEXT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS audit_log (
                  id UUID PRIMARY KEY,
                  user_id UUID,
                  upload_id UUID REFERENCES data_uploads(id),
                  query_sql TEXT,
                  execution_time INT,
                  row_count INT,
                  status VARCHAR(50),
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """);
    }

    // =============================================================================================
    // Public API
    // =============================================================================================

    /**
     * Streams the uploaded file twice: once to discover the schema (and per-table field stats)
     * without holding all rows in memory, and once to flatten + explode every record straight into
     * per-table temp CSV files on disk. The staged files are looked up again by {@link #ingest} —
     * the original {@link MultipartFile} is never touched again after this method returns.
     */
    public UploadAnalysisResponse analyzeUpload(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File is required");
        }

        UUID uploadId = UUID.randomUUID();
        String uploadToken = uploadId.toString();

        TableSchemaSet schemas;
        Map<String, Path> csvFiles = null;
        try {
            schemas = discoverSchema(file);
            TableSchema rootSchema = schemas.get("root");
            if (rootSchema == null || rootSchema.rowCount() == 0) {
                throw new IllegalArgumentException("JSON has no records to ingest");
            }
            csvFiles = writeStagedCsvFiles(file, schemas, uploadId);
        } catch (IOException e) {
            if (csvFiles != null) cleanupFiles(csvFiles.values());
            throw new IllegalArgumentException("Failed to parse JSON file", e);
        } catch (RuntimeException e) {
            if (csvFiles != null) cleanupFiles(csvFiles.values());
            throw e;
        }

        TableSchema rootSchema = schemas.get("root");
        stagedUploads.put(uploadToken, new StagedUpload(uploadId, file.getOriginalFilename(), schemas, csvFiles));

        String message = schemas.size() > 1
                ? "JSON validated and analyzed (" + (schemas.size() - 1)
                        + " nested array field(s) will become related tables). Use uploadToken with /api/data/ingest"
                : "JSON validated and analyzed. Use uploadToken with /api/data/ingest";

        return new UploadAnalysisResponse(
                uploadToken,
                file.getOriginalFilename(),
                (int) rootSchema.rowCount(),
                rootSchema.fields().size(),
                rootSchema.fields(),
                new ArrayList<>(rootSchema.sampleRows()),
                message
        );
    }

    public IngestResponse ingest(IngestRequest request) {
        if (request.uploadToken() != null && !request.uploadToken().isBlank()) {
            StagedUpload staged = stagedUploads.remove(request.uploadToken());
            if (staged == null) {
                throw new IllegalArgumentException("Invalid or expired uploadToken");
            }
            try {
                return commitStaged(staged, request);
            } finally {
                cleanupFiles(staged.csvFilesByTablePath().values());
            }
        }

        if (request.data() == null || request.data().isNull()) {
            throw new IllegalArgumentException("Either uploadToken or data must be provided");
        }
        return ingestProvidedData(request);
    }

    // =============================================================================================
    // Pass 1 — schema discovery (streaming; bounded memory)
    // =============================================================================================

    private TableSchemaSet discoverSchema(MultipartFile file) throws IOException {
        SchemaAccumulator accumulator = new SchemaAccumulator();
        try (InputStream in = file.getInputStream()) {
            forEachRecord(in, record -> collectSchema(record, "root", accumulator));
        }
        return accumulator.build();
    }

    private void collectSchema(JsonNode record, String tablePath, SchemaAccumulator acc) {
        LinkedHashMap<String, JsonNode> scalars = new LinkedHashMap<>();
        LinkedHashMap<String, ArrayNode> arrays = new LinkedHashMap<>();
        flattenObject(record, "", scalars, arrays);

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

    // =============================================================================================
    // Pass 2 — stream rows into per-table temp CSV files (file-upload path only)
    // =============================================================================================

    private Map<String, Path> writeStagedCsvFiles(MultipartFile file, TableSchemaSet schemas, UUID uploadId) throws IOException {
        Map<String, TableCsvWriter> writers = new LinkedHashMap<>();
        try {
            for (TableSchema schema : schemas.orderedParentFirst()) {
                writers.put(schema.tablePath(), new TableCsvWriter(schema, uploadId));
            }
            try (InputStream in = file.getInputStream()) {
                RowIdTracker tracker = new RowIdTracker();
                forEachRecord(in, record -> writeRecord(record, "root", null, writers, tracker));
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
        flattenObject(record, "", scalars, arrays);

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

    // =============================================================================================
    // Shared streaming walk over the top-level JSON shape (array / {data:[...]} / single object)
    // =============================================================================================

    /**
     * Walks every top-level record in {@code in} and hands each one to {@code handler}, without ever
     * materializing more than one record's subtree at a time — the part of the document that can
     * actually be huge (the array of records) is never fully loaded into memory at once.
     */
    private void forEachRecord(InputStream in, Consumer<JsonNode> handler) throws IOException {
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

    /** Flattens nested objects into dot-path scalar fields; array fields are collected separately (they become child tables). */
    private void flattenObject(JsonNode obj, String prefix, Map<String, JsonNode> scalarsOut, Map<String, ArrayNode> arraysOut) {
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

    // =============================================================================================
    // Ingestion of an already-staged upload (COPY-based bulk load)
    // =============================================================================================

    private IngestResponse commitStaged(StagedUpload staged, IngestRequest request) {
        UUID uploadId = staged.uploadId();
        UUID userId = parseUserId(request.userId());
        Map<String, String> tableNames = resolveTableNames(staged.schemas(), request.tableName(), uploadId);

        List<String> createdTables = new ArrayList<>();
        long rootRowsInserted = 0;

        for (TableSchema schema : staged.schemas().orderedParentFirst()) {
            String tableName = tableNames.get(schema.tablePath());
            String parentTableName = schema.tablePath().equals("root")
                    ? null
                    : tableNames.get(parentPathOf(schema.tablePath()));
            createDynamicTable(tableName, schema.fields(), parentTableName);
            createdTables.add(tableName);

            Path csvFile = staged.csvFilesByTablePath().get(schema.tablePath());
            long inserted = copyIntoTable(tableName, parentTableName != null, schema.fields(), csvFile);
            if (schema.tablePath().equals("root")) {
                rootRowsInserted = inserted;
            }
        }

        return finalizeIngest(uploadId, userId, staged.originalFilename(), staged.schemas(), tableNames, createdTables, rootRowsInserted);
    }

    private long copyIntoTable(String tableName, boolean hasParent, List<FieldAnalysis> fields, Path csvFile) {
        List<String> columns = new ArrayList<>();
        columns.add("upload_id");
        columns.add("row_id");
        if (hasParent) columns.add("parent_row_id");
        for (FieldAnalysis field : fields) columns.add(field.normalizedFieldName());

        String columnList = columns.stream().map(this::quoteIdentifier).collect(Collectors.joining(", "));
        String copySql = "COPY " + quoteIdentifier(tableName) + " (" + columnList + ") FROM STDIN WITH (FORMAT csv, NULL '')";

        try (Connection connection = dataSource.getConnection();
             InputStream in = Files.newInputStream(csvFile)) {
            CopyManager copyManager = connection.unwrap(PGConnection.class).getCopyAPI();
            return copyManager.copyIn(copySql, in);
        } catch (SQLException | IOException e) {
            throw new RuntimeException("Failed to load data into table " + tableName, e);
        }
    }

    // =============================================================================================
    // Ingestion of data provided inline in the request body (small payloads; in-memory)
    // =============================================================================================

    private IngestResponse ingestProvidedData(IngestRequest request) {
        JsonNode target = request.data();
        if (target.isObject() && target.has("data") && target.get("data").isArray()) {
            target = target.get("data");
        }

        List<JsonNode> records = new ArrayList<>();
        if (target.isArray()) {
            for (JsonNode item : target) {
                if (item.isObject()) records.add(item);
            }
        } else if (target.isObject()) {
            records.add(target);
        } else {
            throw new IllegalArgumentException("JSON must be an object, array of objects, or object containing data[]");
        }
        if (records.isEmpty()) {
            throw new IllegalArgumentException("Provided data has no records to ingest");
        }

        SchemaAccumulator accumulator = new SchemaAccumulator();
        Map<String, List<LinkedHashMap<String, JsonNode>>> rowsByTable = new LinkedHashMap<>();
        Map<String, List<Long>> parentIdsByTable = new LinkedHashMap<>();
        RowIdTracker tracker = new RowIdTracker();

        for (JsonNode record : records) {
            collectAndBufferRecord(record, "root", null, accumulator, rowsByTable, parentIdsByTable, tracker);
        }

        TableSchemaSet schemas = accumulator.build();
        UUID uploadId = UUID.randomUUID();
        UUID userId = parseUserId(request.userId());
        Map<String, String> tableNames = resolveTableNames(schemas, request.tableName(), uploadId);

        List<String> createdTables = new ArrayList<>();
        long rootRowsInserted = 0;

        for (TableSchema schema : schemas.orderedParentFirst()) {
            String tableName = tableNames.get(schema.tablePath());
            String parentTableName = schema.tablePath().equals("root")
                    ? null
                    : tableNames.get(parentPathOf(schema.tablePath()));
            createDynamicTable(tableName, schema.fields(), parentTableName);
            createdTables.add(tableName);

            long inserted = batchInsertRows(tableName, parentTableName != null, uploadId,
                    rowsByTable.getOrDefault(schema.tablePath(), List.of()),
                    parentIdsByTable.getOrDefault(schema.tablePath(), List.of()),
                    schema.fields());
            if (schema.tablePath().equals("root")) {
                rootRowsInserted = inserted;
            }
        }

        return finalizeIngest(uploadId, userId, request.originalFilename(), schemas, tableNames, createdTables, rootRowsInserted);
    }

    private long collectAndBufferRecord(
            JsonNode record, String tablePath, Long parentRowId,
            SchemaAccumulator accumulator,
            Map<String, List<LinkedHashMap<String, JsonNode>>> rowsByTable,
            Map<String, List<Long>> parentIdsByTable,
            RowIdTracker tracker
    ) {
        LinkedHashMap<String, JsonNode> scalars = new LinkedHashMap<>();
        LinkedHashMap<String, ArrayNode> arrays = new LinkedHashMap<>();
        flattenObject(record, "", scalars, arrays);

        accumulator.recordRow(tablePath, scalars);
        long rowId = tracker.next(tablePath);
        rowsByTable.computeIfAbsent(tablePath, k -> new ArrayList<>()).add(scalars);
        parentIdsByTable.computeIfAbsent(tablePath, k -> new ArrayList<>()).add(parentRowId);

        for (Map.Entry<String, ArrayNode> entry : arrays.entrySet()) {
            String childPath = tablePath + "." + entry.getKey();
            for (JsonNode element : entry.getValue()) {
                if (element.isObject()) {
                    collectAndBufferRecord(element, childPath, rowId, accumulator, rowsByTable, parentIdsByTable, tracker);
                } else if (!element.isNull() && !element.isMissingNode()) {
                    LinkedHashMap<String, JsonNode> valueRow = new LinkedHashMap<>();
                    valueRow.put("value", element);
                    accumulator.recordRow(childPath, valueRow);
                    long childRowId = tracker.next(childPath);
                    rowsByTable.computeIfAbsent(childPath, k -> new ArrayList<>()).add(valueRow);
                    parentIdsByTable.computeIfAbsent(childPath, k -> new ArrayList<>()).add(rowId);
                }
            }
        }
        return rowId;
    }

    private long batchInsertRows(String tableName, boolean hasParent, UUID uploadId,
                                  List<LinkedHashMap<String, JsonNode>> rows, List<Long> parentIds,
                                  List<FieldAnalysis> fields) {
        if (rows.isEmpty()) {
            return 0;
        }

        StringBuilder sql = new StringBuilder();
        sql.append("INSERT INTO ").append(quoteIdentifier(tableName)).append(" (upload_id, row_id");
        if (hasParent) sql.append(", parent_row_id");
        for (FieldAnalysis field : fields) sql.append(", ").append(quoteIdentifier(field.normalizedFieldName()));
        sql.append(") VALUES (?, ?");
        if (hasParent) sql.append(", ?");
        sql.append(", ?".repeat(fields.size())).append(")");

        jdbcTemplate.batchUpdate(sql.toString(), new BatchPreparedStatementSetter() {
            @Override
            public void setValues(PreparedStatement ps, int i) throws SQLException {
                LinkedHashMap<String, JsonNode> row = rows.get(i);
                int idx = 1;
                ps.setObject(idx++, uploadId);
                ps.setLong(idx++, i + 1L);
                if (hasParent) {
                    Long parentId = parentIds.get(i);
                    ps.setObject(idx++, parentId);
                }
                for (FieldAnalysis field : fields) {
                    setTypedValue(ps, idx++, row.get(field.fieldName()), field.fieldType());
                }
            }

            @Override
            public int getBatchSize() {
                return rows.size();
            }
        });

        return rows.size();
    }

    private void setTypedValue(PreparedStatement ps, int index, JsonNode value, String fieldType) throws SQLException {
        if (value == null || value.isNull() || value.isMissingNode()) {
            ps.setObject(index, null);
            return;
        }
        switch (fieldType) {
            case "numeric" -> {
                try {
                    ps.setBigDecimal(index, new BigDecimal(value.isNumber() ? value.numberValue().toString() : value.asText().trim()));
                } catch (NumberFormatException ex) {
                    ps.setObject(index, null);
                }
            }
            case "boolean" -> {
                Boolean b = coerceBoolean(value);
                if (b != null) ps.setBoolean(index, b); else ps.setObject(index, null);
            }
            case "date" -> ps.setTimestamp(index, parseTimestamp(value));
            default -> ps.setString(index, value.isTextual() ? value.asText() : value.toString());
        }
    }

    // =============================================================================================
    // Shared: table naming, DDL, metadata, and finalization
    // =============================================================================================

    private IngestResponse finalizeIngest(UUID uploadId, UUID userId, String originalFilename, TableSchemaSet schemas,
                                           Map<String, String> tableNames, List<String> createdTables, long rootRowsInserted) {
        String rootTableName = tableNames.get("root");
        TableSchema rootSchema = schemas.get("root");

        jdbcTemplate.update(
                """
                        INSERT INTO data_uploads (
                          id, user_id, table_name, original_filename, row_count, column_count, status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                uploadId, userId, rootTableName, originalFilename, rootRowsInserted, rootSchema.fields().size(), "complete"
        );

        for (TableSchema schema : schemas.orderedParentFirst()) {
            saveFieldMetadata(uploadId, schema.tablePath(), schema.fields());
        }

        String message = createdTables.size() > 1
                ? "Table and " + (createdTables.size() - 1) + " related table(s) created and data inserted successfully: "
                        + String.join(", ", createdTables)
                : "Table created and data inserted successfully";

        return new IngestResponse(uploadId.toString(), rootTableName, (int) rootRowsInserted,
                rootSchema.fields().size(), "complete", Collections.emptyList(), message);
    }

    private void saveFieldMetadata(UUID uploadId, String tablePath, List<FieldAnalysis> fields) {
        // Child-table fields are qualified with their table path (e.g. "orders.amount") so they stay
        // unique under the existing (upload_id, field_name) constraint without any schema migration.
        String prefix = tablePath.equals("root") ? "" : tablePath.substring("root.".length()) + ".";
        for (FieldAnalysis field : fields) {
            String qualifiedFieldName = prefix + field.fieldName();
            jdbcTemplate.update(
                    """
                            INSERT INTO field_metadata (
                              id, upload_id, field_name, normalized_field_name, field_type,
                              display_name, is_dimension, is_measure, distinct_count,
                              null_count, min_value, max_value
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT (upload_id, field_name)
                            DO UPDATE SET
                              normalized_field_name = EXCLUDED.normalized_field_name,
                              field_type = EXCLUDED.field_type,
                              display_name = EXCLUDED.display_name,
                              is_dimension = EXCLUDED.is_dimension,
                              is_measure = EXCLUDED.is_measure,
                              distinct_count = EXCLUDED.distinct_count,
                              null_count = EXCLUDED.null_count,
                              min_value = EXCLUDED.min_value,
                              max_value = EXCLUDED.max_value
                            """,
                    UUID.randomUUID(), uploadId, qualifiedFieldName, field.normalizedFieldName(), field.fieldType(),
                    qualifiedFieldName, field.isDimension(), field.isMeasure(), field.distinctCount(), field.nullCount(),
                    compactMetadataValue(field.minValue()), compactMetadataValue(field.maxValue())
            );
        }
    }

    private String compactMetadataValue(String value) {
        if (value == null) {
            return null;
        }
        int maxLength = 4000;
        if (value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength) + "...";
    }

    private void createDynamicTable(String tableName, List<FieldAnalysis> fields, String parentTableName) {
        StringBuilder ddl = new StringBuilder();
        ddl.append("CREATE TABLE IF NOT EXISTS ").append(quoteIdentifier(tableName)).append(" (");
        ddl.append("upload_id UUID NOT NULL, ");
        ddl.append("row_id BIGINT NOT NULL");
        if (parentTableName != null) {
            ddl.append(", parent_row_id BIGINT NOT NULL");
        }

        for (FieldAnalysis field : fields) {
            ddl.append(", ")
                    .append(quoteIdentifier(field.normalizedFieldName()))
                    .append(" ")
                    .append(toSqlType(field.fieldType()));
        }

        ddl.append(", PRIMARY KEY (upload_id, row_id)");
        if (parentTableName != null) {
            ddl.append(", FOREIGN KEY (upload_id, parent_row_id) REFERENCES ")
                    .append(quoteIdentifier(parentTableName)).append(" (upload_id, row_id)");
        }
        ddl.append(")");
        jdbcTemplate.execute(ddl.toString());

        for (FieldAnalysis field : fields) {
            if (field.isDimension()) {
                String indexName = sanitizeIdentifier(tableName + "_" + field.normalizedFieldName() + "_idx", "idx");
                jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS " + quoteIdentifier(indexName) +
                        " ON " + quoteIdentifier(tableName) + " (" + quoteIdentifier(field.normalizedFieldName()) + ")");
            }
        }
    }

    private String toSqlType(String fieldType) {
        return switch (fieldType) {
            case "numeric" -> "NUMERIC";
            case "boolean" -> "BOOLEAN";
            case "date" -> "TIMESTAMPTZ";
            default -> "TEXT";
        };
    }

    /** Resolves a stable, unique, Postgres-legal table name for every table path (root + each child). */
    private Map<String, String> resolveTableNames(TableSchemaSet schemas, String requestedTableName, UUID uploadId) {
        String rootName = (requestedTableName != null && !requestedTableName.isBlank())
                ? sanitizeIdentifier(requestedTableName, "upload_" + shortId(uploadId, 8))
                : "upload_" + shortId(uploadId, 12);

        Map<String, String> names = new LinkedHashMap<>();
        Set<String> used = new HashSet<>();
        for (TableSchema schema : schemas.orderedParentFirst()) {
            String candidate;
            if (schema.tablePath().equals("root")) {
                candidate = rootName;
            } else {
                String suffix = schema.tablePath().substring("root.".length()).replace('.', '_');
                candidate = sanitizeIdentifier(rootName + "_" + suffix, rootName + "_child");
            }
            candidate = truncateForPostgres(candidate);
            String unique = candidate;
            int n = 1;
            while (!used.add(unique)) {
                n++;
                unique = truncateForPostgres(candidate) + "_" + n;
            }
            names.put(schema.tablePath(), unique);
        }
        return names;
    }

    private static String shortId(UUID id, int length) {
        return id.toString().replace("-", "").substring(0, length);
    }

    private static String truncateForPostgres(String identifier) {
        return identifier.length() > 63 ? identifier.substring(0, 63) : identifier;
    }

    private static String parentPathOf(String path) {
        int idx = path.lastIndexOf('.');
        return idx < 0 ? "root" : path.substring(0, idx);
    }

    private void cleanupFiles(Collection<Path> files) {
        for (Path p : files) {
            try {
                Files.deleteIfExists(p);
            } catch (IOException ignored) {
            }
        }
    }

    private UUID parseUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            return com.example.dashboard_backend.util.AppConstants.USER_123;
        }
        try {
            return UUID.fromString(userId);
        } catch (IllegalArgumentException e) {
            return com.example.dashboard_backend.util.AppConstants.USER_123;
        }
    }

    private Map<String, String> uniqueNormalizedNames(List<String> originalFields) {
        Map<String, String> result = new LinkedHashMap<>();
        Set<String> used = new HashSet<>();

        for (String field : originalFields) {
            String base = sanitizeIdentifier(field, "column");
            String candidate = base;
            int suffix = 1;
            while (used.contains(candidate)) {
                suffix++;
                candidate = base + "_" + suffix;
            }
            used.add(candidate);
            result.put(field, candidate);
        }

        return result;
    }

    private String sanitizeIdentifier(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }

        String cleaned = NON_IDENTIFIER.matcher(value.trim().toLowerCase(Locale.ROOT)).replaceAll("_");
        cleaned = cleaned.replaceAll("_+", "_").replaceAll("^_+", "").replaceAll("_+$", "");

        if (cleaned.isBlank()) {
            cleaned = fallback;
        }

        if (Character.isDigit(cleaned.charAt(0))) {
            cleaned = "c_" + cleaned;
        }

        if (cleaned.length() > 55) {
            cleaned = cleaned.substring(0, 55);
        }

        return cleaned;
    }

    private String quoteIdentifier(String identifier) {
        return com.example.dashboard_backend.util.SqlIdentifier.quote(identifier);
    }

    // =============================================================================================
    // Type detection / coercion (operates directly on JsonNode)
    // =============================================================================================

    private static boolean isNumericValue(JsonNode value) {
        if (value.isNumber()) {
            return true;
        }
        if (value.isTextual()) {
            try {
                new BigDecimal(value.asText().trim());
                return true;
            } catch (NumberFormatException ignored) {
                return false;
            }
        }
        return false;
    }

    private static boolean isBooleanValue(JsonNode value) {
        if (value.isBoolean()) {
            return true;
        }
        if (value.isTextual()) {
            String normalized = value.asText().trim().toLowerCase(Locale.ROOT);
            return "true".equals(normalized) || "false".equals(normalized)
                    || "1".equals(normalized) || "0".equals(normalized)
                    || "yes".equals(normalized) || "no".equals(normalized)
                    || "y".equals(normalized) || "n".equals(normalized);
        }
        return false;
    }

    private static boolean isDateValue(JsonNode value) {
        if (value.isNumber()) {
            return true;
        }
        if (!value.isTextual()) {
            return false;
        }
        String raw = value.asText().trim();
        if (raw.isEmpty()) {
            return false;
        }
        try {
            Instant.parse(raw);
            return true;
        } catch (DateTimeParseException ignored) {
        }
        try {
            OffsetDateTime.parse(raw);
            return true;
        } catch (DateTimeParseException ignored) {
        }
        try {
            LocalDateTime.parse(raw);
            return true;
        } catch (DateTimeParseException ignored) {
        }
        try {
            LocalDate.parse(raw);
            return true;
        } catch (DateTimeParseException ignored) {
        }
        return false;
    }

    private static Boolean coerceBoolean(JsonNode value) {
        if (value.isBoolean()) {
            return value.booleanValue();
        }
        String text = value.asText().trim().toLowerCase(Locale.ROOT);
        if (text.equals("true") || text.equals("1") || text.equals("yes") || text.equals("y")) return true;
        if (text.equals("false") || text.equals("0") || text.equals("no") || text.equals("n")) return false;
        return null;
    }

    private static Timestamp parseTimestamp(JsonNode value) {
        if (value == null || value.isNull()) {
            return null;
        }
        if (value.isNumber()) {
            long epoch = value.numberValue().longValue();
            if (String.valueOf(Math.abs(epoch)).length() <= 10) {
                return Timestamp.from(Instant.ofEpochSecond(epoch));
            }
            return Timestamp.from(Instant.ofEpochMilli(epoch));
        }

        String text = value.asText().trim();
        if (text.isEmpty()) {
            return null;
        }

        try {
            return Timestamp.from(Instant.parse(text));
        } catch (DateTimeParseException ignored) {
        }
        try {
            return Timestamp.from(OffsetDateTime.parse(text).toInstant());
        } catch (DateTimeParseException ignored) {
        }
        try {
            return Timestamp.valueOf(LocalDateTime.parse(text));
        } catch (DateTimeParseException ignored) {
        }
        try {
            return Timestamp.valueOf(LocalDate.parse(text).atStartOfDay());
        } catch (DateTimeParseException ignored) {
        }
        return null;
    }

    private static String formatForCsv(JsonNode value, String fieldType) {
        if (value == null || value.isNull() || value.isMissingNode()) {
            return null;
        }
        return switch (fieldType) {
            case "numeric" -> {
                try {
                    yield new BigDecimal(value.isNumber() ? value.numberValue().toString() : value.asText().trim()).toPlainString();
                } catch (NumberFormatException e) {
                    yield null;
                }
            }
            case "boolean" -> {
                Boolean b = coerceBoolean(value);
                yield b == null ? null : b.toString();
            }
            case "date" -> {
                Timestamp t = parseTimestamp(value);
                yield t == null ? null : t.toInstant().toString();
            }
            default -> value.isTextual() ? value.asText() : value.toString();
        };
    }

    private static Object jsonNodeToPlainValue(JsonNode value) {
        if (value == null || value.isNull()) {
            return null;
        }
        if (value.isNumber()) {
            return value.numberValue();
        }
        if (value.isBoolean()) {
            return value.booleanValue();
        }
        return value.asText();
    }

    // =============================================================================================
    // Internal model
    // =============================================================================================

    private record StagedUpload(UUID uploadId, String originalFilename, TableSchemaSet schemas,
                                 Map<String, Path> csvFilesByTablePath) {
    }

    private record TableSchema(String tablePath, List<FieldAnalysis> fields, long rowCount,
                                List<Map<String, Object>> sampleRows) {
    }

    private record TableSchemaSet(Map<String, TableSchema> byPath) {
        TableSchema get(String path) {
            return byPath.get(path);
        }

        int size() {
            return byPath.size();
        }

        List<TableSchema> orderedParentFirst() {
            List<TableSchema> list = new ArrayList<>(byPath.values());
            list.sort(Comparator.comparingInt(t -> depthOf(t.tablePath())));
            return list;
        }

        private static int depthOf(String path) {
            return (int) path.chars().filter(c -> c == '.').count();
        }
    }

    /** Accumulates per-table column order + running type/cardinality stats without holding raw rows. */
    private final class SchemaAccumulator {
        private final Map<String, TableAccumulator> tables = new LinkedHashMap<>();

        void recordRow(String tablePath, Map<String, JsonNode> scalars) {
            tables.computeIfAbsent(tablePath, TableAccumulator::new).addRow(scalars);
        }

        TableSchemaSet build() {
            Map<String, TableSchema> result = new LinkedHashMap<>();
            for (TableAccumulator acc : tables.values()) {
                result.put(acc.tablePath, acc.finalizeSchema());
            }
            return new TableSchemaSet(result);
        }
    }

    private final class TableAccumulator {
        final String tablePath;
        final LinkedHashSet<String> columnOrder = new LinkedHashSet<>();
        final Map<String, ColumnStats> statsByColumn = new LinkedHashMap<>();
        final List<Map<String, Object>> sampleRows = new ArrayList<>();
        long rowCount = 0;

        TableAccumulator(String tablePath) {
            this.tablePath = tablePath;
        }

        void addRow(Map<String, JsonNode> scalars) {
            rowCount++;
            for (Map.Entry<String, ColumnStats> e : statsByColumn.entrySet()) {
                if (!scalars.containsKey(e.getKey())) {
                    e.getValue().recordNull();
                }
            }
            for (Map.Entry<String, JsonNode> e : scalars.entrySet()) {
                String column = e.getKey();
                ColumnStats stats = statsByColumn.get(column);
                if (stats == null) {
                    stats = new ColumnStats();
                    // Backfill nulls for rows already counted before this column first appeared.
                    for (long i = 1; i < rowCount; i++) {
                        stats.recordNull();
                    }
                    statsByColumn.put(column, stats);
                    columnOrder.add(column);
                }
                stats.record(e.getValue());
            }
            if (sampleRows.size() < SAMPLE_LIMIT) {
                LinkedHashMap<String, Object> sample = new LinkedHashMap<>();
                for (Map.Entry<String, JsonNode> e : scalars.entrySet()) {
                    sample.put(e.getKey(), jsonNodeToPlainValue(e.getValue()));
                }
                sampleRows.add(sample);
            }
        }

        TableSchema finalizeSchema() {
            List<String> columns = new ArrayList<>(columnOrder);
            Map<String, String> normalized = uniqueNormalizedNames(columns);
            List<FieldAnalysis> fields = new ArrayList<>();
            for (String column : columns) {
                fields.add(statsByColumn.get(column).toFieldAnalysis(column, normalized.get(column)));
            }
            return new TableSchema(tablePath, fields, rowCount, sampleRows);
        }
    }

    private static final class ColumnStats {
        boolean allBoolean = true;
        boolean allNumeric = true;
        boolean allDate = true;
        boolean sawAnyValue = false;
        int nullCount = 0;
        final Set<String> distinct = new HashSet<>();
        final List<String> sampleValues = new ArrayList<>();
        BigDecimal minNumeric;
        BigDecimal maxNumeric;
        Timestamp minDate;
        Timestamp maxDate;
        String minText;
        String maxText;

        void recordNull() {
            nullCount++;
        }

        void record(JsonNode value) {
            if (value == null || value.isNull() || value.isMissingNode()) {
                nullCount++;
                return;
            }
            sawAnyValue = true;
            String text = value.isTextual() ? value.asText() : value.asText();

            if (!isBooleanValue(value)) allBoolean = false;
            if (!isNumericValue(value)) allNumeric = false;
            if (!isDateValue(value)) allDate = false;

            if (distinct.size() < DISTINCT_CAP) distinct.add(text);
            if (sampleValues.size() < SAMPLE_LIMIT && !sampleValues.contains(text)) sampleValues.add(text);

            if (isNumericValue(value)) {
                try {
                    BigDecimal n = new BigDecimal(value.isNumber() ? value.numberValue().toString() : text.trim());
                    if (minNumeric == null || n.compareTo(minNumeric) < 0) minNumeric = n;
                    if (maxNumeric == null || n.compareTo(maxNumeric) > 0) maxNumeric = n;
                } catch (NumberFormatException ignored) {
                }
            }
            if (isDateValue(value)) {
                Timestamp t = parseTimestamp(value);
                if (t != null) {
                    if (minDate == null || t.before(minDate)) minDate = t;
                    if (maxDate == null || t.after(maxDate)) maxDate = t;
                }
            }
            if (minText == null || text.compareTo(minText) < 0) minText = text;
            if (maxText == null || text.compareTo(maxText) > 0) maxText = text;
        }

        String detectType() {
            if (!sawAnyValue) return "text";
            if (allBoolean) return "boolean";
            if (allNumeric) return "numeric";
            if (allDate) return "date";
            return "text";
        }

        FieldAnalysis toFieldAnalysis(String fieldName, String normalizedFieldName) {
            String type = detectType();
            String minValue = switch (type) {
                case "numeric" -> minNumeric == null ? null : minNumeric.toPlainString();
                case "date" -> minDate == null ? null : minDate.toString();
                default -> minText;
            };
            String maxValue = switch (type) {
                case "numeric" -> maxNumeric == null ? null : maxNumeric.toPlainString();
                case "date" -> maxDate == null ? null : maxDate.toString();
                default -> maxText;
            };
            boolean isMeasure = "numeric".equals(type);
            return new FieldAnalysis(fieldName, normalizedFieldName, type, !isMeasure, isMeasure,
                    distinct.size(), nullCount, minValue, maxValue, new ArrayList<>(sampleValues));
        }
    }

    private static final class RowIdTracker {
        private final Map<String, Long> counters = new HashMap<>();

        long next(String tablePath) {
            return counters.merge(tablePath, 1L, Long::sum);
        }
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
                    values.add(formatForCsv(scalars.get(field.fieldName()), field.fieldType()));
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
