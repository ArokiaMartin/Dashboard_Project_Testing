import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '@env/environment';

/** One row from GET /api/datasets. */
export interface DatasetSummary {
  id: string;
  table_name: string;
  original_filename: string;
  row_count: number;
  column_count: number;
  status: string;
  created_at: string;
  /** Schema this data version belongs to (null for legacy/generic uploads). */
  schema_id?: string | null;
  /** 1-based data version number within the schema (null for legacy/generic uploads). */
  version_number?: number | null;
}

/** One row from GET /api/schemas — used to label datasets by their schema name. */
export interface SchemaSummary {
  id: string;
  schemaName: string;
  schemaVersion?: number;
}

/** Response of GET /api/datasets/{id}/rows — columns, their types, and up to 500 rows. */
export interface DatasetData {
  columns: string[];
  types: string[];
  rows: Record<string, unknown>[];
}

export interface QueryExecuteResponse {
  generatedSql: string;
  data: Record<string, unknown>[];
}

/** One drill-down candidate the backend evaluated (surfaced for transparency/debugging). */
export interface DrilldownCandidate {
  field: string;
  table: string;
  distinctCount: number;
  eligible: boolean;
  score: number;
}

/** The analysis block returned by POST /api/drilldown: whether a further drill is meaningful. */
export interface DrilldownAnalysis {
  enabled: boolean;
  reason: string;
  nextDimension: string | null;
  currentDimension: string | null;
  candidates: DrilldownCandidate[];
}

/** Full response of POST /api/drilldown: the current level's rows plus the next-level analysis. */
export interface DrilldownResponse {
  generatedSql: string;
  data: Record<string, unknown>[];
  drilldown: DrilldownAnalysis;
}

/** One accumulated drill filter sent to the backend: {field=value}, or the null bucket. */
export interface DrilldownFilter {
  field: string;
  value?: string | number | boolean;
  isNull?: boolean;
}

/** Request body for POST /api/drilldown. */
export interface DrilldownRequest {
  dataset: string;
  currentDimension: string | null;
  measure: { field: string; aggregation: string; alias: string };
  /** Accumulated drill-click filters (one equality/null per drilled level). */
  filters: DrilldownFilter[];
  /** The widget's own configured filters (IN/range/etc.), carried so every level respects them. */
  baseFilters?: { condition?: string; rules: unknown[] };
  chartType?: string;
  topN?: number;
}

/**
 * Reads stored datasets from the backend (DatasetController) so the Dashboard Builder can load a
 * table's real columns and rows straight from PostgreSQL. `environment.apiUrl` already ends in /api.
 */
@Injectable({ providedIn: 'root' })
export class BackendIntegrationService {
  private readonly base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** Lists every dataset currently stored in the database. */
  listDatasets(): Promise<DatasetSummary[]> {
    return firstValueFrom(this.http.get<DatasetSummary[]>(`${this.base}/datasets`));
  }

  /** Lists the schemas (id + display name) so datasets can be labelled by schema. */
  listSchemas(userId = environment.defaultUserId): Promise<SchemaSummary[]> {
    return firstValueFrom(
      this.http.get<SchemaSummary[]>(`${this.base}/schemas?userId=${encodeURIComponent(userId)}`)
    );
  }

  /** Loads one dataset's columns, types, and rows. `limit` raises the backend's default 500-row cap (max 10000). */
  getDatasetData(uploadId: string, limit = 500): Promise<DatasetData> {
    return firstValueFrom(
      this.http.get<DatasetData>(`${this.base}/datasets/${encodeURIComponent(uploadId)}/rows?limit=${limit}`)
    );
  }

  /**
   * Loads one dataset as a single flat rowset that combines the root table with every nested child
   * table, so all fields (top-level and nested) are available in one column list. `limit` caps rows
   * (max 50000).
   */
  getDatasetFlatData(uploadId: string, limit = 10000): Promise<DatasetData> {
    return firstValueFrom(
      this.http.get<DatasetData>(`${this.base}/datasets/${encodeURIComponent(uploadId)}/flat-rows?limit=${limit}`)
    );
  }

  /**
   * Runs a grouped aggregation in PostgreSQL (no 500-row cap) and returns the result rows.
   * `dimension` null = whole-dataset aggregate (KPI). Measures are {field, agg} pairs.
   */
  aggregate(uploadId: string, config: {
    dimension: string | null;
    measures: { field: string; agg: string }[];
    filterValues?: string[];
    orderDesc?: boolean;
    limit?: number;
  }): Promise<{ sql: string; rows: Record<string, unknown>[] }> {
    return firstValueFrom(
      this.http.post<{ sql: string; rows: Record<string, unknown>[] }>(
        `${this.base}/datasets/${encodeURIComponent(uploadId)}/aggregate`, config
      )
    );
  }

  /**
   * Executes a dashboard query config through QueryController.generateSql and returns rows.
   */
  executeQuery(config: Record<string, unknown>): Promise<QueryExecuteResponse> {
    return firstValueFrom(
      this.http.post<QueryExecuteResponse>(`${this.base}/execute-query`, config)
    );
  }

  /**
   * Runs one drill level and asks the backend whether a deeper drill is meaningful. Returns the current
   * level's rows plus a `drilldown` block with `enabled` + the auto-picked `nextDimension`. The next
   * dimension is chosen server-side by cardinality — the client never has to configure a drill path.
   */
  drilldown(request: DrilldownRequest): Promise<DrilldownResponse> {
    return firstValueFrom(
      this.http.post<DrilldownResponse>(`${this.base}/drilldown`, request)
    );
  }
}
