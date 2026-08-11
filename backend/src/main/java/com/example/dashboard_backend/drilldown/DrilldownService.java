package com.example.dashboard_backend.drilldown;

import com.example.dashboard_backend.controller.QueryController;
import com.example.dashboard_backend.query.QueryConfigNormalizer;
import com.example.dashboard_backend.query.QueryConfigNormalizer.DatasetJoinModel;
import com.example.dashboard_backend.query.QueryConfigNormalizer.DatasetRef;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Orchestrates one drill-down step. Given the current grouping dimension, the active measure and the
 * accumulated {@code =}/null filters, it:
 * <ol>
 *   <li>runs the current-level grouped query — reusing {@link QueryConfigNormalizer} and
 *       {@link QueryController#generateSql} so single-table and nested/joined datasets behave
 *       identically, with no drill-specific SQL string building; and</li>
 *   <li>asks {@link DrilldownCandidateSelector} whether a further drill is meaningful and, if so, which
 *       dimension comes next.</li>
 * </ol>
 *
 * <p>The whole feature is additive: it depends only on the shared query package and touches no existing
 * endpoint, so it drops into a shared branch without colliding with other work.
 */
@Service
public class DrilldownService {

    private static final int DEFAULT_TOP_N = 50;
    /** Chart kinds that have no meaningful category axis to drill into. */
    private static final Set<String> NON_DRILLABLE_CHARTS = Set.of("kpi", "table", "scatter", "gauge");

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final QueryConfigNormalizer normalizer;
    private final DrilldownCandidateSelector candidateSelector;

    public DrilldownService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper,
                            QueryConfigNormalizer normalizer, DrilldownCandidateSelector candidateSelector) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.normalizer = normalizer;
        this.candidateSelector = candidateSelector;
    }

    /** One accumulated drill filter: {@code field = value}, or {@code field IS NULL} when {@code isNull}. */
    public record DrillFilter(String field, boolean isNull, Object value) {}

    /**
     * Executes the current drill level and analyzes whether the next one is possible.
     *
     * @param request the raw request body (see the controller for its shape)
     * @return a response map with {@code generatedSql}, {@code data} and a {@code drilldown} block
     */
    public Map<String, Object> drill(JsonNode request) {
        String datasetToken = text(request, "dataset");
        if (datasetToken == null || datasetToken.isBlank()) {
            throw new IllegalArgumentException("dataset is required");
        }
        String currentDimension = text(request, "currentDimension");
        String chartType = text(request, "chartType");
        int topN = request.has("topN") && request.get("topN").isInt() ? request.get("topN").asInt() : DEFAULT_TOP_N;

        JsonNode measureNode = request.get("measure");
        String measureField = measureNode == null ? null : text(measureNode, "field");
        String measureAgg = measureNode == null ? null : text(measureNode, "aggregation");
        String measureAlias = measureNode == null ? null : text(measureNode, "alias");
        if (measureAgg == null || measureAgg.isBlank()) measureAgg = "SUM";
        if (measureAlias == null || measureAlias.isBlank()) measureAlias = "value";

        List<DrillFilter> filters = parseFilters(request.get("filters"));
        List<Map<String, Object>> baseRules = parseBaseRules(request.get("baseFilters"));

        // 1. Current-level data via the shared query pipeline (join-aware for nested datasets). The
        // widget's own base filters are applied first, then the accumulated drill-click filters.
        QueryController.GeneratedQuery query =
                buildCurrentLevelQuery(datasetToken, currentDimension, measureField, measureAgg, measureAlias,
                        filters, baseRules, topN);
        List<Map<String, Object>> data = jdbcTemplate.queryForList(query.sql(), query.params().toArray());

        // 2. Analyze the next level.
        DrilldownCandidateSelector.Decision decision =
                analyzeNext(datasetToken, chartType, currentDimension, measureField, filters, baseRules);

        Map<String, Object> drilldown = new LinkedHashMap<>();
        drilldown.put("enabled", decision.enabled());
        drilldown.put("reason", decision.reason());
        drilldown.put("nextDimension", decision.nextDimension());
        drilldown.put("currentDimension", currentDimension);
        drilldown.put("candidates", decision.candidates());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("generatedSql", QueryController.renderPreview(query));
        response.put("data", data);
        response.put("drilldown", drilldown);
        return response;
    }

    private DrilldownCandidateSelector.Decision analyzeNext(String datasetToken, String chartType,
                                                            String currentDimension, String measureField,
                                                            List<DrillFilter> filters,
                                                            List<Map<String, Object>> baseRules) {
        if (chartType != null && NON_DRILLABLE_CHARTS.contains(chartType.toLowerCase())) {
            return new DrilldownCandidateSelector.Decision(false, "chart type is not drillable", null, List.of());
        }

        DatasetRef ref = normalizer.resolveDataset(datasetToken);
        DatasetJoinModel model = normalizer.buildJoinModel(ref.uploadId(), ref.tableName());

        // A field already constrained — as the current dimension, a drill filter, or a base filter — is
        // not a useful next dimension (no repeats / cycles).
        Set<String> usedLabels = new LinkedHashSet<>();
        if (currentDimension != null && !currentDimension.isBlank()) usedLabels.add(currentDimension);
        for (DrillFilter f : filters) usedLabels.add(f.field());
        for (Map<String, Object> r : baseRules) {
            Object field = r.get("field");
            if (field != null) usedLabels.add(String.valueOf(field));
        }

        return candidateSelector.analyze(model, measureField, currentDimension, usedLabels, filters, baseRules);
    }

    /**
     * Assembles the current level as a standard query config and runs it through the shared normalizer +
     * SQL builder — so the accumulated {@code =}/null filters, the carried-forward measure, and any joins
     * are all handled by the same code path the rest of the app uses.
     */
    private QueryController.GeneratedQuery buildCurrentLevelQuery(String datasetToken, String currentDimension,
                                                                  String measureField, String measureAgg,
                                                                  String measureAlias, List<DrillFilter> filters,
                                                                  List<Map<String, Object>> baseRules, int topN) {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("dataset", datasetToken);

        List<String> dimensions = new ArrayList<>();
        if (currentDimension != null && !currentDimension.isBlank()) {
            dimensions.add(currentDimension);
        }
        config.put("dimensions", dimensions);

        if (measureField != null && !measureField.isBlank()) {
            Map<String, Object> measure = new LinkedHashMap<>();
            measure.put("field", measureField);
            measure.put("aggregation", measureAgg);
            measure.put("alias", measureAlias);
            config.put("measures", List.of(measure));
            config.put("sorting", List.of(Map.of("field", measureAlias, "direction", "DESC")));
        }

        // Base (widget-configured) rules first, then one equality/null rule per drilled level.
        List<Map<String, Object>> rules = new ArrayList<>(baseRules);
        for (DrillFilter f : filters) {
            Map<String, Object> rule = new LinkedHashMap<>();
            rule.put("field", f.field());
            if (f.isNull()) {
                rule.put("operator", "IS NULL");
            } else {
                rule.put("operator", "=");
                rule.put("value", f.value());
            }
            rules.add(rule);
        }
        if (!rules.isEmpty()) {
            config.put("filters", Map.of("condition", "AND", "rules", rules));
        }

        config.put("pagination", Map.of("top", topN, "offset", 0));

        JsonNode normalized = normalizer.normalize(objectMapper.valueToTree(config));
        return QueryController.generateSql(normalized);
    }

    /** Converts the request's {@code baseFilters.rules} array into a list of rule maps for merging. */
    private List<Map<String, Object>> parseBaseRules(JsonNode baseFilters) {
        List<Map<String, Object>> rules = new ArrayList<>();
        if (baseFilters == null || !baseFilters.has("rules") || !baseFilters.get("rules").isArray()) {
            return rules;
        }
        for (JsonNode rule : baseFilters.get("rules")) {
            Map<String, Object> map = objectMapper.convertValue(rule, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
            if (map != null && map.get("field") != null) {
                rules.add(map);
            }
        }
        return rules;
    }

    private List<DrillFilter> parseFilters(JsonNode filtersNode) {
        List<DrillFilter> filters = new ArrayList<>();
        if (filtersNode == null || !filtersNode.isArray()) {
            return filters;
        }
        for (JsonNode f : filtersNode) {
            String field = text(f, "field");
            if (field == null || field.isBlank()) continue;
            boolean isNull = f.hasNonNull("isNull") && f.get("isNull").asBoolean();
            Object value = null;
            if (!isNull) {
                JsonNode v = f.get("value");
                if (v == null || v.isNull()) {
                    // A null value with no explicit isNull flag is treated as the null bucket.
                    isNull = true;
                } else {
                    // Ingested columns are stored as TEXT, so bind every drill value as text — a numeric
                    // or boolean clicked value would otherwise fail as "text = integer" against the column.
                    value = v.asText();
                }
            }
            filters.add(new DrillFilter(field, isNull, value));
        }
        return filters;
    }

    private static String text(JsonNode node, String field) {
        if (node == null) return null;
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }
}
