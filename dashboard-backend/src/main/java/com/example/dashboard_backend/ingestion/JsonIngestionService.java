package com.example.dashboard_backend.ingestion;

import com.example.dashboard_backend.ingestion.dto.FieldAnalysis;
import com.example.dashboard_backend.ingestion.dto.IngestRequest;
import com.example.dashboard_backend.ingestion.dto.IngestResponse;
import com.example.dashboard_backend.ingestion.dto.UploadAnalysisResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
public class JsonIngestionService {

    private static final Pattern NON_IDENTIFIER = Pattern.compile("[^a-zA-Z0-9_]");

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    private final Map<String, ParsedUpload> stagedUploads = new ConcurrentHashMap<>();

    public JsonIngestionService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
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
    }

    public UploadAnalysisResponse analyzeUpload(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File is required");
        }

        JsonNode root;
        try {
            root = objectMapper.readTree(file.getInputStream());
        } catch (IOException e) {
            throw new IllegalArgumentException("Failed to parse JSON file", e);
        }

        ParsedRows parsedRows = extractRows(root);
        List<Map<String, Object>> rows = parsedRows.rows();
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("JSON has no records to ingest");
        }

        AnalyzedData analyzedData = analyzeRows(rows, parsedRows.jsonFields());
        String uploadToken = UUID.randomUUID().toString();

        stagedUploads.put(uploadToken, new ParsedUpload(
                file.getOriginalFilename(),
            root,
                rows,
            parsedRows.jsonFields(),
            analyzedData
        ));

        List<Object> sampleRows = new ArrayList<>();
        int sampleCount = Math.min(5, rows.size());
        for (int i = 0; i < sampleCount; i++) {
            sampleRows.add(rows.get(i));
        }

        return new UploadAnalysisResponse(
                uploadToken,
                file.getOriginalFilename(),
                rows.size(),
                analyzedData.fields().size(),
                analyzedData.fields(),
                sampleRows,
                "JSON validated and analyzed. Use uploadToken with /api/data/ingest"
        );
    }

    public IngestResponse ingest(IngestRequest request) {
        ParsedUpload parsedUpload = null;

        if (request.uploadToken() != null && !request.uploadToken().isBlank()) {
            parsedUpload = stagedUploads.get(request.uploadToken());
            if (parsedUpload == null) {
                throw new IllegalArgumentException("Invalid or expired uploadToken");
            }
        }

        List<Map<String, Object>> rows;
        Set<String> jsonFields;
        AnalyzedData analyzedData;
        String originalFilename;

        if (parsedUpload != null) {
            rows = parsedUpload.rows();
            analyzedData = parsedUpload.analyzedData();
            jsonFields = parsedUpload.jsonFields();
            originalFilename = parsedUpload.originalFilename();
        } else {
            if (request.data() == null || request.data().isNull()) {
                throw new IllegalArgumentException("Either uploadToken or data must be provided");
            }
            ParsedRows parsedRows = extractRows(request.data());
            rows = parsedRows.rows();
            if (rows.isEmpty()) {
                throw new IllegalArgumentException("Provided data has no records to ingest");
            }
            jsonFields = parsedRows.jsonFields();
            analyzedData = analyzeRows(rows, jsonFields);
            originalFilename = request.originalFilename();
        }

        UUID userId = parseUserId(request.userId());
        String dynamicTableName = resolveTableName(request.tableName(), originalFilename);
        UUID existingUploadId = findUploadIdByTableName(dynamicTableName);
        UUID uploadId = existingUploadId != null ? existingUploadId : UUID.randomUUID();

        if (existingUploadId != null) {
            overwriteExistingTable(dynamicTableName, uploadId);
        }

        createDynamicTable(dynamicTableName, analyzedData.fields());
        int inserted = insertRows(dynamicTableName, uploadId, rows, analyzedData.fields(), jsonFields);

        jdbcTemplate.update(
                """
                        INSERT INTO data_uploads (
                          id, user_id, table_name, original_filename, row_count, column_count, status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (table_name)
                DO UPDATE SET
                  user_id = EXCLUDED.user_id,
                  original_filename = EXCLUDED.original_filename,
                  row_count = EXCLUDED.row_count,
                  column_count = EXCLUDED.column_count,
                  status = EXCLUDED.status,
                  updated_at = CURRENT_TIMESTAMP
                        """,
                uploadId,
                userId,
                dynamicTableName,
                originalFilename,
                inserted,
                analyzedData.fields().size(),
                "complete"
        );

        saveFieldMetadata(uploadId, analyzedData.fields());

        if (request.uploadToken() != null) {
            stagedUploads.remove(request.uploadToken());
        }

        return new IngestResponse(
                uploadId.toString(),
                dynamicTableName,
            Collections.emptyList(),
                inserted,
                analyzedData.fields().size(),
                "complete",
                Collections.emptyList(),
                "Single table created and data inserted successfully"
        );
    }

    private UUID findUploadIdByTableName(String tableName) {
        List<UUID> ids = jdbcTemplate.query(
                "SELECT id FROM data_uploads WHERE table_name = ?",
                (rs, rowNum) -> (UUID) rs.getObject("id"),
                tableName
        );
        if (ids.isEmpty()) {
            return null;
        }
        return ids.get(0);
    }

    private void overwriteExistingTable(String tableName, UUID uploadId) {
        jdbcTemplate.execute("DROP TABLE IF EXISTS " + quoteIdentifier(tableName));
        jdbcTemplate.update("DELETE FROM field_metadata WHERE upload_id = ?", uploadId);
    }

    private boolean isArrayOfObjects(JsonNode value) {
        if (value == null || !value.isArray() || value.isEmpty()) {
            return false;
        }

        for (JsonNode item : value) {
            if (!item.isObject()) {
                return false;
            }
        }

        return true;
    }

    private void saveFieldMetadata(UUID uploadId, List<FieldAnalysis> fields) {
        for (FieldAnalysis field : fields) {
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
                    UUID.randomUUID(),
                    uploadId,
                    field.fieldName(),
                    field.normalizedFieldName(),
                    field.fieldType(),
                    field.fieldName(),
                    field.isDimension(),
                    field.isMeasure(),
                    field.distinctCount(),
                    field.nullCount(),
                    compactMetadataValue(field.minValue()),
                    compactMetadataValue(field.maxValue())
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

    private int insertRows(String tableName, UUID uploadId, List<Map<String, Object>> rows, List<FieldAnalysis> fields, Set<String> jsonFields) {
        if (rows.isEmpty()) {
            return 0;
        }

        List<String> dbColumns = new ArrayList<>();
        for (FieldAnalysis field : fields) {
            dbColumns.add(field.normalizedFieldName());
        }

        StringBuilder sql = new StringBuilder();
        sql.append("INSERT INTO ").append(quoteIdentifier(tableName)).append(" (");
        sql.append("upload_id, row_id");
        for (String dbColumn : dbColumns) {
            sql.append(", ").append(quoteIdentifier(dbColumn));
        }
        sql.append(") VALUES (");
        sql.append("?, ?");
        for (FieldAnalysis field : fields) {
            sql.append(", ");
            if (jsonFields.contains(field.fieldName())) {
                sql.append("?::jsonb");
            } else {
                sql.append("?");
            }
        }
        sql.append(")");

        jdbcTemplate.batchUpdate(sql.toString(), new BatchPreparedStatementSetter() {
            @Override
            public void setValues(PreparedStatement ps, int i) throws SQLException {
                Map<String, Object> row = rows.get(i);
                ps.setObject(1, uploadId);
                ps.setLong(2, i + 1L);

                int parameterIndex = 3;
                for (FieldAnalysis field : fields) {
                    Object value = row.get(field.fieldName());
                    setTypedValue(ps, parameterIndex, value, field.fieldType());
                    parameterIndex++;
                }
            }

            @Override
            public int getBatchSize() {
                return rows.size();
            }
        });

        return rows.size();
    }

    private void setTypedValue(PreparedStatement ps, int index, Object value, String fieldType) throws SQLException {
        if (value == null) {
            ps.setObject(index, null);
            return;
        }

        switch (fieldType) {
            case "numeric" -> {
                if (value instanceof Number number) {
                    ps.setBigDecimal(index, new BigDecimal(number.toString()));
                } else {
                    try {
                        ps.setBigDecimal(index, new BigDecimal(String.valueOf(value).trim()));
                    } catch (NumberFormatException ex) {
                        ps.setObject(index, null);
                    }
                }
            }
            case "boolean" -> {
                if (value instanceof Boolean bool) {
                    ps.setBoolean(index, bool);
                } else {
                    String text = String.valueOf(value).trim().toLowerCase(Locale.ROOT);
                    if ("true".equals(text) || "1".equals(text) || "yes".equals(text) || "y".equals(text)) {
                        ps.setBoolean(index, true);
                    } else if ("false".equals(text) || "0".equals(text) || "no".equals(text) || "n".equals(text)) {
                        ps.setBoolean(index, false);
                    } else {
                        ps.setObject(index, null);
                    }
                }
            }
            case "date" -> {
                Timestamp ts = parseTimestamp(value);
                ps.setTimestamp(index, ts);
            }
            default -> ps.setString(index, String.valueOf(value));
        }
    }

    private Timestamp parseTimestamp(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            long epoch = number.longValue();
            if (String.valueOf(Math.abs(epoch)).length() <= 10) {
                return Timestamp.from(Instant.ofEpochSecond(epoch));
            }
            return Timestamp.from(Instant.ofEpochMilli(epoch));
        }

        String text = String.valueOf(value).trim();
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

    private void createDynamicTable(String tableName, List<FieldAnalysis> fields) {
        StringBuilder ddl = new StringBuilder();
        ddl.append("CREATE TABLE IF NOT EXISTS ").append(quoteIdentifier(tableName)).append(" (");
        ddl.append("upload_id UUID NOT NULL, ");
        ddl.append("row_id BIGINT NOT NULL");

        for (FieldAnalysis field : fields) {
            ddl.append(", ")
                    .append(quoteIdentifier(field.normalizedFieldName()))
                    .append(" ")
                    .append(toSqlType(field.fieldType()));
        }

        ddl.append(", PRIMARY KEY (upload_id, row_id))");
        jdbcTemplate.execute(ddl.toString());
    }

    private String toSqlType(String fieldType) {
        return switch (fieldType) {
            case "numeric" -> "NUMERIC";
            case "boolean" -> "BOOLEAN";
            case "date" -> "TIMESTAMP";
            default -> "TEXT";
        };
    }

    private String resolveTableName(String requestedTableName, String originalFilename) {
        String fallback = "upload_data";

        String preferred = tableNameFromFilename(originalFilename);
        if (preferred == null && requestedTableName != null && !requestedTableName.isBlank()) {
            preferred = sanitizeIdentifier(requestedTableName, fallback);
        }
        if (preferred == null) {
            preferred = fallback;
        }

        return sanitizeIdentifier(preferred, fallback);
    }

    private String tableNameFromFilename(String originalFilename) {
        if (originalFilename == null || originalFilename.isBlank()) {
            return null;
        }

        String filename = originalFilename.trim();
        int slashIdx = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
        if (slashIdx >= 0 && slashIdx < filename.length() - 1) {
            filename = filename.substring(slashIdx + 1);
        }

        int dotIdx = filename.lastIndexOf('.');
        if (dotIdx > 0) {
            filename = filename.substring(0, dotIdx);
        }

        return sanitizeIdentifier(filename, null);
    }

    private UUID parseUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            return UUID.randomUUID();
        }
        return UUID.fromString(userId);
    }

    private ParsedRows extractRows(JsonNode root) {
        if (root == null || root.isNull()) {
            return new ParsedRows(Collections.emptyList(), Collections.emptySet());
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        Set<String> jsonFields = new HashSet<>();

        if (root.isArray()) {
            for (JsonNode item : root) {
                if (!item.isObject()) {
                    continue;
                }
                Map<String, Object> map = objectMapper.convertValue(item, Map.class);
                rows.add(flattenRow(map, jsonFields));
            }
            return new ParsedRows(rows, jsonFields);
        }

        if (root.isObject()) {
            // find all top-level arrays of objects and merge their elements
            List<Map.Entry<String, JsonNode>> arraysFound = new ArrayList<>();
            var fields = root.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> entry = fields.next();
                JsonNode value = entry.getValue();
                if (isArrayOfObjects(value)) {
                    arraysFound.add(entry);
                }
            }

            if (!arraysFound.isEmpty()) {
                for (Map.Entry<String, JsonNode> e : arraysFound) {
                    String sourceName = e.getKey();
                    for (JsonNode item : e.getValue()) {
                        if (!item.isObject()) {
                            continue;
                        }
                        Map<String, Object> map = objectMapper.convertValue(item, Map.class);
                        map.put("_source", sourceName);
                        rows.add(flattenRow(map, jsonFields));
                    }
                }
                return new ParsedRows(rows, jsonFields);
            }

            // fallback: single object treated as one row
            Map<String, Object> map = objectMapper.convertValue(root, Map.class);
            rows.add(flattenRow(map, jsonFields));
            return new ParsedRows(rows, jsonFields);
        }

        throw new IllegalArgumentException("JSON must be an object, array of objects, or object containing arrays of objects");
    }

    private Map<String, Object> flattenRow(Map<String, Object> row, Set<String> jsonFields) {
        Map<String, Object> flattened = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            String fieldName = entry.getKey();
            if (fieldName == null || fieldName.isBlank()) {
                continue;
            }
            flattenValue(fieldName, entry.getValue(), flattened, jsonFields);
        }
        return flattened;
    }

    private void flattenValue(String prefix, Object value, Map<String, Object> target, Set<String> jsonFields) {
        if (value == null) {
            target.put(prefix, null);
            return;
        }

        if (value instanceof Map<?, ?> nestedMap) {
            for (Map.Entry<?, ?> nestedEntry : nestedMap.entrySet()) {
                String keyPart = String.valueOf(nestedEntry.getKey());
                if (keyPart == null || keyPart.isBlank()) {
                    continue;
                }
                flattenValue(prefix + "_" + keyPart, nestedEntry.getValue(), target, jsonFields);
            }
            return;
        }

        if (value instanceof List<?> list) {
            if (list.isEmpty()) {
                target.put(prefix, null);
                return;
            }
            // Take only the first element of the array and flatten it under the same prefix
            Object first = list.get(0);
            flattenValue(prefix, first, target, jsonFields);
            return;
        }

        if (value instanceof JsonNode node) {
            if (node.isValueNode()) {
                target.put(prefix, objectMapper.convertValue(node, Object.class));
            } else {
                jsonFields.add(prefix);
                target.put(prefix, toJsonText(objectMapper.convertValue(node, Object.class)));
            }
            return;
        }

        if (value instanceof String || value instanceof Number || value instanceof Boolean || value instanceof Character) {
            target.put(prefix, value);
            return;
        }

        jsonFields.add(prefix);
        target.put(prefix, toJsonText(value));
    }

    private AnalyzedData analyzeRows(List<Map<String, Object>> rows, Set<String> jsonFields) {
        Set<String> allFields = new HashSet<>();
        for (Map<String, Object> row : rows) {
            allFields.addAll(row.keySet());
        }

        List<String> sortedFields = new ArrayList<>(allFields);
        Collections.sort(sortedFields);

        Map<String, String> normalizedNameByField = uniqueNormalizedNames(sortedFields);

        List<FieldAnalysis> fieldAnalyses = new ArrayList<>();

        for (String field : sortedFields) {
            List<Object> values = new ArrayList<>();
            int nullCount = 0;

            for (Map<String, Object> row : rows) {
                Object value = row.get(field);
                if (value == null) {
                    nullCount++;
                } else {
                    values.add(value);
                }
            }

            String fieldType = detectFieldType(values);
            if (jsonFields.contains(field)) {
                fieldType = "json";
            }
            boolean isMeasure = "numeric".equals(fieldType);
            boolean isDimension = !isMeasure;

            Set<String> distinct = new HashSet<>();
            for (Object value : values) {
                distinct.add(String.valueOf(value));
            }

            String minValue = null;
            String maxValue = null;
            if (!values.isEmpty()) {
                minValue = computeMin(values, fieldType);
                maxValue = computeMax(values, fieldType);
            }

            List<String> sampleValues = new ArrayList<>();
            int sampleLimit = Math.min(5, values.size());
            for (int i = 0; i < sampleLimit; i++) {
                sampleValues.add(String.valueOf(values.get(i)));
            }

            fieldAnalyses.add(new FieldAnalysis(
                    field,
                    normalizedNameByField.get(field),
                    fieldType,
                    isDimension,
                    isMeasure,
                    distinct.size(),
                    nullCount,
                    minValue,
                    maxValue,
                    sampleValues
            ));
        }

        return new AnalyzedData(fieldAnalyses);
    }

    private String toJsonText(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ignored) {
            return String.valueOf(value);
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

    private String detectFieldType(List<Object> values) {
        if (values.isEmpty()) {
            return "text";
        }

        boolean allBoolean = true;
        boolean allNumeric = true;
        boolean allDate = true;

        for (Object value : values) {
            if (!isBooleanValue(value)) {
                allBoolean = false;
            }
            if (!isNumericValue(value)) {
                allNumeric = false;
            }
            if (!isDateValue(value)) {
                allDate = false;
            }
        }

        if (allBoolean) {
            return "boolean";
        }
        if (allNumeric) {
            return "numeric";
        }
        if (allDate) {
            return "date";
        }
        return "text";
    }

    private boolean isNumericValue(Object value) {
        if (value instanceof Number) {
            return true;
        }
        if (value instanceof String str) {
            try {
                new BigDecimal(str.trim());
                return true;
            } catch (NumberFormatException ignored) {
                return false;
            }
        }
        return false;
    }

    private record ParsedRows(
            List<Map<String, Object>> rows,
            Set<String> jsonFields
    ) {
    }

    private boolean isBooleanValue(Object value) {
        if (value instanceof Boolean) {
            return true;
        }
        if (value instanceof String str) {
            String normalized = str.trim().toLowerCase(Locale.ROOT);
            return "true".equals(normalized)
                    || "false".equals(normalized)
                    || "1".equals(normalized)
                    || "0".equals(normalized)
                    || "yes".equals(normalized)
                    || "no".equals(normalized)
                    || "y".equals(normalized)
                    || "n".equals(normalized);
        }
        return false;
    }

    private boolean isDateValue(Object value) {
        if (value instanceof Number) {
            return true;
        }
        if (!(value instanceof String text)) {
            return false;
        }

        String raw = text.trim();
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

    private String computeMin(List<Object> values, String type) {
        return switch (type) {
            case "numeric" -> values.stream()
                    .map(v -> new BigDecimal(String.valueOf(v)))
                    .min(BigDecimal::compareTo)
                    .map(BigDecimal::toPlainString)
                    .orElse(null);
            case "date" -> values.stream()
                    .map(this::parseTimestamp)
                    .filter(t -> t != null)
                    .min(Timestamp::compareTo)
                    .map(Timestamp::toString)
                    .orElse(null);
            default -> values.stream()
                    .map(String::valueOf)
                    .min(String::compareTo)
                    .orElse(null);
        };
    }

    private String computeMax(List<Object> values, String type) {
        return switch (type) {
            case "numeric" -> values.stream()
                    .map(v -> new BigDecimal(String.valueOf(v)))
                    .max(BigDecimal::compareTo)
                    .map(BigDecimal::toPlainString)
                    .orElse(null);
            case "date" -> values.stream()
                    .map(this::parseTimestamp)
                    .filter(t -> t != null)
                    .max(Timestamp::compareTo)
                    .map(Timestamp::toString)
                    .orElse(null);
            default -> values.stream()
                    .map(String::valueOf)
                    .max(String::compareTo)
                    .orElse(null);
        };
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
        return "\"" + identifier.replace("\"", "\"\"") + "\"";
    }

    private record ParsedUpload(
            String originalFilename,
            JsonNode sourceJson,
            List<Map<String, Object>> rows,
            Set<String> jsonFields,
            AnalyzedData analyzedData
    ) {
    }

    private record AnalyzedData(
            List<FieldAnalysis> fields
    ) {
    }
}