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
import java.util.HashMap;
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

        List<Map<String, Object>> rows = extractRows(root);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("JSON has no records to ingest");
        }

        AnalyzedData analyzedData = analyzeRows(rows);
        String uploadToken = UUID.randomUUID().toString();

        stagedUploads.put(uploadToken, new ParsedUpload(
                file.getOriginalFilename(),
                rows,
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
        AnalyzedData analyzedData;
        String originalFilename;

        if (parsedUpload != null) {
            rows = parsedUpload.rows();
            analyzedData = parsedUpload.analyzedData();
            originalFilename = parsedUpload.originalFilename();
        } else {
            if (request.data() == null || request.data().isNull()) {
                throw new IllegalArgumentException("Either uploadToken or data must be provided");
            }
            rows = extractRows(request.data());
            if (rows.isEmpty()) {
                throw new IllegalArgumentException("Provided data has no records to ingest");
            }
            analyzedData = analyzeRows(rows);
            originalFilename = request.originalFilename();
        }

        UUID uploadId = UUID.randomUUID();
        UUID userId = parseUserId(request.userId());
        String dynamicTableName = resolveTableName(request.tableName(), uploadId);

        createDynamicTable(dynamicTableName, analyzedData.fields());
        int inserted = insertRows(dynamicTableName, uploadId, rows, analyzedData.fields());

        jdbcTemplate.update(
                """
                        INSERT INTO data_uploads (
                          id, user_id, table_name, original_filename, row_count, column_count, status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
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
                inserted,
                analyzedData.fields().size(),
                "complete",
                Collections.emptyList(),
                "Table created and data inserted successfully"
        );
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

    private int insertRows(String tableName, UUID uploadId, List<Map<String, Object>> rows, List<FieldAnalysis> fields) {
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
        for (int i = 0; i < dbColumns.size(); i++) {
            sql.append(", ?");
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
            case "date" -> "TIMESTAMP";
            default -> "TEXT";
        };
    }

    private String resolveTableName(String requestedTableName, UUID uploadId) {
        if (requestedTableName != null && !requestedTableName.isBlank()) {
            return sanitizeIdentifier(requestedTableName, "upload_" + uploadId.toString().replace("-", "").substring(0, 8));
        }
        return "upload_" + uploadId.toString().replace("-", "").substring(0, 12);
    }

    private UUID parseUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            return UUID.randomUUID();
        }
        return UUID.fromString(userId);
    }

    private List<Map<String, Object>> extractRows(JsonNode root) {
        if (root == null || root.isNull()) {
            return Collections.emptyList();
        }

        JsonNode dataNode = root;
        if (root.isObject() && root.has("data") && root.get("data").isArray()) {
            dataNode = root.get("data");
        }

        List<Map<String, Object>> rows = new ArrayList<>();

        if (dataNode.isArray()) {
            for (JsonNode item : dataNode) {
                if (!item.isObject()) {
                    continue;
                }
                Map<String, Object> map = objectMapper.convertValue(item, Map.class);
                rows.add(map);
            }
            return rows;
        }

        if (dataNode.isObject()) {
            Map<String, Object> map = objectMapper.convertValue(dataNode, Map.class);
            rows.add(map);
            return rows;
        }

        throw new IllegalArgumentException("JSON must be an object, array of objects, or object containing data[]");
    }

    private AnalyzedData analyzeRows(List<Map<String, Object>> rows) {
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
            List<Map<String, Object>> rows,
            AnalyzedData analyzedData
    ) {
    }

    private record AnalyzedData(
            List<FieldAnalysis> fields
    ) {
    }
}
