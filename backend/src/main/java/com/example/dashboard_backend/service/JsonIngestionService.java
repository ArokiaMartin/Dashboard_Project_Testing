package com.example.dashboard_backend.service;

import com.example.dashboard_backend.ingestion.ddl.DynamicTableManager;
import com.example.dashboard_backend.ingestion.load.BatchDataLoader;
import com.example.dashboard_backend.ingestion.load.CopyDataLoader;
import com.example.dashboard_backend.ingestion.load.CsvStagingWriter;
import com.example.dashboard_backend.ingestion.metadata.IngestionMetadataRepository;
import com.example.dashboard_backend.ingestion.model.RowIdTracker;
import com.example.dashboard_backend.ingestion.model.StagedUpload;
import com.example.dashboard_backend.ingestion.model.TableSchema;
import com.example.dashboard_backend.ingestion.model.TableSchemaSet;
import com.example.dashboard_backend.ingestion.schema.SchemaAccumulator;
import com.example.dashboard_backend.ingestion.schema.SchemaDiscoveryService;
import com.example.dashboard_backend.ingestion.support.JsonFlattener;
import com.example.dashboard_backend.model.IngestRequest;
import com.example.dashboard_backend.model.IngestResponse;
import com.example.dashboard_backend.model.UploadAnalysisResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Ingests uploaded JSON into PostgreSQL. This class is the orchestrator of the ingestion pipeline —
 * each step is delegated to a focused collaborator so this class only coordinates the flow:
 *
 * <p><b>Pipeline</b>: {@link SchemaDiscoveryService} → {@link CsvStagingWriter} /
 * {@link BatchDataLoader} → {@link DynamicTableManager} → {@link CopyDataLoader} →
 * {@link IngestionMetadataRepository}.
 *
 * <p>Two design properties this pipeline preserves:
 * <ul>
 *   <li><b>Streaming, not whole-file parsing</b>: {@link #analyzeUpload} never materializes the
 *       entire JSON document as one in-memory tree. It walks the top-level array token-by-token,
 *       holding at most one record in memory at a time, then stages flattened rows straight to
 *       per-table temp CSV files on disk. Ingestion later bulk-loads those files with PostgreSQL's
 *       native {@code COPY}, which is far faster than row-by-row {@code INSERT} for large volumes.</li>
 *   <li><b>Arrays become related child tables</b>: a nested array field (e.g. {@code orders: [...]})
 *       is not flattened into a single mangled column. Each element becomes a row in its own child
 *       table (named {@code <parent>_<field>}), linked back via a {@code (upload_id, parent_row_id)}
 *       foreign key. Nesting recurses arbitrarily deep (arrays within arrays become grandchild
 *       tables).</li>
 * </ul>
 */
@Service
public class JsonIngestionService {

    private final SchemaDiscoveryService schemaDiscoveryService;
    private final CsvStagingWriter csvStagingWriter;
    private final DynamicTableManager dynamicTableManager;
    private final CopyDataLoader copyDataLoader;
    private final BatchDataLoader batchDataLoader;
    private final IngestionMetadataRepository metadataRepository;

    private final Map<String, StagedUpload> stagedUploads = new ConcurrentHashMap<>();

    public JsonIngestionService(SchemaDiscoveryService schemaDiscoveryService,
                                CsvStagingWriter csvStagingWriter,
                                DynamicTableManager dynamicTableManager,
                                CopyDataLoader copyDataLoader,
                                BatchDataLoader batchDataLoader,
                                IngestionMetadataRepository metadataRepository) {
        this.schemaDiscoveryService = schemaDiscoveryService;
        this.csvStagingWriter = csvStagingWriter;
        this.dynamicTableManager = dynamicTableManager;
        this.copyDataLoader = copyDataLoader;
        this.batchDataLoader = batchDataLoader;
        this.metadataRepository = metadataRepository;
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
            schemas = schemaDiscoveryService.discoverSchema(file);
            TableSchema rootSchema = schemas.get("root");
            if (rootSchema == null || rootSchema.rowCount() == 0) {
                throw new IllegalArgumentException("JSON has no records to ingest");
            }
            csvFiles = csvStagingWriter.writeStagedCsvFiles(file, schemas, uploadId);
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
    // Ingestion of an already-staged upload (COPY-based bulk load)
    // =============================================================================================

    private IngestResponse commitStaged(StagedUpload staged, IngestRequest request) {
        UUID uploadId = staged.uploadId();
        UUID userId = parseUserId(request.userId());
        Map<String, String> tableNames = dynamicTableManager.resolveTableNames(staged.schemas(), request.tableName(), uploadId);

        List<String> createdTables = new ArrayList<>();
        long rootRowsInserted = 0;

        for (TableSchema schema : staged.schemas().orderedParentFirst()) {
            String tableName = tableNames.get(schema.tablePath());
            String parentTableName = schema.tablePath().equals("root")
                    ? null
                    : tableNames.get(DynamicTableManager.parentPathOf(schema.tablePath()));
            dynamicTableManager.createDynamicTable(tableName, schema.fields(), parentTableName);
            createdTables.add(tableName);

            Path csvFile = staged.csvFilesByTablePath().get(schema.tablePath());
            long inserted = copyDataLoader.copyIntoTable(tableName, parentTableName != null, schema.fields(), csvFile);
            if (schema.tablePath().equals("root")) {
                rootRowsInserted = inserted;
            }
        }

        return finalizeIngest(uploadId, userId, staged.originalFilename(), staged.schemas(), tableNames, createdTables, rootRowsInserted);
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
        Map<String, String> tableNames = dynamicTableManager.resolveTableNames(schemas, request.tableName(), uploadId);

        List<String> createdTables = new ArrayList<>();
        long rootRowsInserted = 0;

        for (TableSchema schema : schemas.orderedParentFirst()) {
            String tableName = tableNames.get(schema.tablePath());
            String parentTableName = schema.tablePath().equals("root")
                    ? null
                    : tableNames.get(DynamicTableManager.parentPathOf(schema.tablePath()));
            dynamicTableManager.createDynamicTable(tableName, schema.fields(), parentTableName);
            createdTables.add(tableName);

            long inserted = batchDataLoader.batchInsertRows(tableName, parentTableName != null, uploadId,
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
        JsonFlattener.flattenObject(record, "", scalars, arrays);

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

    // =============================================================================================
    // Shared finalization
    // =============================================================================================

    private IngestResponse finalizeIngest(UUID uploadId, UUID userId, String originalFilename, TableSchemaSet schemas,
                                          Map<String, String> tableNames, List<String> createdTables, long rootRowsInserted) {
        String rootTableName = tableNames.get("root");
        TableSchema rootSchema = schemas.get("root");

        metadataRepository.recordUpload(uploadId, userId, rootTableName, originalFilename,
                rootRowsInserted, rootSchema.fields().size());

        for (TableSchema schema : schemas.orderedParentFirst()) {
            metadataRepository.saveFieldMetadata(uploadId, schema.tablePath(), schema.fields());
        }

        String message = createdTables.size() > 1
                ? "Table and " + (createdTables.size() - 1) + " related table(s) created and data inserted successfully: "
                        + String.join(", ", createdTables)
                : "Table created and data inserted successfully";

        return new IngestResponse(uploadId.toString(), rootTableName, (int) rootRowsInserted,
                rootSchema.fields().size(), "complete", Collections.emptyList(), message);
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
}
