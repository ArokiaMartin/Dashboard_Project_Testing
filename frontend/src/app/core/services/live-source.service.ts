import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';

/** How events reach a live source. `kafka` is intentionally unavailable at this scale. */
export type LiveArrival = 'http_push' | 'simulator' | 'external_pg' | 'kafka';

/** The role a declared field plays; drives its SQL type and how the builder offers it. */
export type LiveRole = 'timestamp' | 'measure' | 'dimension' | 'ignore';

/** Declared SQL types. Types are permanent — there is no ALTER COLUMN TYPE in the backend. */
export type LiveSqlType = 'TIMESTAMPTZ' | 'NUMERIC' | 'BIGINT' | 'DOUBLE PRECISION' | 'TEXT';

export type LiveAgg = 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX';

/** date_trunc bucket unit, whitelisted server-side. */
export type LiveBucket = 'second' | 'minute' | 'hour' | 'day';

/** Liveness of a feed. Color-coded in the UI — it is the only thing distinguishing a dead feed from a quiet one. */
export type LiveStateKind = 'LIVE' | 'SLOW' | 'STALLED' | 'NEVER_CONNECTED';

/** One declared measure or dimension in the wizard payload. */
export interface LiveFieldSpec {
  name: string;
  type: LiveSqlType;
  defaultAgg?: LiveAgg;
  nullable: boolean;
}

/** Time/window semantics (wizard Step 4). */
export interface LiveTimeConfig {
  timezone: string;
  bucket: LiveBucket;
  defaultWindowMinutes: number;
  excludeOpenBucket: boolean;
  retentionDays: number | null;
}

/** Dashboard refresh semantics (wizard Step 5). */
export interface LiveRefreshConfig {
  intervalMs: number;
  /** null = Auto (p95 of inter-arrival gaps). */
  freshnessSeconds: number | null;
}

/**
 * External Postgres connection (wizard Step 2). The password is NEVER part of this object — it is
 * write-only and posted separately, never returned, never logged, never placed in a widget config.
 */
export interface ExternalPgConnection {
  host: string;
  port: number;
  database: string;
  schema: string;
  table: string;
  username: string;
  sslMode: 'disable' | 'require' | 'verify-full';
  pollIntervalSeconds: number;
}

/** The wizard's submit payload (spec §B.6). */
export interface LiveSourceCreateRequest {
  name: string;
  arrival: LiveArrival;
  connection: ExternalPgConnection | null;
  timestampField: { name: string; type: 'TIMESTAMPTZ' };
  measures: LiveFieldSpec[];
  dimensions: LiveFieldSpec[];
  time: LiveTimeConfig;
  refresh: LiveRefreshConfig;
}

/** Row shown on the list page. */
export interface LiveSourceSummary {
  id: string;
  name: string;
  state: LiveStateKind;
  lastEventAt: string | null;
  eventsPerMinute: number;
  rows: number;
  bucket: LiveBucket;
  windowMinutes: number;
  retentionDays: number | null;
}

/** One declared field, as returned on the detail page (read-only, schema is immutable). */
export interface LiveSourceFieldInfo {
  name: string;
  columnName: string;
  role: LiveRole;
  sqlType: LiveSqlType;
  defaultAgg: LiveAgg | null;
  nullable: boolean;
}

/** Full detail for one source. */
export interface LiveSourceDetail extends LiveSourceSummary {
  slug: string;
  tableName: string;
  tsColumn: string;
  timezone: string;
  excludeOpenBucket: boolean;
  refreshIntervalMs: number;
  freshnessSeconds: number | null;
  ingestUrl: string;
  fields: LiveSourceFieldInfo[];
}

/** Settings editable via PATCH — window/bucket/retention/timezone/refresh only, never the schema. */
export interface LiveSourceSettingsPatch {
  timezone?: string;
  bucket?: LiveBucket;
  defaultWindowMinutes?: number;
  excludeOpenBucket?: boolean;
  retentionDays?: number | null;
  refreshIntervalMs?: number;
  freshnessSeconds?: number | null;
}

/** Returned exactly once at creation. The token is shown once and never again. */
export interface LiveSourceCreateResult {
  id: string;
  ingestToken: string;
  ingestUrl: string;
}

/** Health snapshot (GET /health). */
export interface LiveSourceHealth {
  state: LiveStateKind;
  lastEventAt: string | null;
  lagSeconds: number | null;
  eventsLastMinute: number;
  queueDepth: number;
  failedBatches: number;
}

/** Per-field result of validating a sample event without inserting it (POST /test-event). */
export interface LiveCoercionResult {
  field: string;
  column: string;
  sqlType: string;
  input: unknown;
  coerced: unknown;
  ok: boolean;
  message?: string;
}

export interface LiveTestConnectionResult {
  status: 'connected' | 'host unreachable' | 'authentication failed' | 'table not found' | 'permission denied';
  tables?: string[];
}

/**
 * Client for the live-source API (spec Part A). Every endpoint here is unauthenticated at the network
 * level (like the rest of this app), which the UI states plainly where it matters.
 */
@Injectable({ providedIn: 'root' })
export class LiveSourceService {
  private readonly base = `${environment.apiUrl}/live`;

  constructor(private http: HttpClient) {}

  list(): Observable<LiveSourceSummary[]> {
    return this.http.get<LiveSourceSummary[]>(`${this.base}/sources`);
  }

  get(id: string): Observable<LiveSourceDetail> {
    return this.http.get<LiveSourceDetail>(`${this.base}/sources/${id}`);
  }

  create(payload: LiveSourceCreateRequest): Observable<LiveSourceCreateResult> {
    return this.http.post<LiveSourceCreateResult>(`${this.base}/sources`, payload);
  }

  update(id: string, patch: LiveSourceSettingsPatch): Observable<LiveSourceDetail> {
    return this.http.patch<LiveSourceDetail>(`${this.base}/sources/${id}`, patch);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/sources/${id}?force=true`);
  }

  previewDdl(payload: LiveSourceCreateRequest): Observable<{ ddl: string }> {
    return this.http.post<{ ddl: string }>(`${this.base}/sources/preview-ddl`, payload);
  }

  testEvent(id: string, event: unknown): Observable<{ results: LiveCoercionResult[] }> {
    return this.http.post<{ results: LiveCoercionResult[] }>(`${this.base}/sources/${id}/test-event`, event);
  }

  health(id: string): Observable<LiveSourceHealth> {
    return this.http.get<LiveSourceHealth>(`${this.base}/sources/${id}/health`);
  }

  regenerateToken(id: string): Observable<{ ingestToken: string }> {
    return this.http.post<{ ingestToken: string }>(`${this.base}/sources/${id}/regenerate-token`, {});
  }

  /** External Postgres validate-only probe. Password is posted, never returned. */
  testConnection(connection: ExternalPgConnection, password: string): Observable<LiveTestConnectionResult> {
    return this.http.post<LiveTestConnectionResult>(`${this.base}/sources/test-connection`, { connection, password });
  }

  /** The ingest URL a producer POSTs events to. */
  ingestUrl(id: string): string {
    return `${this.base}/${id}/events`;
  }
}
