package com.example.dashboard_backend.service;

import com.example.dashboard_backend.model.FieldAnalysis;
import com.example.dashboard_backend.model.UploadAnalysisResponse;
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

            String tableName = com.example.dashboard_backend.ingestion.support.IdentifierNaming
                    .sanitizeIdentifier(stripExtension(fileName), "csv_upload");
            UUID uploadId = UUID.randomUUID();
            UUID userId = com.example.dashboard_backend.util.AppConstants.USER_123;

            try (
                    InputStreamReader reader = new InputStreamReader(
                            file.getInputStream(),
                            StandardCharsets.UTF_8
                    );

                    CSVParser parser = CSVFormat.DEFAULT
                            .builder()
                            .setTrim(true)
                            .build()
                            .parse(reader)
            ) {

                java.util.Iterator<CSVRecord> rowIterator = parser.iterator();
                if (!rowIterator.hasNext()) {
                    throw new IllegalArgumentException("CSV file must contain headers");
                }

                // Read the header row positionally so repeated column names (common in Jira/BI
                // exports) are preserved instead of collapsing into one, and strip a leading BOM.
                CSVRecord headerRecord = rowIterator.next();
                List<String> rawHeaders = new ArrayList<>();
                for (String h : headerRecord) {
                    rawHeaders.add(h == null ? "" : h.trim());
                }
                if (rawHeaders.isEmpty()) {
                    throw new IllegalArgumentException("CSV file must contain headers");
                }
                rawHeaders.set(0, stripBom(rawHeaders.get(0)));
                List<String> headers = makeHeadersUnique(rawHeaders);

                createTableIfNotExists(tableName, headers);

                List<Object> sampleRows = new ArrayList<>();

                Map<String, Set<String>> distinctValuesMap = new LinkedHashMap<>();
                Map<String, Integer> nullCountMap = new LinkedHashMap<>();
                Map<String, List<String>> sampleValuesMap = new LinkedHashMap<>();

                for (String header : headers) {
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

                for (CSVRecord record : (Iterable<CSVRecord>) () -> rowIterator) {

                    insertRow(record, tableName, headers, uploadId);

                    Map<String, String> rowMap = new LinkedHashMap<>();

                    for (int c = 0; c < headers.size(); c++) {

                        String originalColumn = headers.get(c);
                        String value = c < record.size() ? record.get(c) : null;

                        /*
                         * rowMap keys use the (de-duplicated) column names so the
                         * frontend/user sees every column, including repeated ones.
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

                for (String originalColumn : headers) {

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
                        rowsInserted <= 1000 ? fetchUploadedRows(tableName, headers, uploadId) : sampleRows,
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

    private void createTableIfNotExists(String tableName, List<String> headers) {
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
            List<String> headers,
            UUID uploadId
    ) {

        StringBuilder columns = new StringBuilder("upload_id");

        StringBuilder placeholders = new StringBuilder("?");

        List<Object> values = new ArrayList<>();

        values.add(uploadId);

        for (int c = 0; c < headers.size(); c++) {

            columns.append(", ")
                    .append(quoteIdentifier(headers.get(c)));

            placeholders.append(", ?");

            values.add(c < record.size() ? record.get(c) : null);
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

    private List<Object> fetchUploadedRows(String tableName, List<String> headers, UUID uploadId) {
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
        return com.example.dashboard_backend.util.SqlIdentifier.quote(identifier);
    }

    /** Strips a trailing file extension (e.g. "sales.csv" -> "sales") before deriving a table name. */
    private String stripExtension(String name) {
        if (name == null) {
            return null;
        }
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    /** Removes a leading UTF-8 BOM (or its mis-decoded "ï»¿" form) from the first header name. */
    private String stripBom(String s) {
        if (s == null) {
            return null;
        }
        while (s.startsWith("\uFEFF")) {
            s = s.substring(1);
        }
        if (s.startsWith("\u00EF\u00BB\u00BF")) {
            s = s.substring(3);
        }
        return s.trim();
    }

    /**
     * Makes duplicate or blank CSV column names unique (preserving order) by suffixing
     * " (2)", " (3)", ... and caps each name to 63 characters so it fits PostgreSQL's
     * identifier limit. This preserves every column of exports that repeat header names
     * (e.g. Jira's Comment / Labels / Watchers columns) instead of collapsing them.
     */
    private List<String> makeHeadersUnique(List<String> rawHeaders) {
        final int maxLen = 63;
        List<String> result = new ArrayList<>(rawHeaders.size());
        Set<String> used = new java.util.HashSet<>();
        for (String raw : rawHeaders) {
            String base = (raw == null || raw.isBlank()) ? "column" : raw;
            if (base.length() > maxLen) {
                base = base.substring(0, maxLen);
            }
            String name = base;
            int n = 1;
            while (used.contains(name)) {
                n++;
                String suffix = " (" + n + ")";
                String trimmedBase = base.length() + suffix.length() > maxLen
                        ? base.substring(0, maxLen - suffix.length())
                        : base;
                name = trimmedBase + suffix;
            }
            used.add(name);
            result.add(name);
        }
        return result;
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