import { Injectable, computed, signal } from '@angular/core';
import { DashboardRecord, DashboardWidgetRecord, DashboardService, SaveDashboardRequest } from '@core/services/dashboard.service';
import { ActiveDatasetService, DatasetFamily, NO_ACTIVE_DATASET } from '@core/services/active-dataset.service';
import { firstValueFrom, Subscription } from 'rxjs';
import Fuse from 'fuse.js';

export interface DashItem {
  id: string;
  name: string;
  desc: string;
  edited: string;
  views: number;
  thumb: string;
  isFavorite: boolean;
  userId: string;
  createdAt: string;
}

const CARD_GRADIENTS = [
  'linear-gradient(135deg,#1e3a8a,#2563eb)',
  'linear-gradient(135deg,#1e293b,#334155)',
  'linear-gradient(135deg,#0f766e,#14b8a6)',
  'linear-gradient(135deg,#b45309,#f59e0b)',
  'linear-gradient(135deg,#065f46,#10b981)'
];

@Injectable({
  providedIn: 'root'
})
export class DashboardsStateService {
  // Core state
  private records = signal<DashboardRecord[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string>('');
  
  // Filtering and view state
  readonly filterQuery = signal<string>('');
  readonly selectedDatasets = signal<string[]>([]);
  readonly showFavoritesOnly = signal<boolean>(false);
  readonly datasetFamilies = signal<DatasetFamily[]>([]);
  readonly favoriteIds = signal<Set<string>>(new Set<string>());

  // Derived state (computed)
  readonly isSearching = computed(() => this.filterQuery().trim().length > 0);
  readonly totalDashboards = computed(() => this.records().length);
  
  // The un-searched but dataset-filtered records
  readonly scopedRecords = computed(() => {
    const dsFilter = this.selectedDatasets();
    let scoped = dsFilter.length === 0
      ? this.records()
      : this.records().filter((r) => {
          const k = this.active.dashboardFamilyKey(r);
          return k && dsFilter.includes(k);
        });

    if (this.showFavoritesOnly()) {
      const favs = this.favoriteIds();
      scoped = scoped.filter((r) => favs.has(r.dashboard_id));
    }
    return scoped;
  });

  // The base count for "X of Y"
  readonly baseCount = computed(() => this.scopedRecords().length);

  // The final display list (filtered, searched, mapped)
  readonly filteredDashboards = computed<DashItem[]>(() => {
    const q = this.filterQuery().trim();
    const scoped = this.scopedRecords();
    
    if (!q) {
      return scoped.map((record, index) => this.mapRecordToCard(record, index));
    }

    const fuse = new Fuse(scoped, {
      keys: ['name', 'description'],
      threshold: 0.4
    });

    const searchResults = fuse.search(q);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return searchResults.map((result: any, index: number) => this.mapRecordToCard(result.item, index));
  });

  private schemaSub?: Subscription;
  private familiesSub?: Subscription;

  constructor(
    private dashboardService: DashboardService,
    public active: ActiveDatasetService
  ) {}

  initialize(): void {
    this.loadFavorites();
    this.active.ensureLoaded().then(() => {
      // Intentionally left blank: active.ensureLoaded resolves when families are ready
    });
    this.loadDashboards();

    this.schemaSub = this.active.activeKey$.subscribe((key) => {
      if (key && key !== NO_ACTIVE_DATASET) {
        this.selectedDatasets.set([key]);
      } else {
        this.selectedDatasets.set([]);
      }
    });

    this.familiesSub = this.active.families$.subscribe((families) => {
      this.datasetFamilies.set(families);
    });
  }

  destroy(): void {
    this.schemaSub?.unsubscribe();
    this.familiesSub?.unsubscribe();
  }

  loadDashboards(): void {
    this.loading.set(true);
    this.error.set('');

    this.dashboardService.listDashboardRecords('anonymous').subscribe({
      next: (records) => {
        this.records.set(records);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Unable to load dashboards from database.');
        this.loading.set(false);
      }
    });
  }

  // ---- Mapping Helpers ----

  private mapRecordToCard(record: DashboardRecord, index: number): DashItem {
    return {
      id: record.dashboard_id,
      name: record.name,
      desc: record.description || 'Saved dashboard',
      edited: this.formatEdited(record.updated_at || record.created_at),
      views: record.widgets?.length || 0,
      thumb: CARD_GRADIENTS[index % CARD_GRADIENTS.length],
      isFavorite: this.favoriteIds().has(record.dashboard_id),
      userId: record.user_id || 'anonymous',
      createdAt: this.formatDate(record.created_at)
    };
  }

  private formatDate(value: string): string {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return 'unknown';
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hr = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yr}-${mo}-${day} ${hr}:${min}`;
  }

  private formatEdited(value: string): string {
    const updatedAt = new Date(value).getTime();
    if (!Number.isFinite(updatedAt)) return 'recently';
    const elapsedMs = Date.now() - updatedAt;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (elapsedMs < hour) return `${Math.max(1, Math.floor(elapsedMs / minute))}m ago`;
    if (elapsedMs < day) return `${Math.floor(elapsedMs / hour)}h ago`;
    const days = Math.floor(elapsedMs / day);
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  }

  // ---- Favorites Management ----

  private loadFavorites(): void {
    try {
      const stored = localStorage.getItem('dashboard-favorites');
      if (stored) {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids)) {
          this.favoriteIds.set(new Set(ids));
        }
      }
    } catch {
      this.favoriteIds.set(new Set());
    }
  }

  private saveFavorites(): void {
    localStorage.setItem('dashboard-favorites', JSON.stringify(Array.from(this.favoriteIds())));
  }

  toggleFavorite(id: string): void {
    const currentFavs = new Set(this.favoriteIds());
    if (currentFavs.has(id)) {
      currentFavs.delete(id);
    } else {
      currentFavs.add(id);
    }
    this.favoriteIds.set(currentFavs);
    this.saveFavorites();
  }

  // ---- Mutations ----

  async deleteDashboard(id: string): Promise<void> {
    try {
      await firstValueFrom(this.dashboardService.deleteDashboardRecord(id));
      this.records.update(recs => recs.filter(r => r.dashboard_id !== id));
    } catch (e) {
      throw new Error('Unable to delete dashboard.');
    }
  }

  async renameDashboard(id: string, newName: string): Promise<void> {
    const record = this.records().find(r => r.dashboard_id === id);
    if (!record || !newName || newName === record.name) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const widgets: DashboardWidgetRecord[] = (record.widgets ?? []).map((w: any) => ({
      widget_name: w.widget_name ?? 'widget',
      layout_json: w.layout_json ?? {},
      chart_config_json: w.chart_config_json ?? {},
      database_config_json: w.database_config_json ?? {}
    }));

    const payload: SaveDashboardRequest = {
      user_id: record.user_id || 'anonymous',
      name: newName,
      description: record.description ?? '',
      widgets
    };

    try {
      await firstValueFrom(this.dashboardService.updateDashboardRecord(id, payload));
      this.records.update(recs => 
        recs.map(r => r.dashboard_id === id ? { ...r, name: newName } : r)
      );
    } catch (e) {
      throw new Error(`Unable to rename "${record.name}".`);
    }
  }

  // ---- Setters for state ----
  setFilterQuery(q: string) {
    this.filterQuery.set(q);
  }

  setShowFavoritesOnly(favs: boolean) {
    this.showFavoritesOnly.set(favs);
  }

  setSelectedDatasets(ds: string[]) {
    this.selectedDatasets.set(ds);
  }
}
