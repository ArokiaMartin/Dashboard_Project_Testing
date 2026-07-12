import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { DataVersion } from './data-versioning.service';

export interface WidgetVersionConfig {
  widgetId: string;
  selectedVersionId: string;
  selectedVersion: DataVersion | null;
}

@Injectable({
  providedIn: 'root'
})
export class WidgetVersionService {
  private widgetVersions$ = new BehaviorSubject<Map<string, WidgetVersionConfig>>(new Map());

  constructor() {}

  /**
   * Set the selected version for a widget
   */
  setWidgetVersion(widgetId: string, versionId: string, version: DataVersion | null): void {
    const current = this.widgetVersions$.value;
    current.set(widgetId, { widgetId, selectedVersionId: versionId, selectedVersion: version });
    this.widgetVersions$.next(new Map(current));
  }

  /**
   * Get the selected version for a widget
   */
  getWidgetVersion(widgetId: string): WidgetVersionConfig | undefined {
    return this.widgetVersions$.value.get(widgetId);
  }

  /**
   * Get all widget versions
   */
  getAllWidgetVersions(): Observable<Map<string, WidgetVersionConfig>> {
    return this.widgetVersions$.asObservable();
  }

  /**
   * Clear widget version selection
   */
  clearWidgetVersion(widgetId: string): void {
    const current = this.widgetVersions$.value;
    current.delete(widgetId);
    this.widgetVersions$.next(new Map(current));
  }

  /**
   * Clear all widget versions
   */
  clearAllVersions(): void {
    this.widgetVersions$.next(new Map());
  }
}
