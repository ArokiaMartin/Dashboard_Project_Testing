package com.example.dashboard_backend.live;

import jakarta.annotation.PostConstruct;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Persistence for the live-source <em>control plane</em>: the settings that are not already carried by
 * {@code data_uploads}/{@code field_metadata} (timezone, bucket, window, retention, refresh, and the
 * hashed ingest token), plus a per-field record of the declared role/type/aggregation the detail page
 * shows.
 *
 * <p>The physical event table, the {@code data_uploads} row and the {@code field_metadata} rows are
 * created by {@link LiveSourceRegistrar}; this repository only stores what the registrar does not.
 *
 * <p>Tables are provisioned in {@link #init()} rather than a Flyway migration to match
 * {@code IngestionMetadataRepository}, which creates the core tables the same way.
 */
@Repository
public class LiveSourceRepository {

    private final JdbcTemplate jdbcTemplate;

    public LiveSourceRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void init() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS live_source (
                  id UUID PRIMARY KEY REFERENCES data_uploads(id),
                  name TEXT NOT NULL,
                  slug TEXT NOT NULL,
                  table_name TEXT NOT NULL,
                  ts_column TEXT NOT NULL DEFAULT 'ts',
                  arrival TEXT NOT NULL DEFAULT 'http_push',
                  timezone TEXT NOT NULL,
                  default_bucket TEXT NOT NULL,
                  default_window_minutes INT NOT NULL,
                  exclude_open_bucket BOOLEAN NOT NULL DEFAULT true,
                  retention_days INT,
                  refresh_interval_ms INT NOT NULL DEFAULT 15000,
                  freshness_seconds INT,
                  ingest_token_hash TEXT,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS live_source_field (
                  source_id UUID NOT NULL REFERENCES live_source(id) ON DELETE CASCADE,
                  ordinal INT NOT NULL,
                  name TEXT NOT NULL,
                  column_name TEXT NOT NULL,
                  role TEXT NOT NULL,
                  sql_type TEXT NOT NULL,
                  default_agg TEXT,
                  nullable BOOLEAN NOT NULL DEFAULT true,
                  PRIMARY KEY (source_id, ordinal)
                )
                """);
    }

    /** Immutable settings/identity of a live source (everything except its declared fields). */
    public record LiveSourceRow(
            UUID id, String name, String slug, String tableName, String tsColumn, String arrival,
            String timezone, String bucket, int windowMinutes, boolean excludeOpenBucket,
            Integer retentionDays, int refreshIntervalMs, Integer freshnessSeconds,
            String ingestTokenHash, Instant createdAt) {}

    /** One declared field, as shown read-only on the detail page. */
    public record FieldRow(
            String name, String columnName, String role, String sqlType, String defaultAgg, boolean nullable) {}

    public void insertSource(LiveSourceRow r) {
        jdbcTemplate.update("""
                INSERT INTO live_source (id, name, slug, table_name, ts_column, arrival, timezone,
                        default_bucket, default_window_minutes, exclude_open_bucket, retention_days,
                        refresh_interval_ms, freshness_seconds, ingest_token_hash, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                r.id(), r.name(), r.slug(), r.tableName(), r.tsColumn(), r.arrival(), r.timezone(),
                r.bucket(), r.windowMinutes(), r.excludeOpenBucket(), r.retentionDays(),
                r.refreshIntervalMs(), r.freshnessSeconds(), r.ingestTokenHash(),
                Timestamp.from(r.createdAt()));
    }

    public void insertFields(UUID sourceId, List<FieldRow> fields) {
        int ordinal = 0;
        for (FieldRow f : fields) {
            jdbcTemplate.update("""
                    INSERT INTO live_source_field (source_id, ordinal, name, column_name, role, sql_type, default_agg, nullable)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    sourceId, ordinal++, f.name(), f.columnName(), f.role(), f.sqlType(), f.defaultAgg(), f.nullable());
        }
    }

    public Optional<LiveSourceRow> find(UUID id) {
        List<LiveSourceRow> rows = jdbcTemplate.query(
                "SELECT * FROM live_source WHERE id = ?", (rs, n) -> mapSource(rs), id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public List<LiveSourceRow> findAll() {
        return jdbcTemplate.query("SELECT * FROM live_source ORDER BY created_at DESC", (rs, n) -> mapSource(rs));
    }

    public List<FieldRow> fields(UUID sourceId) {
        return jdbcTemplate.query(
                "SELECT name, column_name, role, sql_type, default_agg, nullable FROM live_source_field WHERE source_id = ? ORDER BY ordinal",
                (rs, n) -> new FieldRow(
                        rs.getString("name"), rs.getString("column_name"), rs.getString("role"),
                        rs.getString("sql_type"), rs.getString("default_agg"), rs.getBoolean("nullable")),
                sourceId);
    }

    /** Applies a settings patch; only the mutable knobs, never the schema. Null map values are skipped. */
    public void updateSettings(UUID id, Map<String, Object> changes) {
        if (changes.isEmpty()) {
            return;
        }
        List<String> sets = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        for (Map.Entry<String, Object> e : changes.entrySet()) {
            sets.add(e.getKey() + " = ?");
            args.add(e.getValue());
        }
        args.add(id);
        jdbcTemplate.update("UPDATE live_source SET " + String.join(", ", sets) + " WHERE id = ?", args.toArray());
    }

    public void updateTokenHash(UUID id, String hash) {
        jdbcTemplate.update("UPDATE live_source SET ingest_token_hash = ? WHERE id = ?", hash, id);
    }

    public void delete(UUID id) {
        jdbcTemplate.update("DELETE FROM live_source_field WHERE source_id = ?", id);
        jdbcTemplate.update("DELETE FROM live_source WHERE id = ?", id);
    }

    /** Returns the stored token hash, or {@code null} when the source is unknown or has no token. */
    public String tokenHash(UUID id) {
        List<String> hashes = jdbcTemplate.query(
                "SELECT ingest_token_hash FROM live_source WHERE id = ?",
                (rs, n) -> rs.getString(1), id);
        return hashes.isEmpty() ? null : hashes.get(0);
    }

    private static LiveSourceRow mapSource(java.sql.ResultSet rs) throws java.sql.SQLException {
        Integer retention = (Integer) rs.getObject("retention_days");
        Integer freshness = (Integer) rs.getObject("freshness_seconds");
        Timestamp created = rs.getTimestamp("created_at");
        return new LiveSourceRow(
                (UUID) rs.getObject("id"),
                rs.getString("name"),
                rs.getString("slug"),
                rs.getString("table_name"),
                rs.getString("ts_column"),
                rs.getString("arrival"),
                rs.getString("timezone"),
                rs.getString("default_bucket"),
                rs.getInt("default_window_minutes"),
                rs.getBoolean("exclude_open_bucket"),
                retention,
                rs.getInt("refresh_interval_ms"),
                freshness,
                rs.getString("ingest_token_hash"),
                created == null ? Instant.now() : created.toInstant());
    }
}
