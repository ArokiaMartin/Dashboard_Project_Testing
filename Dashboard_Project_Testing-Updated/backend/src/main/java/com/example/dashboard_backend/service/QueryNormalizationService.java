package com.example.dashboard_backend.service;

import com.example.dashboard_backend.ingestion.metadata.IngestionMetadataRepository;
import com.example.dashboard_backend.util.SqlIdentifier;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Single source of truth for normalizing a dashboard query config before SQL generation.
 *
 * <p>Both {@code QueryController} (execute-query / generate-query endpoints) and
 * {@code DashboardService} (save / hydrate widgets) delegate here, so the JOIN logic is
 * written and tested in exactly one place.
 *
 * <p>Normalization does three things in order:
 * <ol>
 *   <li>Resolve the {@code dataset} field (UUID or table-name token) to the actual PostgreSQL
 *       table name.</li>
 *   <li>For datasets with nested child tables: build (or reuse) a flat LEFT-JOIN derived-table
 *       clause and store it in {@code datasetFromSql}.  The JOIN covers every column referenced
 *       by the widget <em>and</em> every column in its drill hierarchy, so drill-down queries
 *       can reuse the same clause without a rebuild.</li>
 *   <li>For flat (single-table) datasets: remap display field names to their normalized DB
 *       column names.</li>
 * </ol>
 *
 * <h2>trustExistingDatasetFromSql</h2>
 * When {@code true}, a non-blank {@code datasetFromSql} already present in the incoming config
 * is used as-is and no database queries are issued for the JOIN — only the dataset token is
 * resolved.  Pass {@code true} at <em>query execution time</em> (the saved config is already
 * correct).  Pass {@code false} at <em>save time</em> to always recompute a fresh clause from
 * the current table structure.
 */
@Service
public class QueryNormalizationService {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final IngestionMetadataRepository metadataRepository;

    public QueryNormalizationService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper,
                                     IngestionMetadataRepository metadataRepository) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.metadataRepository = metadataRepository;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /** Resolved dataset: the upload's UUID (may be null for table-name-only tokens) and its table name. */
    public record DatasetMeta(UUID uploadId, String tableName) {}

    /**
     * Normalizes {@code config} in place on a deep copy; returns the mutated copy.
     *
     * @param config                    the incoming query config (ObjectNode)
     * @param trustExistingDatasetFromSql when {@code true} and a non-blank {@code datasetFromSql}
     *                                    is already in the config, skip rebuilding the JOIN clause
     */
    public ObjectNode normalizeConfig(ObjectNode config, boolean trustExistingDatasetFromSql) {
        ObjectNode normalized = config.deepCopy();

        String datasetToken = normalized.path("dataset").asText(null);
        DatasetMeta meta = resolveDatasetMeta(datasetToken);
        normalized.put("dataset", meta.tableName());

        // If a pre-built JOIN clause is already stored and the caller trusts it, use it as-is.
        JsonNode existingFromSql = normalized.get("datasetFromSql");
        if (trustExistingDatasetFromSql
                && existingFromSql != null
                && !existingFromSql.isNull()
                && !existingFromSql.asText().isBlank()) {
            return normalized;
        }

        if (meta.uploadId() != null) {
            // Collect every column referenced by the widget AND its full drill hierarchy so the
            // derived table covers all levels without needing a rebuild at drill time.
            Set<String> referenced = collectReferencedColumns(normalized);
            String flatFrom = buildFlatFromClause(meta.uploadId(), meta.tableName(), referenced);
            if (flatFrom != null) {
                normalized.put("datasetFromSql", flatFrom);
                return normalized;
            }
        }

        // Flat (single-table) dataset: remap display field names to normalized DB column names.
        Map<String, String> fieldMap = meta.uploadId() == null
                ? Collections.emptyMap()
                : loadFieldMap(meta.uploadId());
        remapDimensions(normalized.withArray("dimensions"), fieldMap);
        remapMeasures(normalized.withArray("measures"), fieldMap);
        // Access filters.rules safely without the deprecated ObjectNode.with() method.
        JsonNode filtersNode = normalized.get("filters");
        if (filtersNode instanceof ObjectNode filtersObj) {
            remapFilters(filtersObj.withArray("rules"), fieldMap);
        }
        remapHaving(normalized.withArray("having"), fieldMap);
        remapSorting(normalized.withArray("sorting"), fieldMap);

        return normalized;
    }

    // -------------------------------------------------------------------------
    // Dataset resolution
    // -------------------------------------------------------------------------

    /** Resolves a dataset token (UUID string or table/filename string) to its metadata. */
    public DatasetMeta resolveDatasetMeta(String datasetToken) {
        if (datasetToken == null || datasetToken.isBlank()) {
            throw new IllegalArgumentException("Dataset is required");
        }

        // Try UUID first.
        try {
            UUID uploadId = UUID.fromString(datasetToken);
            List<Map<String, Object>> byId = jdbcTemplate.queryForList(
                    "SELECT id, table_name FROM data_uploads WHERE id = ?", uploadId);
            if (!byId.isEmpty()) {
                return new DatasetMeta(
                        (UUID) byId.get(0).get("id"),
                        String.valueOf(byId.get(0).get("table_name")));
            }
        } catch (IllegalArgumentException ignored) {
            // Not a UUID — fall through to name-based lookup.
        }

        // Name-based lookup (table_name or original_filename), newest first.
        List<Map<String, Object>> byName = jdbcTemplate.queryForList(
                "SELECT id, table_name FROM data_uploads " +
                "WHERE table_name = ? OR original_filename = ? " +
                "ORDER BY created_at DESC LIMIT 1",
                datasetToken, datasetToken);
        if (!byName.isEmpty()) {
            return new DatasetMeta(
                    (UUID) byName.get(0).get("id"),
                    String.valueOf(byName.get(0).get("table_name")));
        }

        // Unknown dataset: pass the token through as-is (will fail at SQL execution time).
        return new DatasetMeta(null, datasetToken);
    }

    // -------------------------------------------------------------------------
    // Referenced-column collection
    // -------------------------------------------------------------------------

    /**
     * Collects every column name referenced anywhere in the query config — dimensions, measure
     * fields, filter fields, HAVING fields, sort fields — <em>plus</em> the drill path dimensions
     * and drill measure fields.  Including the drill path means the derived table built by
     * {@link #buildFlatFromClause} is wide enough for every drill level, so drill-down queries
     * can reuse the stored {@code datasetFromSql} without a rebuild.
     */
    public Set<String> collectReferencedColumns(ObjectNode config) {
        Set<String> cols = new HashSet<>();

        addTextItems(cols, config.get("dimensions"));

        JsonNode measures = config.get("measures");
        if (measures != null && measures.isArray()) {
            for (JsonNode m : measures) {
                if (m.hasNonNull("field")) cols.add(m.get("field").asText());
            }
        }

        JsonNode filters = config.get("filters");
        if (filters != null && filters.has("rules") && filters.get("rules").isArray()) {
            for (JsonNode r : filters.get("rules")) {
                if (r.hasNonNull("field")) cols.add(r.get("field").asText());
            }
        }

        JsonNode having = config.get("having");
        if (having != null && having.isArray()) {
            for (JsonNode h : having) {
                if (h.hasNonNull("field")) cols.add(h.get("field").asText());
            }
        }

        JsonNode sorting = config.get("sorting");
        if (sorting != null && sorting.isArray()) {
            for (JsonNode s : sorting) {
                if (s.hasNonNull("field")) cols.add(s.get("field").asText());
            }
        }

        // Drill path: extra dimension columns (db field / display names) the user can drill into.
        // Including these ensures the derived JOIN table covers every drill level so the stored
        // datasetFromSql is reusable for the entire drill hierarchy without rebuilding.
        addTextItems(cols, config.get("drillPath"));

        // Drill measures: the measure fields used when drilling (may differ from base measures).
        JsonNode drillMeasures = config.get("drillMeasures");
        if (drillMeasures != null && drillMeasures.isArray()) {
            for (JsonNode m : drillMeasures) {
                if (m.hasNonNull("field")) cols.add(m.get("field").asText());
            }
        }

        // drillBase: the table widget's first-column drill key field.
        JsonNode drillBase = config.get("drillBase");
        if (drillBase != null && drillBase.isTextual() && !drillBase.asText().isBlank()) {
            cols.add(drillBase.asText());
        }

        return cols;
    }

    private static void addTextItems(Set<String> target, JsonNode array) {
        if (array != null && array.isArray()) {
            for (JsonNode item : array) {
                if (item.isTextual()) target.add(item.asText());
            }
        }
    }

    // -------------------------------------------------------------------------
    // Flat JOIN derived-table builder
    // -------------------------------------------------------------------------

    /**
     * Builds a flattened derived-table FROM clause for a dataset that has nested child tables:
     * <pre>
     *   (SELECT t0."col" AS "display", t1."col" AS "display", ...
     *    FROM "root" t0
     *    LEFT JOIN "root_child" t1 ON t1.parent_row_id = t0.row_id AND t1.upload_id = 'uuid'::uuid
     *    WHERE t0.upload_id = 'uuid'::uuid) AS "root"
     * </pre>
     *
     * <p>Only the tables whose columns are referenced (plus their ancestor chain to the root) are
     * joined, so unrelated sibling collections don't cause fan-out.  The {@code referencedColumns}
     * set should include <em>all</em> columns the widget and its drill hierarchy will ever need —
     * see {@link #collectReferencedColumns}.
     *
     * <p>The upload-id UUID is inlined as a validated literal (never user input) so the derived
     * table needs no bind parameters, keeping {@code generateSql}'s parameter ordering intact.
     *
     * @return the derived-table SQL string, or {@code null} if the dataset has no child tables
     */
    public String buildFlatFromClause(UUID uploadId, String rootTable, Set<String> referencedColumns) {
        // Look up relationships from our own metadata — one indexed query, no information_schema scan.
        // The result is already ordered shortest child-table-name first so a parent is always
        // encountered before any of its children when iterating.
        List<Map<String, Object>> relationships = metadataRepository.getTableChildren(uploadId);
        if (relationships.isEmpty()) {
            return null;
        }

        // Build the parent-of map from the stored metadata.
        // No name-prefix guessing: every relationship was recorded explicitly at ingestion time.
        Map<String, String> parentOf = new LinkedHashMap<>();
        Map<String, List<String>> childrenOf = new LinkedHashMap<>();
        for (Map<String, Object> rel : relationships) {
            String child  = String.valueOf(rel.get("child_table"));
            String parent = String.valueOf(rel.get("parent_table"));
            parentOf.put(child, parent);
            childrenOf.computeIfAbsent(parent, k -> new ArrayList<>()).add(child);
        }

        // BFS from root — topological order derived entirely from the parent→child map.
        // A node is enqueued only after its parent has been dequeued, so every parent alias
        // exists in aliasOf before any child tries to look it up. No name-length heuristic.
        List<String> orderedTables = new ArrayList<>();
        List<String> childTables   = new ArrayList<>();
        Deque<String> queue = new ArrayDeque<>();
        queue.add(rootTable);
        while (!queue.isEmpty()) {
            String current = queue.poll();
            orderedTables.add(current);
            if (!current.equals(rootTable)) childTables.add(current);
            // Sort siblings for stable alias assignment across calls.
            childrenOf.getOrDefault(current, Collections.emptyList())
                      .stream().sorted().forEach(queue::add);
        }

        // Assign a short alias (t0, t1, …) to each table.
        Map<String, String> aliasOf = new LinkedHashMap<>();
        for (int i = 0; i < orderedTables.size(); i++) {
            aliasOf.put(orderedTables.get(i), "t" + i);
        }

        // Build a leaf-label map: normalized column name → friendly display name (leaf of the
        // dotted field_name, e.g. "orders.amount" → "amount"), first-wins, matching /flat-rows.
        List<Map<String, Object>> allFields = jdbcTemplate.queryForList(
                "SELECT field_name, normalized_field_name FROM field_metadata WHERE upload_id = ? ORDER BY id",
                uploadId);
        Map<String, String> displayByNorm = new LinkedHashMap<>();
        for (Map<String, Object> f : allFields) {
            String fieldName = String.valueOf(f.get("field_name"));
            String norm = String.valueOf(f.get("normalized_field_name"));
            String leaf = fieldName != null && fieldName.contains(".")
                    ? fieldName.substring(fieldName.lastIndexOf('.') + 1)
                    : fieldName;
            displayByNorm.putIfAbsent(norm, leaf);
        }

        // Physical data columns of each table (excluding infra columns).
        // This per-table query hits information_schema with a specific table_name predicate —
        // fast and indexed, unlike the old full-schema scan.
        Map<String, List<String>> columnsOf = new LinkedHashMap<>();
        for (String tableName : orderedTables) {
            List<String> cols = jdbcTemplate.queryForList(
                    "SELECT column_name FROM information_schema.columns " +
                    "WHERE table_schema = current_schema() AND table_name = ? " +
                    "AND column_name NOT IN ('upload_id', 'row_id', 'parent_row_id') " +
                    "ORDER BY ordinal_position",
                    String.class, tableName);
            columnsOf.put(tableName, cols);
        }

        // Assign globally-unique display labels in the same order /flat-rows uses (first-wins on clash).
        // Track which table owns each label so we can decide which tables the query needs.
        Map<String, Map<String, String>> labelOf = new LinkedHashMap<>(); // table → (col → label)
        Map<String, String> ownerOfLabel = new HashMap<>();               // label → table
        Set<String> usedLabels = new LinkedHashSet<>();
        for (String tableName : orderedTables) {
            Map<String, String> perCol = new LinkedHashMap<>();
            for (String col : columnsOf.get(tableName)) {
                String label = displayByNorm.getOrDefault(col, col);
                if (!usedLabels.add(label)) {
                    String base = label;
                    int k = 2;
                    do { label = base + "_" + k++; } while (!usedLabels.add(label));
                }
                perCol.put(col, label);
                ownerOfLabel.put(label, tableName);
            }
            labelOf.put(tableName, perCol);
        }

        // Determine which tables to join: the owner of each referenced label plus its ancestor
        // chain up to the root.  The root is always included.
        Set<String> included = new LinkedHashSet<>();
        included.add(rootTable);
        for (String ref : (referencedColumns == null ? Collections.<String>emptySet() : referencedColumns)) {
            String owner = ownerOfLabel.get(ref);
            if (owner == null) continue; // measure alias or unknown name — ignore
            for (String t = owner; t != null && included.add(t); t = parentOf.get(t)) {
                // Walk up to root, adding each ancestor exactly once.
            }
        }

        // Build the FROM / JOIN chain and the SELECT list.
        String uuidLiteral = "'" + uploadId + "'::uuid";
        StringBuilder from = new StringBuilder(quoteIdentifier(rootTable) + " " + aliasOf.get(rootTable));
        for (String child : childTables) {
            if (!included.contains(child)) continue;
            String ca = aliasOf.get(child);
            String pa = aliasOf.get(parentOf.get(child));
            from.append(" LEFT JOIN ").append(quoteIdentifier(child)).append(" ").append(ca)
                .append(" ON ").append(ca).append(".parent_row_id = ").append(pa).append(".row_id")
                .append(" AND ").append(ca).append(".upload_id = ").append(uuidLiteral);
        }

        List<String> selectParts = new ArrayList<>();
        for (String tableName : orderedTables) {
            if (!included.contains(tableName)) continue;
            String alias = aliasOf.get(tableName);
            for (Map.Entry<String, String> e : labelOf.get(tableName).entrySet()) {
                selectParts.add(alias + "." + quoteIdentifier(e.getKey()) + " AS " + quoteIdentifier(e.getValue()));
            }
        }
        if (selectParts.isEmpty()) {
            return null;
        }

        return "(SELECT " + String.join(", ", selectParts)
                + " FROM " + from
                + " WHERE " + aliasOf.get(rootTable) + ".upload_id = " + uuidLiteral
                + ") AS " + quoteIdentifier(rootTable);
    }

    // -------------------------------------------------------------------------
    // Field-name remapping helpers (flat datasets)
    // -------------------------------------------------------------------------

    /**
     * Loads a map from display field name (and from normalized name) to normalized DB column name
     * for the given upload.  Both directions are stored so both display-name and already-normalized
     * inputs resolve correctly.
     */
    public Map<String, String> loadFieldMap(UUID uploadId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT field_name, normalized_field_name FROM field_metadata WHERE upload_id = ?",
                uploadId);
        Map<String, String> map = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String fieldName = String.valueOf(row.get("field_name"));
            String normName  = String.valueOf(row.get("normalized_field_name"));
            map.put(fieldName, normName);
            map.put(normName, normName); // idempotent: already-normalized names pass through
        }
        return map;
    }

    public void remapDimensions(ArrayNode dimensions, Map<String, String> fieldMap) {
        for (int i = 0; i < dimensions.size(); i++) {
            dimensions.set(i, objectMapper.getNodeFactory()
                    .textNode(resolveField(fieldMap, dimensions.get(i).asText())));
        }
    }

    public void remapMeasures(ArrayNode measures, Map<String, String> fieldMap) {
        for (JsonNode node : measures) {
            if (node instanceof ObjectNode m && m.has("field")) {
                m.put("field", resolveField(fieldMap, m.get("field").asText()));
            }
        }
    }

    public void remapFilters(ArrayNode rules, Map<String, String> fieldMap) {
        for (JsonNode node : rules) {
            if (node instanceof ObjectNode r && r.has("field")) {
                r.put("field", resolveField(fieldMap, r.get("field").asText()));
            }
        }
    }

    public void remapHaving(ArrayNode having, Map<String, String> fieldMap) {
        for (JsonNode node : having) {
            if (node instanceof ObjectNode h && h.has("measure")) {
                h.put("measure", resolveField(fieldMap, h.get("measure").asText()));
            }
        }
    }

    public void remapSorting(ArrayNode sorting, Map<String, String> fieldMap) {
        for (JsonNode node : sorting) {
            if (node instanceof ObjectNode s && s.has("field")) {
                s.put("field", resolveField(fieldMap, s.get("field").asText()));
            }
        }
    }

    public static String resolveField(Map<String, String> fieldMap, String requestedField) {
        if (requestedField == null || requestedField.isBlank()) return requestedField;
        return fieldMap.getOrDefault(requestedField, requestedField);
    }

    private static String quoteIdentifier(String identifier) {
        return SqlIdentifier.quote(identifier);
    }
}
