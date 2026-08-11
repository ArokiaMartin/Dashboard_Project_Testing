package com.example.dashboard_backend.query;

import com.example.dashboard_backend.util.SqlIdentifier;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Single source of truth for turning a raw dashboard query config (as produced by the frontend and as
 * persisted in {@code dashboard_widgets.database_config_json}) into an execution-ready config.
 *
 * <p>"Execution-ready" means these backend-owned transformations have been applied:
 * <ol>
 *   <li>any client-supplied {@code datasetFromSql} is stripped unconditionally — a FROM subquery is only
 *       ever built server-side, so a caller can never splice SQL into the FROM clause;</li>
 *   <li>the {@code dataset} token (an upload UUID or a table/file name) is resolved to a real physical
 *       table name;</li>
 *   <li>every user-facing field name is mapped to its normalized physical column name;</li>
 *   <li>for datasets with nested child tables, a flattened derived table (root {@code LEFT JOIN} its
 *       referenced children) is injected as {@code datasetFromSql} so fields from any table resolve; and</li>
 *   <li>{@code upload_id} version scoping is applied on BOTH branches — the nested join scopes the root
 *       and every child, and the flat branch wraps the single table in a derived table filtered to this
 *       upload — so no query ever silently aggregates across data versions.</li>
 * </ol>
 *
 * <p>This class exists so that <em>every</em> code path that builds SQL from a query config — live
 * preview/execution ({@code QueryController}) and dashboard widget save + hydration
 * ({@code DashboardService}) — shares the exact same normalization, including the join logic. Any path
 * that skipped this step would emit a plain {@code FROM "root_table"} and silently break for datasets
 * whose fields live in child tables.
 *
 * <p>The join topology is <strong>not</strong> stored in the database: it is discovered at normalization
 * time from the live catalog ({@code information_schema.columns}, {@code parent_row_id} links) and
 * {@code field_metadata}. Centralizing it here keeps that discovery in one place instead of duplicated
 * per caller.
 */
@Component
public class QueryConfigNormalizer {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public QueryConfigNormalizer(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * A dataset resolved to its physical root table. {@code uploadId} is {@code null} when the token
     * could not be matched to a {@code data_uploads} record (a raw table name is then used as-is).
     */
    public record DatasetRef(UUID uploadId, String tableName) {}

    /**
     * The nested-join topology of one dataset, shared by the FROM-clause builder and any consumer that
     * needs to reason about how the root and its child tables relate (e.g. drill-down candidate
     * selection). Every map is keyed by the SAME friendly display labels the UI shows.
     *
     * @param orderedTables     root first, then child tables shallow-to-deep
     * @param parentOf          child table -> its parent table (root has no entry)
     * @param columnsOf         table -> its physical data columns (row_id/parent_row_id/upload_id excluded)
     * @param labelOf           table -> (physical column -> globally-unique display label)
     * @param ownerOfLabel      display label -> the table that owns it
     * @param normalizedOfLabel display label -> its physical (normalized) column name
     */
    public record DatasetJoinModel(
            UUID uploadId,
            String rootTable,
            List<String> orderedTables,
            Map<String, String> parentOf,
            Map<String, List<String>> columnsOf,
            Map<String, Map<String, String>> labelOf,
            Map<String, String> ownerOfLabel,
            Map<String, String> normalizedOfLabel
    ) {
        public boolean hasChildren() {
            return orderedTables.size() > 1;
        }

        /** True when {@code ancestor} is {@code table} itself or lies above it in the nesting tree. */
        public boolean isAncestorOrSelf(String ancestor, String table) {
            for (String t = table; t != null; t = parentOf.get(t)) {
                if (t.equals(ancestor)) {
                    return true;
                }
            }
            return false;
        }
    }

    /**
     * A server-side supplier of a trusted {@code datasetFromSql} derived table, consulted AFTER the
     * client-supplied one has been stripped and after the normalizer built its own. Implementations get
     * the resolved dataset plus the already-normalized config and return {@code null} to leave the
     * normalizer's own FROM clause in place.
     *
     * <p>This is the ONLY sanctioned way to inject a FROM subquery: it is unreachable from request
     * payloads, so a caller can never smuggle SQL through it. Whatever is returned MUST contribute zero
     * bind parameters (no {@code ?}), otherwise generateSql's positional parameter ordering breaks.
     */
    public interface TrustedFromSqlProvider {
        String fromSqlFor(DatasetRef dataset, ObjectNode normalizedConfig);
    }

    /**
     * Resolve the dataset token to a real table and map user-facing field names to normalized DB
     * columns; when the dataset has nested child tables, attach a flattened join derived table as
     * {@code datasetFromSql}. Returns a new node — the input config is not mutated.
     */
    public JsonNode normalize(JsonNode config) {
        return normalize(config, null);
    }

    /**
     * Same as {@link #normalize(JsonNode)}, but lets a server-side component replace the derived table
     * this method built with a trusted one of its own (see {@link TrustedFromSqlProvider}). Passing
     * {@code null} is byte-for-byte identical to {@link #normalize(JsonNode)}.
     */
    public JsonNode normalize(JsonNode config, TrustedFromSqlProvider trustedFrom) {
        if (!(config instanceof ObjectNode objectNode)) {
            throw new IllegalArgumentException("Invalid query config payload");
        }

        ObjectNode normalized = objectNode.deepCopy();
        // Security: a FROM subquery is ONLY ever built server-side (below). Strip any client-supplied
        // datasetFromSql so a caller can't splice arbitrary SQL into the FROM clause.
        normalized.remove("datasetFromSql");
        String datasetToken = normalized.path("dataset").asText(null);
        DatasetRef datasetMeta = resolveDataset(datasetToken);
        normalized.put("dataset", datasetMeta.tableName());

        // When the dataset has nested child tables, build a flattened derived table (root + only the
        // referenced child tables and their ancestor chain) that exposes every field under the SAME
        // display name the UI shows. Because the derived table already uses display names, no field
        // remap is needed. Only unrelated sibling collections are left out, so parent-level measures
        // are never inflated by an irrelevant fan-out.
        String flatFrom = null;
        if (datasetMeta.uploadId() != null) {
            Set<String> referencedColumns = collectReferencedColumns(normalized);
            flatFrom = buildFlatFromClause(datasetMeta.uploadId(), datasetMeta.tableName(), referencedColumns);
        }

        if (flatFrom != null) {
            normalized.put("datasetFromSql", flatFrom);
        } else {
            // Flat dataset (no child tables): query the single physical table directly, mapping the
            // UI's display field names to their normalized physical column names.
            Map<String, String> fieldMap = datasetMeta.uploadId() == null
                    ? Collections.emptyMap()
                    : loadFieldMap(datasetMeta.uploadId());
            remapDimensions(normalized.withArray("dimensions"), fieldMap);
            remapMeasures(normalized.withArray("measures"), fieldMap);
            remapFilters(normalized.with("filters").withArray("rules"), fieldMap);
            remapHaving(normalized.withArray("having"), fieldMap);
            remapSorting(normalized.withArray("sorting"), fieldMap);

            // Version scoping: re-uploads of the same schema share ONE physical table (each upload is a
            // distinct data version keyed by upload_id). Wrap the single table in a derived table filtered
            // to this upload so charts/KPIs never silently aggregate across versions. The upload id is a
            // validated UUID resolved server-side (never client input), so inlining it is safe.
            if (datasetMeta.uploadId() != null) {
                String scoped = "(SELECT * FROM " + quoteIdentifier(datasetMeta.tableName())
                        + " WHERE upload_id = '" + datasetMeta.uploadId() + "'::uuid) AS "
                        + quoteIdentifier(datasetMeta.tableName());
                normalized.put("datasetFromSql", scoped);
            }
        }

        // Trusted, server-side-only override of the FROM subquery (e.g. the bucketed/windowed derived
        // table a live source is read through). Deliberately applied AFTER the strip above, so this is
        // the single place a FROM subquery can enter that a client cannot reach.
        if (trustedFrom != null) {
            String injected = trustedFrom.fromSqlFor(datasetMeta, normalized);
            if (injected != null && !injected.isBlank()) {
                normalized.put("datasetFromSql", injected);
            }
        }

        return normalized;
    }

    /**
     * Collects the normalized column names referenced anywhere in a (already-remapped) query config:
     * dimensions, measure fields, filter fields, having fields and sorting fields. Names that are really
     * measure aliases (not physical columns) simply won't match any table column later and are ignored.
     */
    private Set<String> collectReferencedColumns(ObjectNode config) {
        Set<String> cols = new HashSet<>();
        JsonNode dims = config.get("dimensions");
        if (dims != null && dims.isArray()) {
            for (JsonNode d : dims) {
                if (d.isTextual()) cols.add(d.asText());
            }
        }
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
        return cols;
    }

    /**
     * Resolves a dataset token (an upload UUID, a physical table name, or an original filename) to its
     * {@code data_uploads} record. Falls back to treating the token itself as a table name when no record
     * matches. Shared so drill-down and any other consumer resolve datasets identically.
     */
    public DatasetRef resolveDataset(String datasetToken) {
        if (datasetToken == null || datasetToken.isBlank()) {
            throw new IllegalArgumentException("Dataset is required");
        }

        try {
            UUID uploadId = UUID.fromString(datasetToken);
            List<Map<String, Object>> byId = jdbcTemplate.queryForList(
                    "SELECT id, table_name FROM data_uploads WHERE id = ?",
                    uploadId
            );
            if (!byId.isEmpty()) {
                return new DatasetRef((UUID) byId.get(0).get("id"), String.valueOf(byId.get(0).get("table_name")));
            }
        } catch (IllegalArgumentException ignored) {
            // Dataset token is not a UUID; continue with name-based resolution.
        }

        List<Map<String, Object>> byName = jdbcTemplate.queryForList(
                "SELECT id, table_name FROM data_uploads WHERE table_name = ? OR original_filename = ? ORDER BY created_at DESC LIMIT 1",
                datasetToken,
                datasetToken
        );
        if (!byName.isEmpty()) {
            return new DatasetRef((UUID) byName.get(0).get("id"), String.valueOf(byName.get(0).get("table_name")));
        }

        return new DatasetRef(null, datasetToken);
    }

    /**
     * Builds the nested-join topology + display-label mapping for a dataset, using the SAME table
     * discovery, ordering and first-wins label de-duplication as {@link #buildFlatFromClause} and the
     * {@code /flat-rows} endpoint — so labels line up exactly with what the UI shows. A dataset with no
     * child tables yields a single-table model ({@link DatasetJoinModel#hasChildren()} == false).
     */
    public DatasetJoinModel buildJoinModel(UUID uploadId, String rootTable) {
        List<String> withParentRefs = jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.columns " +
                "WHERE table_schema = current_schema() AND column_name = 'parent_row_id'",
                String.class);
        List<String> childTables = new ArrayList<>();
        for (String t : withParentRefs) {
            if (t.startsWith(rootTable + "_") && !childTables.contains(t)) {
                childTables.add(t);
            }
        }
        childTables.sort(Comparator.comparingInt(String::length).thenComparing(Comparator.naturalOrder()));

        List<String> orderedTables = new ArrayList<>();
        orderedTables.add(rootTable);
        orderedTables.addAll(childTables);

        // Friendly display label for each normalized column (leaf of the dotted field name), first-wins.
        Map<String, String> displayByNorm = new HashMap<>();
        if (uploadId != null) {
            List<Map<String, Object>> allFields = jdbcTemplate.queryForList(
                    "SELECT field_name, normalized_field_name FROM field_metadata WHERE upload_id = ? ORDER BY id",
                    uploadId);
            for (Map<String, Object> f : allFields) {
                String fieldName = String.valueOf(f.get("field_name"));
                String normalized = String.valueOf(f.get("normalized_field_name"));
                String leaf = fieldName != null && fieldName.contains(".")
                        ? fieldName.substring(fieldName.lastIndexOf('.') + 1) : fieldName;
                displayByNorm.putIfAbsent(normalized, leaf);
            }
        }

        // Physical columns of each table, and the parent (longest-prefix) of each child.
        Map<String, List<String>> columnsOf = new LinkedHashMap<>();
        Map<String, String> parentOf = new HashMap<>();
        for (String tableName : orderedTables) {
            List<String> cols = jdbcTemplate.queryForList(
                    "SELECT column_name FROM information_schema.columns " +
                    "WHERE table_schema = current_schema() AND table_name = ? " +
                    "AND column_name NOT IN ('upload_id', 'row_id', 'parent_row_id') " +
                    "ORDER BY ordinal_position",
                    String.class, tableName);
            columnsOf.put(tableName, cols);
            if (!tableName.equals(rootTable)) {
                String parent = rootTable;
                for (String cand : orderedTables) {
                    if (!cand.equals(tableName) && tableName.startsWith(cand + "_") && cand.length() > parent.length()) {
                        parent = cand;
                    }
                }
                parentOf.put(tableName, parent);
            }
        }

        // Assign globally-unique display labels in the exact order /flat-rows does.
        Map<String, Map<String, String>> labelOf = new LinkedHashMap<>();
        Map<String, String> ownerOfLabel = new HashMap<>();
        Map<String, String> normalizedOfLabel = new HashMap<>();
        Set<String> usedLabels = new HashSet<>();
        for (String tableName : orderedTables) {
            Map<String, String> perColumn = new LinkedHashMap<>();
            for (String col : columnsOf.get(tableName)) {
                String label = displayByNorm.getOrDefault(col, col);
                if (!usedLabels.add(label)) {
                    String base = label;
                    int k = 2;
                    do { label = base + "_" + k++; } while (!usedLabels.add(label));
                }
                perColumn.put(col, label);
                ownerOfLabel.put(label, tableName);
                normalizedOfLabel.put(label, col);
            }
            labelOf.put(tableName, perColumn);
        }

        return new DatasetJoinModel(uploadId, rootTable, orderedTables, parentOf, columnsOf,
                labelOf, ownerOfLabel, normalizedOfLabel);
    }

    /**
     * Builds a derived table that exposes EVERY column of the dataset (root + all child tables) under its
     * friendly display label — the uniform, label-addressable surface that drill-down cardinality queries
     * run against. Unlike {@link #buildFlatFromClause} this never prunes and also handles flat datasets
     * (single table, no joins), so callers get one consistent shape regardless of nesting.
     *
     * <p>Distinct counts taken over this table are fan-out safe (DISTINCT dedups any one-to-many
     * inflation). The upload id is inlined as a validated UUID literal, so the derived table needs no
     * bind parameters.
     */
    public String buildFullFlatFrom(DatasetJoinModel model) {
        String rootTable = model.rootTable();
        List<String> orderedTables = model.orderedTables();
        Map<String, String> aliasOf = new HashMap<>();
        for (int i = 0; i < orderedTables.size(); i++) {
            aliasOf.put(orderedTables.get(i), "t" + i);
        }
        String uuidLiteral = model.uploadId() == null ? null : "'" + model.uploadId() + "'::uuid";

        StringBuilder from = new StringBuilder(quoteIdentifier(rootTable) + " " + aliasOf.get(rootTable));
        for (String table : orderedTables) {
            if (table.equals(rootTable)) continue;
            String ca = aliasOf.get(table);
            String pa = aliasOf.get(model.parentOf().get(table));
            from.append(" LEFT JOIN ").append(quoteIdentifier(table)).append(" ").append(ca)
                .append(" ON ").append(ca).append(".parent_row_id = ").append(pa).append(".row_id");
            if (uuidLiteral != null) {
                from.append(" AND ").append(ca).append(".upload_id = ").append(uuidLiteral);
            }
        }

        List<String> selectParts = new ArrayList<>();
        for (String table : orderedTables) {
            String alias = aliasOf.get(table);
            Map<String, String> perColumn = model.labelOf().get(table);
            for (String col : model.columnsOf().get(table)) {
                selectParts.add(alias + "." + quoteIdentifier(col) + " AS " + quoteIdentifier(perColumn.get(col)));
            }
        }
        if (selectParts.isEmpty()) {
            selectParts.add(aliasOf.get(rootTable) + ".*");
        }

        StringBuilder sql = new StringBuilder("(SELECT ").append(String.join(", ", selectParts))
                .append(" FROM ").append(from);
        if (uuidLiteral != null) {
            sql.append(" WHERE ").append(aliasOf.get(rootTable)).append(".upload_id = ").append(uuidLiteral);
        }
        sql.append(") AS ").append(quoteIdentifier(rootTable));
        return sql.toString();
    }

    private Map<String, String> loadFieldMap(UUID uploadId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT field_name, normalized_field_name FROM field_metadata WHERE upload_id = ?",
                uploadId
        );
        Map<String, String> map = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String fieldName = String.valueOf(row.get("field_name"));
            String normalizedName = String.valueOf(row.get("normalized_field_name"));
            map.put(fieldName, normalizedName);
            map.put(normalizedName, normalizedName);
        }
        return map;
    }

    /**
     * Builds a flattened derived-table FROM clause for a dataset that has nested child tables:
     * {@code (SELECT ... FROM root t0 LEFT JOIN child t1 ON t1.parent_row_id = t0.row_id ...) AS "root"}.
     * Each child joins onto its parent (longest-prefix table name). Every column is exposed under the
     * SAME friendly display name the UI shows (leaf of the dotted field name, de-duplicated first-wins
     * exactly like the {@code /flat-rows} endpoint), so query fields resolve without any remap.
     *
     * Only the tables whose columns are actually referenced by the query — plus every ancestor needed to
     * connect them back to the root — are joined. This keeps unrelated sibling collections out of the
     * join, so their fan-out can no longer multiply (and inflate) parent-level measures. When the dataset
     * has no child tables at all, {@code null} is returned so the caller falls back to the plain
     * single-table FROM (with the usual display→normalized remap).
     *
     * The upload id is inlined as a validated UUID literal (never user input) so the derived table needs
     * no bind parameters — keeping generateSql's parameter ordering intact.
     */
    private String buildFlatFromClause(UUID uploadId, String rootTable, Set<String> referencedColumns) {
        List<String> withParentRefs = jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.columns " +
                "WHERE table_schema = current_schema() AND column_name = 'parent_row_id'",
                String.class);
        List<String> childTables = new ArrayList<>();
        for (String t : withParentRefs) {
            if (t.startsWith(rootTable + "_") && !childTables.contains(t)) {
                childTables.add(t);
            }
        }
        if (childTables.isEmpty()) {
            return null;
        }
        childTables.sort(Comparator.comparingInt(String::length).thenComparing(Comparator.naturalOrder()));

        List<String> orderedTables = new ArrayList<>();
        orderedTables.add(rootTable);
        orderedTables.addAll(childTables);
        Map<String, String> aliasOf = new HashMap<>();
        for (int i = 0; i < orderedTables.size(); i++) {
            aliasOf.put(orderedTables.get(i), "t" + i);
        }

        // Friendly display label for each normalized column (leaf of the dotted field name), first-wins.
        List<Map<String, Object>> allFields = jdbcTemplate.queryForList(
                "SELECT field_name, normalized_field_name FROM field_metadata WHERE upload_id = ? ORDER BY id",
                uploadId);
        Map<String, String> displayByNorm = new HashMap<>();
        for (Map<String, Object> f : allFields) {
            String fieldName = String.valueOf(f.get("field_name"));
            String normalized = String.valueOf(f.get("normalized_field_name"));
            String leaf = fieldName != null && fieldName.contains(".")
                    ? fieldName.substring(fieldName.lastIndexOf('.') + 1) : fieldName;
            displayByNorm.putIfAbsent(normalized, leaf);
        }

        // Physical columns of each table, and the parent (longest-prefix) of each child.
        Map<String, List<String>> columnsOf = new LinkedHashMap<>();
        Map<String, String> parentOf = new HashMap<>();
        for (String tableName : orderedTables) {
            List<String> cols = jdbcTemplate.queryForList(
                    "SELECT column_name FROM information_schema.columns " +
                    "WHERE table_schema = current_schema() AND table_name = ? " +
                    "AND column_name NOT IN ('upload_id', 'row_id', 'parent_row_id') " +
                    "ORDER BY ordinal_position",
                    String.class, tableName);
            columnsOf.put(tableName, cols);
            if (!tableName.equals(rootTable)) {
                String parent = rootTable;
                for (String cand : orderedTables) {
                    if (!cand.equals(tableName) && tableName.startsWith(cand + "_") && cand.length() > parent.length()) {
                        parent = cand;
                    }
                }
                parentOf.put(tableName, parent);
            }
        }

        // Assign globally-unique display labels in the exact order /flat-rows does, and remember which
        // table owns each label so we can decide which tables the query actually needs.
        Map<String, Map<String, String>> labelOf = new LinkedHashMap<>();   // table -> (column -> label)
        Map<String, String> ownerOfLabel = new HashMap<>();                 // label -> owning table
        Set<String> usedLabels = new HashSet<>();
        for (String tableName : orderedTables) {
            Map<String, String> perColumn = new LinkedHashMap<>();
            for (String col : columnsOf.get(tableName)) {
                String label = displayByNorm.getOrDefault(col, col);
                if (!usedLabels.add(label)) {
                    String base = label;
                    int k = 2;
                    do { label = base + "_" + k++; } while (!usedLabels.add(label));
                }
                perColumn.put(col, label);
                ownerOfLabel.put(label, tableName);
            }
            labelOf.put(tableName, perColumn);
        }

        // Determine which tables the query needs: each referenced label's owning table plus its ancestor
        // chain up to the root. The root is always present.
        Set<String> included = new LinkedHashSet<>();
        included.add(rootTable);
        Set<String> refs = referencedColumns == null ? Collections.emptySet() : referencedColumns;
        for (String ref : refs) {
            String owner = ownerOfLabel.get(ref);
            if (owner == null) continue;                       // measure alias or unknown name — ignore
            for (String t = owner; t != null && included.add(t); t = parentOf.get(t)) {
                // walk up to the root, adding each ancestor once
            }
        }

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
            Map<String, String> perColumn = labelOf.get(tableName);
            for (String col : columnsOf.get(tableName)) {
                selectParts.add(alias + "." + quoteIdentifier(col) + " AS " + quoteIdentifier(perColumn.get(col)));
            }
        }
        if (selectParts.isEmpty()) {
            return null;
        }

        return "(SELECT " + String.join(", ", selectParts) +
               " FROM " + from +
               " WHERE " + aliasOf.get(rootTable) + ".upload_id = " + uuidLiteral +
               ") AS " + quoteIdentifier(rootTable);
    }

    private static String quoteIdentifier(String identifier) {
        return SqlIdentifier.quote(identifier);
    }

    private static String resolveField(Map<String, String> fieldMap, String requestedField) {
        if (requestedField == null || requestedField.isBlank()) {
            return requestedField;
        }
        return fieldMap.getOrDefault(requestedField, requestedField);
    }

    private void remapDimensions(ArrayNode dimensions, Map<String, String> fieldMap) {
        for (int i = 0; i < dimensions.size(); i++) {
            String requested = dimensions.get(i).asText();
            dimensions.set(i, objectMapper.getNodeFactory().textNode(resolveField(fieldMap, requested)));
        }
    }

    private void remapMeasures(ArrayNode measures, Map<String, String> fieldMap) {
        for (JsonNode node : measures) {
            if (node instanceof ObjectNode measure && measure.has("field")) {
                String requested = measure.get("field").asText();
                measure.put("field", resolveField(fieldMap, requested));
            }
        }
    }

    private void remapFilters(ArrayNode rules, Map<String, String> fieldMap) {
        for (JsonNode node : rules) {
            if (node instanceof ObjectNode rule && rule.has("field")) {
                String requested = rule.get("field").asText();
                rule.put("field", resolveField(fieldMap, requested));
            }
        }
    }

    private void remapHaving(ArrayNode having, Map<String, String> fieldMap) {
        for (JsonNode node : having) {
            if (node instanceof ObjectNode rule && rule.has("measure")) {
                String requested = rule.get("measure").asText();
                rule.put("measure", resolveField(fieldMap, requested));
            }
        }
    }

    private void remapSorting(ArrayNode sorting, Map<String, String> fieldMap) {
        for (JsonNode node : sorting) {
            if (node instanceof ObjectNode sort && sort.has("field")) {
                String requested = sort.get("field").asText();
                sort.put("field", resolveField(fieldMap, requested));
            }
        }
    }
}
