package com.example.dashboard_backend.ingestion.schema;

import com.example.dashboard_backend.ingestion.model.TableSchema;
import com.example.dashboard_backend.ingestion.model.TableSchemaSet;
import com.example.dashboard_backend.ingestion.support.IdentifierNaming;
import com.example.dashboard_backend.ingestion.support.JsonValueSupport;
import com.example.dashboard_backend.model.FieldAnalysis;
import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Accumulates per-table column order plus running type/cardinality statistics as rows are streamed,
 * without ever holding the raw rows. Calling {@link #build()} finalizes every table's inferred
 * {@link TableSchema} (column types, dimension/measure classification, distinct/null counts,
 * min/max and sample values).
 */
public final class SchemaAccumulator {

    private static final int SAMPLE_LIMIT = 5;
    private static final int DISTINCT_CAP = 1000;

    private final Map<String, TableAccumulator> tables = new LinkedHashMap<>();

    public void recordRow(String tablePath, Map<String, JsonNode> scalars) {
        tables.computeIfAbsent(tablePath, TableAccumulator::new).addRow(scalars);
    }

    public TableSchemaSet build() {
        Map<String, TableSchema> result = new LinkedHashMap<>();
        for (TableAccumulator acc : tables.values()) {
            result.put(acc.tablePath, acc.finalizeSchema());
        }
        return new TableSchemaSet(result);
    }

    private static final class TableAccumulator {
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
                    sample.put(e.getKey(), JsonValueSupport.jsonNodeToPlainValue(e.getValue()));
                }
                sampleRows.add(sample);
            }
        }

        TableSchema finalizeSchema() {
            List<String> columns = new ArrayList<>(columnOrder);
            Map<String, String> normalized = IdentifierNaming.uniqueNormalizedNames(columns);
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

            if (!JsonValueSupport.isBooleanValue(value)) allBoolean = false;
            if (!JsonValueSupport.isNumericValue(value)) allNumeric = false;
            if (!JsonValueSupport.isDateValue(value)) allDate = false;

            if (distinct.size() < DISTINCT_CAP) distinct.add(text);
            if (sampleValues.size() < SAMPLE_LIMIT && !sampleValues.contains(text)) sampleValues.add(text);

            if (JsonValueSupport.isNumericValue(value)) {
                try {
                    BigDecimal n = new BigDecimal(value.isNumber() ? value.numberValue().toString() : text.trim());
                    if (minNumeric == null || n.compareTo(minNumeric) < 0) minNumeric = n;
                    if (maxNumeric == null || n.compareTo(maxNumeric) > 0) maxNumeric = n;
                } catch (NumberFormatException ignored) {
                }
            }
            if (JsonValueSupport.isDateValue(value)) {
                Timestamp t = JsonValueSupport.parseTimestamp(value);
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
}
