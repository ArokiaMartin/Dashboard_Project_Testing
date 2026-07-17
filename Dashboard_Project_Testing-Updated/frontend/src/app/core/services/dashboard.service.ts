import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';

export interface DashboardWidgetRecord {
  widget_name: string;
  layout_json: Record<string, unknown>;
  chart_config_json: Record<string, unknown>;
  database_config_json: Record<string, unknown>;
  generated_sql?: string;
  hydrated_data?: Record<string, unknown>[];
}

export interface DashboardRecord {
  dashboard_id: string;
  user_id: string;
  name: string;
  description: string | null;
  schema_id?: string | null;
  created_at: string;
  updated_at: string;
  widgets?: DashboardWidgetRecord[];
}

export interface SaveDashboardRequest {
  user_id: string;
  name: string;
  description?: string;
  schema_id?: string | null;
  widgets: DashboardWidgetRecord[];
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Save a dashboard record to the backend database.
   */
  createDashboardRecord(payload: SaveDashboardRequest): Observable<DashboardRecord> {
    return this.http.post<DashboardRecord>(`${this.apiUrl}/dashboards`, payload);
  }

  /**
   * Update an existing dashboard record (name/description and its full widget list).
   * The backend replaces all widgets, so callers must send the complete desired widget set.
   */
  updateDashboardRecord(id: string, payload: SaveDashboardRequest): Observable<DashboardRecord> {
    return this.http.put<DashboardRecord>(`${this.apiUrl}/dashboards/${encodeURIComponent(id)}`, payload);
  }

  /**
   * List dashboards directly from the backend database.
   */
  listDashboardRecords(userId?: string): Observable<DashboardRecord[]> {
    const endpoint = userId
      ? `${this.apiUrl}/dashboards/user/${encodeURIComponent(userId)}`
      : `${this.apiUrl}/dashboards`;
    return this.http.get<DashboardRecord[]>(endpoint);
  }

  /**
   * Load one dashboard record by id.
   */
  getDashboardRecord(id: string): Observable<DashboardRecord> {
    return this.http.get<DashboardRecord>(`${this.apiUrl}/dashboards/${encodeURIComponent(id)}`);
  }

  /**
   * Delete a dashboard record from the backend database (widgets cascade).
   */
  deleteDashboardRecord(id: string): Observable<{ success: boolean; dashboard_id?: string }> {
    return this.http.delete<{ success: boolean; dashboard_id?: string }>(
      `${this.apiUrl}/dashboards/${encodeURIComponent(id)}`
    );
  }
}
