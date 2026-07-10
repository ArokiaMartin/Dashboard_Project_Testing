import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Dashboard,
  DashboardResponse,
  DataResponse,
  SchemaResponse,
  TableSchema,
  Widget,
  AggregatedData,
  PaginatedData
} from '../types/dashboard.types';

export interface DashboardWidgetRecord {
  widget_name: string;
  layout_json: Record<string, unknown>;
  chart_config_json: Record<string, unknown>;
  database_config_json: Record<string, unknown>;
}

export interface DashboardRecord {
  dashboard_id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  widgets?: DashboardWidgetRecord[];
}

export interface SaveDashboardRequest {
  user_id: string;
  name: string;
  description?: string;
  widgets: DashboardWidgetRecord[];
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private apiUrl = environment.apiUrl;
  private currentDashboard$ = new BehaviorSubject<Dashboard | null>(null);

  constructor(private http: HttpClient) {}

  /**
   * Save a dashboard record to the backend database.
   */
  createDashboardRecord(payload: SaveDashboardRequest): Observable<DashboardRecord> {
    return this.http.post<DashboardRecord>(`${this.apiUrl}/dashboards`, payload);
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

  /**
   * Upload a JSON schema file to initialize dashboard
   */
  uploadSchema(file: File): Observable<SchemaResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<SchemaResponse>(`${this.apiUrl}/schema/upload`, formData);
  }

  /**
   * Get current schema
   */
  getSchema(): Observable<SchemaResponse> {
    return this.http.get<SchemaResponse>(`${this.apiUrl}/schema`);
  }

  /**
   * Create a new dashboard
   */
  createDashboard(dashboard: Dashboard): Observable<DashboardResponse> {
    return this.http.post<DashboardResponse>(`${this.apiUrl}/dashboards`, dashboard).pipe(
      tap((response) => {
        if (response.success && response.data) {
          this.currentDashboard$.next(response.data);
        }
      }),
      catchError((error) => {
        console.error('Error creating dashboard:', error);
        return of({ success: false, error: error.message });
      })
    );
  }

  /**
   * Get dashboard by ID
   */
  getDashboard(id: string): Observable<DashboardResponse> {
    return this.http.get<DashboardResponse>(`${this.apiUrl}/dashboards/${id}`).pipe(
      tap((response) => {
        if (response.success && response.data) {
          this.currentDashboard$.next(response.data);
        }
      })
    );
  }

  /**
   * Update dashboard
   */
  updateDashboard(id: string, dashboard: Partial<Dashboard>): Observable<DashboardResponse> {
    return this.http.put<DashboardResponse>(`${this.apiUrl}/dashboards/${id}`, dashboard).pipe(
      tap((response) => {
        if (response.success && response.data) {
          this.currentDashboard$.next(response.data);
        }
      })
    );
  }

  /**
   * Delete dashboard
   */
  deleteDashboard(id: string): Observable<DashboardResponse> {
    return this.http.delete<DashboardResponse>(`${this.apiUrl}/dashboards/${id}`).pipe(
      tap((response) => {
        if (response.success) {
          this.currentDashboard$.next(null);
        }
      })
    );
  }

  /**
   * List all dashboards
   */
  listDashboards(): Observable<{ success: boolean; data?: Dashboard[]; error?: string }> {
    return this.http.get<{ success: boolean; data?: Dashboard[]; error?: string }>(
      `${this.apiUrl}/dashboards`
    );
  }

  /**
   * Add widget to dashboard
   */
  addWidget(dashboardId: string, widget: Widget): Observable<DashboardResponse> {
    return this.http.post<DashboardResponse>(
      `${this.apiUrl}/dashboards/${dashboardId}/widgets`,
      widget
    );
  }

  /**
   * Remove widget from dashboard
   */
  removeWidget(dashboardId: string, widgetId: string): Observable<DashboardResponse> {
    return this.http.delete<DashboardResponse>(
      `${this.apiUrl}/dashboards/${dashboardId}/widgets/${widgetId}`
    );
  }

  /**
   * Update widget configuration
   */
  updateWidget(dashboardId: string, widgetId: string, widget: Partial<Widget>): Observable<DashboardResponse> {
    return this.http.put<DashboardResponse>(
      `${this.apiUrl}/dashboards/${dashboardId}/widgets/${widgetId}`,
      widget
    );
  }

  /**
   * Get chart data for visualization
   */
  getChartData(
    tableName: string,
    xField: string,
    yField: string,
    groupByField?: string,
    filters?: any
  ): Observable<DataResponse> {
    let params = new HttpParams()
      .set('xField', xField)
      .set('yField', yField);

    if (groupByField) {
      params = params.set('groupByField', groupByField);
    }

    return this.http.post<DataResponse>(
      `${this.apiUrl}/data/chart/${tableName}`,
      { filters: filters || {} },
      { params }
    );
  }

  /**
   * Get aggregated data
   */
  getAggregatedData(
    tableName: string,
    groupBy: string[],
    aggregations: { field: string; operation: string }[],
    filters?: any
  ): Observable<{ success: boolean; data?: AggregatedData; error?: string }> {
    return this.http.post<{ success: boolean; data?: AggregatedData; error?: string }>(
      `${this.apiUrl}/data/aggregate/${tableName}`,
      {
        groupBy,
        aggregations,
        filters: filters || {}
      }
    );
  }

  /**
   * Get table data with pagination
   */
  getTableData(
    tableName: string,
    page: number = 1,
    pageSize: number = 20,
    sortBy?: string,
    filters?: any
  ): Observable<{ success: boolean; data?: PaginatedData; error?: string }> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    if (sortBy) {
      params = params.set('sortBy', sortBy);
    }

    return this.http.post<{ success: boolean; data?: PaginatedData; error?: string }>(
      `${this.apiUrl}/data/table/${tableName}`,
      { filters: filters || {} },
      { params }
    );
  }

  /**
   * Get single metric KPI
   */
  getKPIData(
    tableName: string,
    metric: string,
    aggregation: string,
    filters?: any
  ): Observable<DataResponse> {
    return this.http.post<DataResponse>(
      `${this.apiUrl}/data/kpi/${tableName}`,
      {
        metric,
        aggregation,
        filters: filters || {}
      }
    );
  }

  /**
   * Get current dashboard observable
   */
  getCurrentDashboard(): Observable<Dashboard | null> {
    return this.currentDashboard$.asObservable();
  }

  /**
   * Set current dashboard
   */
  setCurrentDashboard(dashboard: Dashboard | null): void {
    this.currentDashboard$.next(dashboard);
  }

  /**
   * Export dashboard as JSON
   */
  exportDashboard(dashboardId: string): Observable<Blob> {
    return this.http.get(
      `${this.apiUrl}/dashboards/${dashboardId}/export`,
      { responseType: 'blob' }
    );
  }

  /**
   * Import dashboard from JSON
   */
  importDashboard(file: File): Observable<DashboardResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<DashboardResponse>(
      `${this.apiUrl}/dashboards/import`,
      formData
    );
  }
}
