import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { DashItem, DashboardsStateService } from './dashboards-state.service';
import { DashboardGridComponent } from './dashboard-grid.component';
import { DashboardListComponent } from './dashboard-list.component';

@Component({
  selector: 'app-dashboards',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DashboardGridComponent, DashboardListComponent],
  template: `
    <div class="page">
      <div class="head">
        <div>
          <h1>{{ state.showFavoritesOnly() ? 'Favourite Dashboards' : 'My Dashboards' }}</h1>
          <p>{{ state.showFavoritesOnly() ? 'Your starred analytics dashboards.' : 'Build, customize, and share interactive analytics dashboards.' }}</p>
        </div>
        <button class="btn primary" routerLink="/builder">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create Dashboard
        </button>
      </div>

      <!-- Filter Bar: Dataset Picker & Search Toolbar -->
      <div class="ds-bar" *ngIf="state.datasetFamilies().length || state.totalDashboards() > 0 || state.isSearching()">
        <div class="ds-left-group">
          <div class="ds-picker-group" *ngIf="state.datasetFamilies().length">
            <label class="ds-label">Dataset</label>
            <div class="custom-ds-filter" (click)="$event.stopPropagation()">
              <div class="ds-filter-trigger" (click)="toggleDsDropdown($event)">
                <span>{{ getSelectedDatasetLabel() }}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
              <div class="ds-filter-menu" *ngIf="datasetDropdownOpen">
                <input class="ds-filter-search" placeholder="Search datasets..." [ngModel]="datasetSearchTerm" (ngModelChange)="onDatasetSearch($event)" />
                <div class="ds-filter-list">
                  <div class="ds-filter-item" (click)="toggleDatasetFilter('all')">
                    <input type="checkbox" [checked]="state.selectedDatasets().length === 0" (click)="$event.stopPropagation(); toggleDatasetFilter('all')" />
                    <span>All dashboards</span>
                  </div>
                  <div class="ds-filter-item" *ngFor="let f of filteredDatasetFamilies" (click)="toggleDatasetFilter(f.key)">
                    <input type="checkbox" [checked]="state.selectedDatasets().includes(f.key)" (click)="$event.stopPropagation(); toggleDatasetFilter(f.key)" />
                    <span>{{ f.label }}</span>
                  </div>
                  <div class="ds-filter-empty" *ngIf="filteredDatasetFamilies.length === 0">No datasets match</div>
                </div>
              </div>
            </div>
          </div>

          <div class="toolbar" *ngIf="!state.loading() && !state.error() && (state.totalDashboards() > 0 || state.isSearching())">
            <div class="search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input [ngModel]="state.filterQuery()" (ngModelChange)="onFilter($event)" placeholder="Search dashboards by name…" />
              <button class="clear" *ngIf="state.filterQuery()" (click)="onFilter('')" title="Clear search">&#10005;</button>
            </div>
            <span class="count">{{ state.filteredDashboards().length }} of {{ state.baseCount() }}</span>
          </div>
        </div>

        <div class="ds-right-group" *ngIf="!state.loading() && !state.error() && state.filteredDashboards().length > 0">
          <div class="view-toggle">
            <button class="vt-btn" [class.active]="viewType === 'grid'" (click)="setViewType('grid')" title="Grid view">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </button>
            <button class="vt-btn" [class.active]="viewType === 'list'" (click)="setViewType('list')" title="List view">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>

      <p class="state" *ngIf="state.loading()">Loading dashboards from database...</p>
      <p class="state error" *ngIf="!state.loading() && state.error()">{{ state.error() }}</p>
      <p class="state" *ngIf="!state.loading() && !state.error() && state.totalDashboards() === 0">No dashboards saved yet.</p>
      <p class="state" *ngIf="!state.loading() && !state.error() && state.isSearching() && state.filteredDashboards().length === 0">No dashboards match "{{ state.filterQuery() }}".</p>
      <p class="state" *ngIf="!state.loading() && !state.error() && !state.isSearching() && state.totalDashboards() > 0 && state.scopedRecords().length === 0">No dashboards for the current dataset yet.</p>

      <app-dashboard-grid *ngIf="!state.loading() && !state.error() && state.filteredDashboards().length > 0 && viewType === 'grid'"
        [dashboards]="state.filteredDashboards()"
        [renamingId]="renamingId"
        [deletingId]="deletingId"
        [menuOpenId]="menuOpenId"
        (open)="openDashboard($event)"
        (preview)="previewDashboard($event)"
        (toggleFavorite)="state.toggleFavorite($event.id)"
        (toggleMenu)="toggleMenu($event.id, $event)"
        (share)="shareDashboard($event, $event)"
        (delete)="deleteDashboard($event)"
        (startRename)="startRename($event)"
        (commitRename)="commitRename($event.item, $event.name)"
        (cancelRename)="cancelRename()">
      </app-dashboard-grid>

      <app-dashboard-list *ngIf="!state.loading() && !state.error() && state.filteredDashboards().length > 0 && viewType === 'list'"
        [dashboards]="state.filteredDashboards()"
        [renamingId]="renamingId"
        [deletingId]="deletingId"
        (open)="openDashboard($event)"
        (preview)="previewDashboard($event)"
        (toggleFavorite)="state.toggleFavorite($event.id)"
        (share)="shareDashboard($event, $event)"
        (delete)="deleteDashboard($event)"
        (startRename)="startRename($event)"
        (commitRename)="commitRename($event.item, $event.name)"
        (cancelRename)="cancelRename()">
      </app-dashboard-list>

      <!-- Toast notification -->
      <div class="toast" *ngIf="shareMessage" (click)="shareMessage = ''">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <span>{{ shareMessage }}</span>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 28px 32px; max-width: 1300px; margin: 0 auto; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 26px; }
    .head h1 { margin: 0 0 6px; font-size: 26px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    .head p { margin: 0; font-size: 14px; color: #64748b; }
    .btn { display: inline-flex; align-items: center; gap: 8px; padding: 11px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; }
    .btn.primary { background: #2563eb; color: white; }
    .btn.primary:hover { background: #1d4ed8; }

    .ds-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; width: 100%; }
    .ds-left-group { display: flex; align-items: center; gap: 20px; flex: 1; flex-wrap: wrap; }
    .ds-right-group { display: flex; align-items: center; flex-shrink: 0; }
    .ds-picker-group { display: flex; align-items: center; gap: 12px; }
    .toolbar { display: flex; align-items: center; gap: 14px; margin: 0; }
    .ds-label { font-size: 13px; font-weight: 600; color: #475569; }
    .custom-ds-filter { position: relative; }
    .ds-filter-trigger { display: flex; align-items: center; gap: 6px; padding: 9px 14px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 14px; font-weight: 600; color: #475569; background: white; cursor: pointer; min-width: 240px; justify-content: space-between; }
    .ds-filter-trigger:hover { border-color: #cbd5e1; }
    .ds-filter-menu { position: absolute; top: calc(100% + 4px); left: 0; width: 240px; background: white; border: 1px solid #e8ebf2; border-radius: 9px; box-shadow: 0 12px 30px rgba(15,23,42,0.1); z-index: 50; display: flex; flex-direction: column; padding: 8px; }
    .ds-filter-search { padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12.5px; outline: none; margin-bottom: 6px; }
    .ds-filter-search:focus { border-color: #2563eb; }
    .ds-filter-list { max-height: 200px; overflow-y: auto; }
    .ds-filter-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; font-size: 12.5px; font-weight: 600; color: #475569; border-radius: 6px; cursor: pointer; }
    .ds-filter-item:hover { background: #f1f5f9; color: #2563eb; }
    .ds-filter-item input[type="checkbox"] { margin: 0; cursor: pointer; width: 14px; height: 14px; }
    .ds-filter-empty { padding: 8px 10px; font-size: 12px; color: #94a3b8; text-align: center; }
    .search { display: flex; align-items: center; gap: 9px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; width: 340px; max-width: 100%; }
    .search input { border: none; outline: none; width: 100%; font-size: 14px; font-weight: 500; color: #0f172a; }
    .search input::placeholder { color: #94a3b8; }
    .clear { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 0 4px; font-size: 14px; }
    .clear:hover { color: #0f172a; }
    .count { font-size: 13px; font-weight: 600; color: #64748b; white-space: nowrap; }

    .view-toggle { display: flex; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 3px; }
    .vt-btn { background: none; border: none; padding: 6px 12px; border-radius: 7px; color: #94a3b8; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
    .vt-btn:hover { color: #475569; }
    .vt-btn.active { background: white; color: #2563eb; box-shadow: 0 2px 6px rgba(0,0,0,0.05); }

    .state { margin: 4px 0 18px; color: #64748b; font-size: 14px; }
    .state.error { color: #b91c1c; }

    .toast { position: fixed; bottom: 24px; right: 24px; background: #0f172a; color: white; padding: 12px 20px; border-radius: 10px; display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; box-shadow: 0 10px 30px rgba(0,0,0,0.15); z-index: 9999; cursor: pointer; animation: toastIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
    @keyframes toastIn { from { transform: translateY(20px) scale(0.9); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
  `]
})
export class DashboardsComponent implements OnInit, OnDestroy {
  deletingId: string | null = null;
  menuOpenId: string | null = null;
  renamingId: string | null = null;
  private justStartedRename = false;

  datasetDropdownOpen = false;
  datasetSearchTerm = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filteredDatasetFamilies: any[] = [];

  private routeSub?: Subscription;
  private routerEventsSub?: Subscription;

  viewType: 'grid' | 'list' = 'grid';
  shareMessage = '';
  private shareTimeout?: any;

  constructor(
    public state: DashboardsStateService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.state.initialize();

    // Hook into dataset families updates for search filtering
    // (using effect in real code, but simple sync here is fine)
    setTimeout(() => {
      this.filteredDatasetFamilies = [...this.state.datasetFamilies()];
    }, 100);

    // Pick up route params
    this.routeSub = this.route.queryParamMap.subscribe((pm) => {
      const dataset = pm.get('dataset');
      this.state.setShowFavoritesOnly(pm.get('favorites') === 'true');
      this.loadViewType();
      this.state.setSelectedDatasets(dataset ? dataset.split(',') : []);
      
      const q = pm.get('q') ?? '';
      this.state.setFilterQuery(q);

      if (pm.get('saved') === 'true') {
        this.showShareMessage('Dashboard saved to database.');
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { saved: null },
          queryParamsHandling: 'merge',
          replaceUrl: true
        });
      }
    });

    this.routerEventsSub = this.router.events.subscribe((ev) => {
      if (ev instanceof NavigationEnd) {
        const q = this.route.snapshot.queryParamMap.get('q');
        this.state.setFilterQuery(q ?? '');
        this.state.active.ensureLoaded().then(() => {
          // ensure loaded
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.state.destroy();
    this.routeSub?.unsubscribe();
    this.routerEventsSub?.unsubscribe();
  }

  // ---- View Type ----
  setViewType(type: 'grid' | 'list'): void {
    this.viewType = type;
    const key = this.state.showFavoritesOnly() ? 'favorites-view-type' : 'dashboards-view-type';
    localStorage.setItem(key, type);
  }

  loadViewType(): void {
    try {
      const key = this.state.showFavoritesOnly() ? 'favorites-view-type' : 'dashboards-view-type';
      const savedView = localStorage.getItem(key);
      if (savedView === 'grid' || savedView === 'list') {
        this.viewType = savedView;
      } else {
        this.viewType = 'grid';
      }
    } catch {
      this.viewType = 'grid';
    }
  }

  // ---- Routing / Open ----
  openDashboard(item: DashItem): void {
    this.router.navigate(['/builder'], { queryParams: { dashboardId: item.id } });
  }

  previewDashboard(item: DashItem): void {
    this.router.navigate(['/builder'], { queryParams: { dashboardId: item.id, mode: 'view' } });
  }

  // ---- Filtering / Search ----
  onFilter(value: string): void {
    this.state.setFilterQuery(value);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: value || null, dataset: this.state.active.activeKey || null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  // ---- Dataset Dropdown ----
  toggleDsDropdown(event: Event): void {
    event.stopPropagation();
    this.datasetDropdownOpen = !this.datasetDropdownOpen;
    if (this.datasetDropdownOpen) {
      this.datasetSearchTerm = '';
      this.onDatasetSearch('');
    }
  }

  onDatasetSearch(q: string): void {
    this.datasetSearchTerm = q;
    if (!q.trim()) {
      this.filteredDatasetFamilies = [...this.state.datasetFamilies()];
      return;
    }
    // simple string match
    const lowerQ = q.toLowerCase();
    this.filteredDatasetFamilies = this.state.datasetFamilies().filter(f => f.label.toLowerCase().includes(lowerQ));
  }

  toggleDatasetFilter(key: string): void {
    const current = [...this.state.selectedDatasets()];
    if (key === 'all') {
      this.state.setSelectedDatasets([]);
    } else {
      const idx = current.indexOf(key);
      if (idx > -1) {
        current.splice(idx, 1);
      } else {
        current.push(key);
      }
      this.state.setSelectedDatasets(current);
    }
    
    const datasetParam = this.state.selectedDatasets().length > 0 ? this.state.selectedDatasets().join(',') : null;
    this.state.setFilterQuery('');
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { dataset: datasetParam, q: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  getSelectedDatasetLabel(): string {
    const selected = this.state.selectedDatasets();
    if (selected.length === 0) return 'All dashboards';
    if (selected.length === 1) {
      const match = this.state.datasetFamilies().find(d => d.key === selected[0]);
      return match ? match.label : '1 Dataset';
    }
    return `${selected.length} Datasets`;
  }

  // ---- Menu ----
  toggleMenu(id: string, event?: any): void {
    if (event) event.stopPropagation();
    this.menuOpenId = this.menuOpenId === id ? null : id;
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.menuOpenId = null;
    this.datasetDropdownOpen = false;
  }

  // ---- Mutations ----
  startRename(item: DashItem): void {
    this.menuOpenId = null;
    this.renamingId = item.id;
    this.justStartedRename = true;
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.rename-input') ??
                    document.querySelector<HTMLInputElement>('.table-rename-input');
      input?.focus();
      input?.select();
      setTimeout(() => { this.justStartedRename = false; }, 150);
    });
  }

  cancelRename(): void {
    this.renamingId = null;
  }

  async commitRename(item: DashItem, value: string): Promise<void> {
    if (this.justStartedRename) return;
    if (this.renamingId !== item.id) return;
    
    const name = (value ?? '').trim();
    this.renamingId = null;
    
    try {
      await this.state.renameDashboard(item.id, name);
    } catch (e: any) {
      // Could show a toast here if we had a toast service
      console.error(e);
    }
  }

  async deleteDashboard(item: DashItem): Promise<void> {
    this.menuOpenId = null;
    if (this.deletingId) return;
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;

    this.deletingId = item.id;
    try {
      await this.state.deleteDashboard(item.id);
    } catch (e: any) {
      console.error(e);
    } finally {
      this.deletingId = null;
    }
  }

  shareDashboard(item: DashItem, event: any): void {
    this.menuOpenId = null;
    const shareUrl = `${window.location.origin}/share/${item.userId}/${item.id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      this.showShareMessage(`Share link copied: /share/${item.userId}/${item.id}`);
    }).catch(() => {
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      this.showShareMessage(`Share link copied: /share/${item.userId}/${item.id}`);
    });
  }

  private showShareMessage(msg: string): void {
    this.shareMessage = msg;
    if (this.shareTimeout) {
      clearTimeout(this.shareTimeout);
    }
    this.shareTimeout = setTimeout(() => {
      this.shareMessage = '';
    }, 4000);
  }
}
