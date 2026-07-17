import { Injectable, signal } from '@angular/core';
import { WidgetSpec } from '@features/dashboard-builder/widget-tile.component';

interface DraftSnapshot { widgets: WidgetSpec[]; name: string; datasetKey: string; }

/**
 * Holds the dashboard the builder is currently working on (its widgets, their grid layout and name)
 * so the full-screen Preview route can render exactly what's on the builder canvas without a round-trip
 * to the backend. Widgets are already hydrated with their data, so the preview draws them as-is.
 * Mirrored to sessionStorage so a Preview page refresh keeps showing the same dashboard.
 */
@Injectable({ providedIn: 'root' })
export class DashboardDraftService {
  private static readonly KEY = 'dashboard_draft_v1';

  readonly widgets = signal<WidgetSpec[]>([]);
  readonly name = signal<string>('Untitled dashboard');
  /** The active dataset-family key this draft was built on, so the builder can ignore a draft that
   *  belongs to a different dataset (or to none at all — a fresh session before any upload). */
  readonly datasetKey = signal<string>('');

  constructor() {
    const saved = this.load();
    if (saved) {
      this.widgets.set(saved.widgets ?? []);
      this.name.set(saved.name || 'Untitled dashboard');
      this.datasetKey.set(saved.datasetKey || '');
    }
  }

  /** Replace the draft with the builder's current widgets (and optional dashboard name / dataset key). */
  set(widgets: WidgetSpec[], name?: string, datasetKey?: string): void {
    // Clone so later in-place layout edits on the builder don't mutate this snapshot unexpectedly.
    this.widgets.set(widgets.map(w => ({ ...w, layout: w.layout ? { ...w.layout } : undefined })));
    if (name !== undefined) this.name.set(name || 'Untitled dashboard');
    if (datasetKey !== undefined) this.datasetKey.set(datasetKey);
    this.persist();
  }

  /** Discard the draft (e.g. when starting a fresh build on a different dataset or no dataset). */
  clear(): void {
    this.widgets.set([]);
    this.name.set('Untitled dashboard');
    this.datasetKey.set('');
    try { sessionStorage.removeItem(DashboardDraftService.KEY); } catch { /* storage unavailable */ }
  }

  private persist(): void {
    try {
      const snap: DraftSnapshot = { widgets: this.widgets(), name: this.name(), datasetKey: this.datasetKey() };
      sessionStorage.setItem(DashboardDraftService.KEY, JSON.stringify(snap));
    } catch { /* storage unavailable — draft stays in-memory only */ }
  }

  private load(): DraftSnapshot | null {
    try {
      const raw = sessionStorage.getItem(DashboardDraftService.KEY);
      return raw ? JSON.parse(raw) as DraftSnapshot : null;
    } catch { return null; }
  }
}
