package com.example.dashboard_backend.drilldown;

import com.example.dashboard_backend.query.QueryConfigNormalizer;
import com.example.dashboard_backend.query.QueryConfigNormalizer.DatasetJoinModel;
import com.example.dashboard_backend.util.SqlIdentifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Decides whether a further drill-down is meaningful and, if so, picks the next dimension.
 *
 * <p>Implements the three-stage funnel:
 * <ol>
 *   <li><b>Stage 1 — rule-based exclusion (free, from metadata):</b> drop the active measure, numeric
 *       measures, id/key/FK columns, columns already used in the drill path, and columns unreachable
 *       without a one-to-many fan-out relative to the measure's table.</li>
 *   <li><b>Stage 2 — filter-scoped cardinality:</b> one query computes {@code COUNT(DISTINCT …)} for the
 *       survivors (and the total) under the accumulated drill filters. DISTINCT is fan-out safe.</li>
 *   <li><b>Stage 3 — rank &amp; pick:</b> reject constants (distinct ≤ 1) and near-grain columns, prefer
 *       moderate-cardinality label-like columns, with a deterministic tiebreak so re-clicks are stable.</li>
 * </ol>
 *
 * <p>Fan-out is prevented structurally, not patched after the fact: a child-table dimension is only a
 * candidate when the measure's table is that table or an ancestor of it (guaranteed many-to-one), so a
 * child's rows can never multiply a parent-grain measure.
 */
@Component
public class DrilldownCandidateSelector {

    /** Columns whose distinct count sits in this band are the most useful drill dimensions. */
    private static final long IDEAL_MAX_CARDINALITY = 50;
    private static final long ACCEPTABLE_MAX_CARDINALITY = 200;
    /** A column whose distinct/row ratio is at least this is treated as (near-)grain and deprioritized. */
    private static final double GRAIN_RATIO = 0.9;

    private final JdbcTemplate jdbcTemplate;
    private final QueryConfigNormalizer normalizer;

    public DrilldownCandidateSelector(JdbcTemplate jdbcTemplate, QueryConfigNormalizer normalizer) {
        this.jdbcTemplate = jdbcTemplate;
        this.normalizer = normalizer;
    }

    /** Outcome of the analysis for one drill level. */
    public record Decision(boolean enabled, String reason, String nextDimension,
                           List<Map<String, Object>> candidates) {}

    private record FieldMeta(String type, boolean isMeasure) {}
    private record Candidate(String label, String table, int order) {}

    /**
     * @param model            the dataset's join topology (label → table, ancestry)
     * @param measureLabel     display label of the active measure (its owning table anchors the fan-out rule)
     * @param currentDimension the label the chart is currently grouped by (excluded from candidates)
     * @param usedLabels       every label already consumed as a dimension or filter in the drill path
     * @param filters          accumulated drill filters, used to scope the cardinality counts
     */
    public Decision analyze(DatasetJoinModel model, String measureLabel, String currentDimension,
                            Set<String> usedLabels, List<DrilldownService.DrillFilter> filters,
                            List<Map<String, Object>> baseRules) {

        if (measureLabel == null || measureLabel.isBlank()) {
            return disabled("no active measure — already at row grain");
        }

        UUID uploadId = model.uploadId();
        Map<String, FieldMeta> metaByNorm = loadFieldMeta(uploadId);

        String measureTable = model.ownerOfLabel().getOrDefault(measureLabel, model.rootTable());

        // Stage 1 — rule-based exclusion. Enumerate in a deterministic order (tables root→deep, then each
        // table's columns in declared order) so the Stage 3 tiebreak — and therefore re-clicks — are stable.
        List<Candidate> survivors = new ArrayList<>();
        int order = 0;
        for (String table : model.orderedTables()) {
            Map<String, String> perColumn = model.labelOf().get(table);
            if (perColumn == null) continue;
            for (Map.Entry<String, String> entry : perColumn.entrySet()) {
                String norm = entry.getKey();
                String label = entry.getValue();
                order++;

                if (label.equals(currentDimension) || label.equals(measureLabel)) continue;
                if (usedLabels.contains(label)) continue;                   // no repeats / cycles

                FieldMeta meta = metaByNorm.get(norm);
                if (meta != null && (meta.isMeasure() || "numeric".equals(meta.type()))) continue; // measure, not a dim
                if (isIdOrKey(label) || isIdOrKey(norm)) continue;          // technical FK / key column

                // Fan-out guard: only many-to-one dims (candidate table is the measure's table or an ancestor).
                if (!model.isAncestorOrSelf(table, measureTable)) continue;

                survivors.add(new Candidate(label, table, order));
            }
        }

        if (survivors.isEmpty()) {
            return disabled("no valid candidate dimension remains");
        }

        // Stage 2 — filter-scoped cardinality for the survivors (single query).
        long[] distinct = new long[survivors.size()];
        long total;
        try {
            total = computeCardinalities(model, survivors, filters, baseRules, distinct);
        } catch (Exception e) {
            return disabled("cardinality probe failed: " + e.getMessage());
        }

        if (total <= 1) {
            return disabled("the clicked slice covers a single row");
        }

        // Stage 3 — rank & pick.
        List<Map<String, Object>> candidates = new ArrayList<>();
        Candidate best = null;
        double bestScore = Double.NEGATIVE_INFINITY;
        int bestOrder = Integer.MAX_VALUE;
        String bestLabel = null;

        for (int i = 0; i < survivors.size(); i++) {
            Candidate c = survivors.get(i);
            long card = distinct[i];
            String norm = model.normalizedOfLabel().getOrDefault(c.label(), c.label());
            FieldMeta meta = metaByNorm.get(norm);
            boolean eligible = card > 1;               // reject constants / single-valued
            double score = scoreOf(c.label(), meta, card, total);

            Map<String, Object> info = new LinkedHashMap<>();
            info.put("field", c.label());
            info.put("table", c.table());
            info.put("distinctCount", card);
            info.put("eligible", eligible);
            info.put("score", score);
            candidates.add(info);

            if (!eligible) continue;
            // Deterministic pick: highest score, then earliest metadata order, then name.
            if (score > bestScore
                    || (score == bestScore && c.order() < bestOrder)
                    || (score == bestScore && c.order() == bestOrder
                        && (bestLabel == null || c.label().compareTo(bestLabel) < 0))) {
                best = c;
                bestScore = score;
                bestOrder = c.order();
                bestLabel = c.label();
            }
        }

        if (best == null) {
            Decision d = disabled("all candidate dimensions are single-valued under the current filter");
            return new Decision(false, d.reason(), null, candidates);
        }

        return new Decision(true, "OK", best.label(), candidates);
    }

    /** Prefer moderate cardinality and label-like columns; penalize near-grain and free-text/date columns. */
    private double scoreOf(String label, FieldMeta meta, long card, long total) {
        double score = 0;
        double ratio = total > 0 ? (double) card / total : 0;
        if (ratio >= GRAIN_RATIO) score -= 100;                         // (near-)grain — useless to group by
        if (card >= 2 && card <= IDEAL_MAX_CARDINALITY) score += 50;
        else if (card <= ACCEPTABLE_MAX_CARDINALITY) score += 20;
        if (isLabelLike(label)) score += 10;
        if (isDeprioritized(label, meta)) score -= 30;                  // date / free-text
        return score;
    }

    /**
     * Runs one query over the dataset's full flat surface to get, scoped to the accumulated filters,
     * {@code COUNT(*)} plus {@code COUNT(DISTINCT label)} for each survivor. Fills {@code distinctOut}
     * and returns the total row count in scope.
     */
    private long computeCardinalities(DatasetJoinModel model, List<Candidate> survivors,
                                      List<DrilldownService.DrillFilter> filters,
                                      List<Map<String, Object>> baseRules, long[] distinctOut) {
        String derived = normalizer.buildFullFlatFrom(model);

        StringBuilder sql = new StringBuilder("SELECT COUNT(*) AS __total");
        for (int i = 0; i < survivors.size(); i++) {
            sql.append(", COUNT(DISTINCT ").append(quote(survivors.get(i).label())).append(") AS d").append(i);
        }
        sql.append(" FROM ").append(derived);

        List<Object> params = new ArrayList<>();
        List<String> where = new ArrayList<>();
        for (DrilldownService.DrillFilter f : filters) {
            String col = quote(f.field());
            if (f.isNull()) {
                where.add(col + " IS NULL");
            } else {
                where.add(col + " = ?");
                params.add(f.value());
            }
        }
        // Scope by the widget's categorical base filters too (=, IN, IS NULL) so distinct counts reflect
        // the data actually shown. Range/text base operators are measure-side and don't affect a
        // dimension's cardinality meaningfully, so they're skipped in this probe.
        appendBaseConditions(baseRules, where, params);
        if (!where.isEmpty()) {
            sql.append(" WHERE ").append(String.join(" AND ", where));
        }

        Map<String, Object> row = jdbcTemplate.queryForMap(sql.toString(), params.toArray());
        for (int i = 0; i < survivors.size(); i++) {
            distinctOut[i] = asLong(row.get("d" + i));
        }
        return asLong(row.get("__total"));
    }

    /**
     * Appends the categorical base-filter conditions ({@code =}, {@code IN}, {@code IS NULL}) to the probe.
     * Values bind as text because ingested columns are stored as TEXT. Range/text operators are measure-side
     * and don't meaningfully scope a dimension's cardinality, so they're intentionally skipped here.
     */
    @SuppressWarnings("unchecked")
    private void appendBaseConditions(List<Map<String, Object>> baseRules, List<String> where, List<Object> params) {
        for (Map<String, Object> rule : baseRules) {
            Object fieldObj = rule.get("field");
            if (fieldObj == null) continue;
            String col = quote(String.valueOf(fieldObj));
            String op = rule.get("operator") == null ? "=" : String.valueOf(rule.get("operator")).toUpperCase(Locale.ROOT);
            switch (op) {
                case "IS NULL" -> where.add(col + " IS NULL");
                case "IS NOT NULL" -> where.add(col + " IS NOT NULL");
                case "IN" -> {
                    if (rule.get("values") instanceof List<?> values && !values.isEmpty()) {
                        List<String> placeholders = new ArrayList<>();
                        for (Object v : values) {
                            placeholders.add("?");
                            params.add(v == null ? null : String.valueOf(v));
                        }
                        where.add(col + " IN (" + String.join(", ", placeholders) + ")");
                    }
                }
                case "=" -> {
                    Object v = rule.get("value");
                    if (v != null) {
                        where.add(col + " = ?");
                        params.add(String.valueOf(v));
                    }
                }
                default -> { /* range/text operators skipped in the probe */ }
            }
        }
    }

    private Map<String, FieldMeta> loadFieldMeta(UUID uploadId) {
        Map<String, FieldMeta> map = new LinkedHashMap<>();
        if (uploadId == null) {
            return map;
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT normalized_field_name, field_type, is_measure FROM field_metadata WHERE upload_id = ? ORDER BY id",
                uploadId);
        for (Map<String, Object> r : rows) {
            String norm = String.valueOf(r.get("normalized_field_name"));
            String type = r.get("field_type") == null ? null : String.valueOf(r.get("field_type"));
            boolean isMeasure = Boolean.TRUE.equals(r.get("is_measure"));
            map.putIfAbsent(norm, new FieldMeta(type, isMeasure));
        }
        return map;
    }

    private static boolean isIdOrKey(String name) {
        String n = name == null ? "" : name.toLowerCase(Locale.ROOT);
        return n.equals("id") || n.equals("key") || n.endsWith("_id") || n.endsWith("_key");
    }

    private static boolean isLabelLike(String name) {
        String n = name == null ? "" : name.toLowerCase(Locale.ROOT);
        return n.contains("name") || n.contains("label") || n.contains("title") || n.contains("category")
                || n.contains("type") || n.contains("status") || n.contains("region") || n.contains("country")
                || n.contains("state") || n.contains("city") || n.contains("segment") || n.contains("group")
                || n.contains("department") || n.contains("gender");
    }

    private static boolean isDeprioritized(String name, FieldMeta meta) {
        String n = name == null ? "" : name.toLowerCase(Locale.ROOT);
        boolean freeText = n.contains("description") || n.contains("notes") || n.contains("comment")
                || n.contains("address") || n.contains("email") || n.contains("url") || n.contains("message");
        boolean date = meta != null && "date".equals(meta.type());
        return freeText || date;
    }

    private static long asLong(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }

    private static String quote(String identifier) {
        return SqlIdentifier.quote(identifier);
    }

    private static Decision disabled(String reason) {
        return new Decision(false, reason, null, List.of());
    }
}
