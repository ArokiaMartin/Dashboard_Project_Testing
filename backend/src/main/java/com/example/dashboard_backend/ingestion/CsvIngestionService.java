package com.example.dashboard_backend.ingestion;

import com.example.dashboard_backend.ingestion.dto.FieldAnalysis;
import com.example.dashboard_backend.ingestion.dto.UploadAnalysisResponse;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class CsvIngestionService {

    private final JdbcTemplate jdbcTemplate;

    public CsvIngestionService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public UploadAnalysisResponse uploadCsv(MultipartFile file) {

        try {
            String fileName = file.getOriginalFilename();

            if (fileName == null || fileName.isBlank()) {
                fileName = "uploaded_csv_file.csv";
            }

            String tableName = fileName;
            UUID uploadId = UUID.randomUUID();
            UUID userId = DatasetController.USER_123;

            try (
                    InputStreamReader reader = new InputStreamReader(
                            file.getInputStream(),
                            StandardCharsets.UTF_8
                    );

                    CSVParser parser = CSVFormat.DEFAULT
                            .builder()
                            .setHeader()
                            .setSkipHeaderRecord(true)
                            .setTrim(true)
                            .build()
                            .parse(reader)
            ) {

                Map<String, Integer> headers = parser.getHeaderMap();

                if (headers == null || headers.isEmpty()) {
                    throw new IllegalArgumentException("CSV file must contain headers");
                }

                createTableIfNotExists(tableName, headers.keySet());

                List<Object> sampleRows = new ArrayList<>();

                Map<String, Set<String>> distinctValuesMap = new LinkedHashMap<>();
                Map<String, Integer> nullCountMap = new LinkedHashMap<>();
                Map<String, List<String>> sampleValuesMap = new LinkedHashMap<>();

                for (String header : headers.keySet()) {
                    distinctValuesMap.put(header, new LinkedHashSet<>());
                    nullCountMap.put(header, 0);
                    sampleValuesMap.put(header, new ArrayList<>());
                }

                int rowsInserted = 0;

                                jdbcTemplate.update(
                                                """
                                                INSERT INTO data_uploads (
                                                    id, user_id, table_name, original_filename, row_count, column_count, status
                                                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                                                """,
                                                uploadId,
                                                userId,
                                                tableName,
                                                fileName,
                                                0,
                                                headers.size(),
                                                "processing"
                                );

                for (CSVRecord record : parser) {

                                        insertRow(record, tableName, headers.keySet(), uploadId);

                    Map<String, String> rowMap = new LinkedHashMap<>();

                    for (String originalColumn : headers.keySet()) {

                        String value = record.get(originalColumn);

                        /*
                         * sampleRows returns the original CSV column names,
                         * so frontend/user sees exactly what was in file.
                         */
                        rowMap.put(originalColumn, value);

                        if (value == null || value.isBlank()) {
                            nullCountMap.put(
                                    originalColumn,
                                    nullCountMap.get(originalColumn) + 1
                            );
                        } else {
                            distinctValuesMap.get(originalColumn).add(value);

                            List<String> sampleValues =
                                    sampleValuesMap.get(originalColumn);

                            if (sampleValues.size() < 5
                                    && !sampleValues.contains(value)) {
                                sampleValues.add(value);
                            }
                        }
                    }

                    if (sampleRows.size() < 5) {
                        sampleRows.add(rowMap);
                    }

                    rowsInserted++;
                }

                List<FieldAnalysis> fields = new ArrayList<>();

                for (String originalColumn : headers.keySet()) {

                    // Infer the column type from its actual values so numeric columns become
                    // measures (isMeasure) and everything else stays a dimension. Without this,
                    // every column defaults to text and shows up as a category in the builder.
                    String fieldType = detectType(distinctValuesMap.get(originalColumn));
                    boolean isMeasure = "numeric".equals(fieldType);
                    boolean isDimension = !isMeasure;

                    fields.add(
                            new FieldAnalysis(
                                    originalColumn,
                                originalColumn,
                                    fieldType,
                                    isDimension,
                                    isMeasure,
                                    distinctValuesMap.get(originalColumn).size(),
                                    nullCountMap.get(originalColumn),
                                    null,
                                    null,
                                    sampleValuesMap.get(originalColumn)
                            )
                    );
                }

                    saveFieldMetadata(uploadId, fields);

                    jdbcTemplate.update(
                        "UPDATE data_uploads SET row_count = ?, status = ? WHERE id = ?",
                        rowsInserted,
                        "complete",
                        uploadId
                    );

                return new UploadAnalysisResponse(
                        uploadId.toString(),
                        fileName,
                        rowsInserted,
                        headers.size(),
                        fields,
                        rowsInserted <= 1000 ? fetchUploadedRows(tableName, headers.keySet(), uploadId) : sampleRows,
                        "CSV uploaded successfully. Rows inserted: " + rowsInserted
                );
            }

        } catch (Exception ex) {
            throw new RuntimeException(
                    "Failed to upload CSV file: " + ex.getMessage(),
                    ex
            );
        }
    }

    private void createTableIfNotExists(String tableName, Set<String> headers) {
        StringBuilder ddl = new StringBuilder();
        ddl.append("CREATE TABLE IF NOT EXISTS ").append(quoteIdentifier(tableName)).append(" (");
        ddl.append("upload_id UUID NOT NULL REFERENCES data_uploads(id), ");
        ddl.append("row_id BIGSERIAL NOT NULL");

        for (String header : headers) {
            ddl.append(", ").append(quoteIdentifier(header)).append(" TEXT");
        }

        ddl.append(", PRIMARY KEY (upload_id, row_id))");
        jdbcTemplate.execute(ddl.toString());
    }

    private void insertRow(
            CSVRecord record,
            String tableName,
            Set<String> headers,
            UUID uploadId
    ) {

        StringBuilder columns = new StringBuilder("upload_id");

        StringBuilder placeholders = new StringBuilder("?");

        List<Object> values = new ArrayList<>();

        values.add(uploadId);

        for (String header : headers) {

            columns.append(", ")
                    .append(quoteIdentifier(header));

            placeholders.append(", ?");

            values.add(record.get(header));
        }

        String sql =
                "INSERT INTO " + quoteIdentifier(tableName) + " ("
                        + columns
                        + ") VALUES ("
                        + placeholders
                        + ")";

        jdbcTemplate.update(sql, values.toArray());
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
                    field.fieldName(),
                    field.fieldType(),
                    field.fieldName(),
                    field.isDimension(),
                    field.isMeasure(),
                    field.distinctCount(),
                    field.nullCount(),
                    field.minValue(),
                    field.maxValue()
            );
        }
    }

    private List<Object> fetchUploadedRows(String tableName, Set<String> headers, UUID uploadId) {
        if (headers.isEmpty()) {
            return Collections.emptyList();
        }

        StringBuilder sql = new StringBuilder();
        sql.append("SELECT ");

        int i = 0;
        for (String header : headers) {
            if (i > 0) {
                sql.append(", ");
            }
            sql.append(quoteIdentifier(header));
            i++;
        }

        sql.append(" FROM ").append(quoteIdentifier(tableName));
        sql.append(" WHERE upload_id = ? ORDER BY row_id");

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql.toString(), uploadId);
        return new ArrayList<>(rows);
    }

    private String quoteIdentifier(String identifier) {

        if (identifier == null || identifier.isBlank()) {
            throw new IllegalArgumentException("CSV column name cannot be empty");
        }

        return "\"" + identifier.replace("\"", "\"\"") + "\"";
    }

    /**
     * Infers a column's type from its distinct non-blank values. Returns one of
     * "numeric" / "date" / "boolean" / "text" (matching what the JSON service and the frontend expect).
     * Numeric is checked before boolean so a 0/1 measure column isn't misread as boolean.
     */
    private String detectType(Set<String> values) {
        if (values == null || values.isEmpty()) {
            return "text";
        }
        boolean allNumeric = true, allDate = true, allBoolean = true;
        for (String raw : values) {
            String v = raw == null ? "" : raw.trim();
            if (v.isEmpty()) continue;
            if (allNumeric && !isNumeric(v)) allNumeric = false;
            if (allDate && !isDate(v)) allDate = false;
            if (allBoolean && !isBoolean(v)) allBoolean = false;
        }
        if (allNumeric) return "numeric";
        if (allDate) return "date";
        if (allBoolean) return "boolean";
        return "text";
    }

    private boolean isNumeric(String v) {
        // No comma-stripping: a value counts as numeric only if it's parseable as-is, matching
        // what the frontend's Number() can handle — otherwise "1,200" would be flagged numeric
        // but render as NaN/0 in charts.
        try { Double.parseDouble(v); return true; }
        catch (NumberFormatException e) { return false; }
    }

    private boolean isBoolean(String v) {
        String s = v.toLowerCase();
        return s.equals("true") || s.equals("false") || s.equals("yes") || s.equals("no")
                || s.equals("y") || s.equals("n");
    }

    private boolean isDate(String v) {
        for (java.time.format.DateTimeFormatter f : DATE_FORMATS) {
            try { java.time.LocalDate.parse(v, f); return true; } catch (Exception ignored) { }
        }
        // ISO date-time (e.g. 2024-01-15T10:30:00)
        try { java.time.LocalDateTime.parse(v); return true; } catch (Exception ignored) { }
        return false;
    }

    private static final java.time.format.DateTimeFormatter[] DATE_FORMATS = new java.time.format.DateTimeFormatter[] {
        java.time.format.DateTimeFormatter.ISO_LOCAL_DATE,          // 2024-01-15
        java.time.format.DateTimeFormatter.ofPattern("MM/dd/yyyy"),
        java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy"),
        java.time.format.DateTimeFormatter.ofPattern("yyyy/MM/dd"),
        java.time.format.DateTimeFormatter.ofPattern("dd-MM-yyyy"),
        java.time.format.DateTimeFormatter.ofPattern("M/d/yyyy")
    };
}