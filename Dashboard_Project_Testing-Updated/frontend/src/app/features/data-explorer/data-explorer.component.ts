import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '@env/environment';
import { UploadService } from '@core/services/upload.service';
import { LayoutService } from '@core/services/layout.service';
import { ActiveDatasetService } from '@core/services/active-dataset.service';
import { Subscription } from 'rxjs';

interface Dataset {
  id: string;
  table_name: string;
  original_filename: string;
  row_count: number;
  column_count: number;
  status: string;
  created_at: string;
  schema_id?: string | null;
  version_number?: number | null;
}

/** One physical table returned by GET /datasets/{id}/tables (root or a generated child table). */
interface TablePayload {
  tableName: string;
  title: string;
  isRoot: boolean;
  columns: string[];
  types: string[];
  rows: Record<string, any>[];
}

/** A child (nested) table rendered below the root table. */
interface ChildTable {
  title: string;
  tableName: string;
  columns: string[];
  columnTypes: string[];
  rows: any[][];
}

@Component({
  selector: 'app-data-explorer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page" [class.fullscreen]="fullscreen">
      <!-- Header -->
      <div class="head" *ngIf="!fullscreen">
        <div>
          <div class="crumbs">Data <span>/</span> <b>Uploaded Datasets</b></div>
          <h1>Uploaded Data</h1>
          <p class="sub" *ngIf="loading">Loading datasets…</p>
          <p class="sub" *ngIf="!loading && activeDataset">{{ dsName(activeDataset) }} — {{ userId }}</p>
          <p class="sub" *ngIf="!loading && !activeDataset">No dataset uploaded yet — {{ userId }}</p>
        </div>
        <div class="head-actions">
          <input #fileInput type="file" accept=".json,.csv,.xlsx,.xls" hidden (change)="onUploadSelect($event)" />
          <button class="btn primary" (click)="fileInput.click()" [disabled]="uploading">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {{ uploading ? 'Uploading…' : 'Upload' }}
          </button>
          <button class="btn ghost" (click)="loadDatasets()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15"/></svg>
            Refresh
          </button>
          <button class="btn primary" (click)="goToBuilder()" [disabled]="datasets.length === 0">
            Next: Dashboard Builder
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>

      <!-- Dataset selector: every uploaded dataset, single-select -->
      <div class="ds-tabs" *ngIf="!fullscreen && datasets.length">
        <span class="ds-tabs-label">Dataset</span>
        <select class="ds-select" [ngModel]="selected" (ngModelChange)="chooseDataset($event)">
          <option *ngFor="let d of datasets; let i = index" [ngValue]="i">{{ dsName(d) }} · {{ d.row_count }} rows</option>
        </select>
      </div>

      <div class="upload-error" *ngIf="uploadError">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        {{ uploadError }}
      </div>

      <!-- Stat cards -->
      <div class="stats" *ngIf="!fullscreen && activeDataset">
        <div class="stat"><span class="stat-label">Rows</span><span class="stat-value">{{ activeDataset.row_count }}</span></div>
        <div class="stat"><span class="stat-label">Columns</span><span class="stat-value">{{ activeDataset.column_count }}</span></div>
        <div class="stat"><span class="stat-label">Uploaded</span><span class="stat-value" style="font-size:15px;letter-spacing:0">{{ activeDataset.created_at | date:'MMM d, y' }}</span></div>
        <div class="stat"><span class="stat-label">User</span><span class="stat-value" style="font-size:15px;letter-spacing:0">{{ userId }}</span></div>
      </div>

            <!-- Empty state -->
      <div class="empty-state" *ngIf="!loading && datasets.length === 0">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><path d="M3 3h18v18H3z"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
        <p>No dataset selected. Upload a file or pick a dataset from the sidebar to get started.</p>
      </div>

      <!-- Explorer -->
      <div class="explorer" *ngIf="datasets.length > 0">
        <!-- Table detail -->
        <section class="detail">
          <div class="loading-rows" *ngIf="loadingRows">Loading rows...</div>

          <ng-container *ngIf="!loadingRows && activeDataset">
            <div class="detail-head">
              <div>
                <h3>{{ dsName(activeDataset) }}</h3>
                <span class="detail-meta">{{ visibleRows.length }} of {{ activeDataset.row_count }} rows · {{ columns.length }} columns</span>
              </div>
              <div class="detail-tools">
                <div class="detail-search">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input [value]="search" (input)="onSearch($any($event.target).value)" placeholder="Search rows..." />
                </div>
                <button class="expand-btn" (click)="toggleFullscreen()"
                        [title]="fullscreen ? 'Exit full table view' : 'Expand to full table view'">
                  <svg *ngIf="!fullscreen" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                  <svg *ngIf="fullscreen" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                </button>
                <button class="expand-btn" *ngIf="!fullscreen" (click)="deleteDataset(selected, $event)" title="Delete this dataset">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>

            <!-- column type chips -->
            <div class="type-chips">
              <span class="tchip" *ngFor="let c of columns; let ci = index" [ngClass]="typeClass(columnTypes[ci])">
                <span class="tdot">{{ typeGlyph(columnTypes[ci]) }}</span>{{ label(c) }}
              </span>
            </div>

            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th class="rownum">#</th>
                    <th *ngFor="let c of columns; let ci = index"
                        class="sortable" [ngClass]="typeClass(columnTypes[ci])"
                        [class.sorted]="sortCol === ci" (click)="sortBy(ci)"
                        [title]="'Sort by ' + c">
                      <span class="th-inner">
                        <span class="th-text">{{ label(c) }}</span>
                        <span class="sort-ic"
                              [class.show]="sortCol === ci"
                              [class.desc]="sortCol === ci && sortDir === 'desc'">&#9650;</span>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let r of visibleRows; let ri = index">
                    <td class="rownum">{{ ri + 1 }}</td>
                    <td *ngFor="let cell of r; let ci = index" [ngClass]="typeClass(columnTypes[ci])">
                      <span *ngIf="isBool(cell); else notBool" class="bool-pill" [class.on]="boolVal(cell)">
                        <span class="bool-dot"></span>{{ boolVal(cell) ? 'True' : 'False' }}
                      </span>
                      <ng-template #notBool>
                        <span *ngIf="isEmpty(cell)" class="cell-null">&#8212;</span>
                        <span *ngIf="!isEmpty(cell)">{{ cell }}</span>
                      </ng-template>
                    </td>
                  </tr>
                  <tr *ngIf="visibleRows.length === 0">
                    <td [attr.colspan]="columns.length + 1" class="empty">{{ search ? 'No rows match' : 'No rows found' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </ng-container>
        </section>

        <!-- Child (nested) tables — one section per generated child table -->
        <section class="detail child-table" *ngFor="let ct of childTables">
          <div class="detail-head">
            <div>
              <h3>{{ label(ct.title) }} <span class="child-badge">child table</span></h3>
              <span class="detail-meta">{{ ct.rows.length }} rows · {{ ct.columns.length }} columns</span>
            </div>
          </div>

          <div class="type-chips">
            <span class="tchip" *ngFor="let c of ct.columns; let ci = index" [ngClass]="typeClass(ct.columnTypes[ci])">
              <span class="tdot">{{ typeGlyph(ct.columnTypes[ci]) }}</span>{{ label(c) }}
            </span>
          </div>

          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th class="rownum">#</th>
                  <th *ngFor="let c of ct.columns; let ci = index" [ngClass]="typeClass(ct.columnTypes[ci])">
                    <span class="th-inner"><span class="th-text">{{ label(c) }}</span></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let r of ct.rows; let ri = index">
                  <td class="rownum">{{ ri + 1 }}</td>
                  <td *ngFor="let cell of r; let ci = index" [ngClass]="typeClass(ct.columnTypes[ci])">
                    <span *ngIf="isBool(cell); else childNotBool" class="bool-pill" [class.on]="boolVal(cell)">
                      <span class="bool-dot"></span>{{ boolVal(cell) ? 'True' : 'False' }}
                    </span>
                    <ng-template #childNotBool>
                      <span *ngIf="isEmpty(cell)" class="cell-null">&#8212;</span>
                      <span *ngIf="!isEmpty(cell)">{{ cell }}</span>
                    </ng-template>
                  </td>
                </tr>
                <tr *ngIf="ct.rows.length === 0">
                  <td [attr.colspan]="ct.columns.length + 1" class="empty">No rows found</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .page { padding: 28px 32px; max-width: 1400px; margin: 0 auto; }

    .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 22px; }
    .crumbs { font-size: 12px; color: #94a3b8; font-weight: 500; margin-bottom: 6px; }
    .crumbs span { margin: 0 6px; color: #cbd5e1; }
    .crumbs b { color: #475569; }
    .head h1 { margin: 0 0 6px; font-size: 26px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    .sub { margin: 0; font-size: 14px; color: #64748b; }
    .sub b { color: #2563eb; }
    .head-actions { display: flex; gap: 10px; }
    .btn { display: inline-flex; align-items: center; gap: 7px; padding: 10px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid transparent; }
    .btn.ghost { background: white; border-color: #e2e8f0; color: #475569; }
    .btn.ghost:hover { border-color: #cbd5e1; color: #2563eb; }
    .btn.primary { background: #2563eb; color: white; }
    .btn.primary:hover { background: #1d4ed8; }
    .btn:disabled { opacity: 0.6; cursor: default; }
    .upload-error { display: flex; align-items: center; gap: 7px; margin: -8px 0 18px; font-size: 13px; color: #dc2626; font-weight: 500; }

    .ds-tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 22px; }
    .ds-tabs-label { font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: 0.5px; text-transform: uppercase; margin-right: 2px; }
    .ds-select { padding: 9px 13px; border: 1.5px solid #e2e8f0; border-radius: 10px; font-size: 13px; font-weight: 600; color: #334155; background: white; cursor: pointer; min-width: 280px; }
    .ds-select:hover { border-color: #93c5fd; }
    .ds-select:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
    .ds-tab { display: inline-flex; align-items: center; gap: 9px; padding: 9px 13px; background: white; border: 1.5px solid #e8ebf2; border-radius: 11px; cursor: pointer; font-size: 13px; font-weight: 600; color: #475569; transition: all 0.15s ease; }
    .ds-tab:hover { border-color: #93c5fd; background: #f8fbff; }
    .ds-tab.active { border-color: #2563eb; background: #eff6ff; color: #2563eb; }
    .ds-tab svg { color: #94a3b8; flex-shrink: 0; }
    .ds-tab.active svg { color: #2563eb; }
    .ds-tab-name { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ds-tab-count { flex-shrink: 0; font-size: 11px; font-weight: 700; background: #eef1f6; color: #64748b; padding: 2px 8px; border-radius: 20px; }
    .ds-tab.active .ds-tab-count { background: #dbeafe; color: #2563eb; }

    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .stat { background: white; border: 1px solid #e8ebf2; border-radius: 14px; padding: 16px 20px; display: flex; flex-direction: column; gap: 8px; }
    .stat-label { font-size: 12px; font-weight: 600; color: #94a3b8; }
    .stat-value { font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }

    .explorer { display: grid; grid-template-columns: 1fr; gap: 20px; }

    .tables-nav { background: white; border: 1px solid #e8ebf2; border-radius: 14px; padding: 14px; height: fit-content; }
    .nav-label { font-size: 10.5px; font-weight: 700; color: #94a3b8; letter-spacing: 0.5px; padding: 6px 8px 10px; }
    .tbl-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: none; border: none; border-radius: 9px; cursor: pointer; font-size: 13px; color: #475569; transition: all 0.15s ease; margin-bottom: 2px; overflow: hidden; }
    .tbl-item:hover { background: #f4f6fb; }
    .tbl-item.active { background: #eff6ff; color: #2563eb; }
    .tbl-ic { color: #94a3b8; display: flex; flex-shrink: 0; }
    .tbl-item.active .tbl-ic { color: #2563eb; }
    .tbl-name { flex: 1; min-width: 0; text-align: left; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tbl-count { flex-shrink: 0; font-size: 11px; font-weight: 700; background: #eef1f6; color: #64748b; padding: 2px 8px; border-radius: 20px; }
    .tbl-item.active .tbl-count { background: #dbeafe; color: #2563eb; }

    .detail { background: white; border: 1px solid #e8ebf2; border-radius: 14px; overflow: hidden; }
    .child-table { margin-top: 4px; }
    .child-badge { display: inline-block; margin-left: 8px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase; color: #7c3aed; background: #f3e8ff; padding: 2px 8px; border-radius: 20px; vertical-align: middle; }
    .page.fullscreen .child-table { display: none; }
    .detail-head { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px; border-bottom: 1px solid #eef1f6; }
    .detail-head h3 { margin: 0 0 3px; font-size: 16px; font-weight: 700; color: #0f172a; text-transform: capitalize; }
    .detail-meta { font-size: 12px; color: #94a3b8; }
    .detail-tools { display: flex; align-items: center; gap: 10px; }
    .detail-search { display: flex; align-items: center; gap: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 9px; padding: 8px 12px; width: 240px; }
    .detail-search input { border: none; background: none; outline: none; font-size: 13px; flex: 1; color: #334155; }
    .expand-btn { width: 36px; height: 36px; flex-shrink: 0; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 9px; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease; }
    .expand-btn:hover { border-color: #bfdbfe; color: #2563eb; background: #eff6ff; }

    /* full table view */
    .page.fullscreen { padding: 0; max-width: none; height: 100%; display: flex; flex-direction: column; }
    .page.fullscreen .explorer { grid-template-columns: 1fr; gap: 0; flex: 1; min-height: 0; }
    .page.fullscreen .detail { border: none; border-radius: 0; display: flex; flex-direction: column; min-height: 0; }
    .page.fullscreen .table-scroll { flex: 1; overflow: auto; min-height: 0; }

    .type-chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 14px 20px; border-bottom: 1px solid #f4f6fb; }
    .tchip { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 20px; background: #f1f5f9; color: #64748b; }
    .tdot { width: 15px; height: 15px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 800; }
    .tchip.num .tdot, .tchip.money .tdot { background: #dbeafe; color: #2563eb; }
    .tchip.text .tdot { background: #e2e8f0; color: #64748b; }
    .tchip.date .tdot { background: #dcfce7; color: #059669; }

    .table-scroll { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 11px 16px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1px solid #eef1f6; white-space: nowrap; background: #fcfdfe; position: sticky; top: 0; }
    td { padding: 12px 16px; font-size: 13px; color: #334155; border-bottom: 1px solid #f4f6fb; white-space: nowrap; }
    td.num, td.money { font-family: 'SF Mono', Monaco, monospace; color: #0f172a; }
    td.money { color: #059669; font-weight: 600; }
    td.date { color: #64748b; }
    th.num, td.num { text-align: right; }
    tbody tr:nth-child(even) { background: #fbfcfe; }
    tbody tr:hover { background: #eef4ff; }
    tbody tr:last-child td { border-bottom: none; }

    /* sortable headers */
    th.sortable { cursor: pointer; user-select: none; transition: background 0.12s, color 0.12s; }
    th.sortable:hover { color: #2563eb; background: #f4f7ff; }
    th.sorted { color: #2563eb; background: #f4f7ff; }
    .th-inner { display: inline-flex; align-items: center; gap: 5px; }
    .sort-ic { display: inline-block; font-size: 8px; line-height: 1; opacity: 0; color: #94a3b8; transition: opacity 0.12s, transform 0.12s; }
    th.sortable:hover .sort-ic { opacity: 0.45; }
    .sort-ic.show { opacity: 1; color: #2563eb; }
    .sort-ic.desc { transform: rotate(180deg); }

    /* boolean pills */
    .bool-pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 8px; border-radius: 20px; font-size: 11.5px; font-weight: 600; background: #f1f5f9; color: #64748b; }
    .bool-pill .bool-dot { width: 6px; height: 6px; border-radius: 50%; background: #94a3b8; }
    .bool-pill.on { background: #dcfce7; color: #059669; }
    .bool-pill.on .bool-dot { background: #10b981; }
    .cell-null { color: #cbd5e1; }
    .rownum { width: 44px; color: #cbd5e1; font-size: 12px; font-family: 'SF Mono', Monaco, monospace; text-align: right; }
    .empty { text-align: center; color: #94a3b8; padding: 30px; font-style: italic; }
    .del-btn { background: none; border: none; color: #cbd5e1; font-size: 12px; cursor: pointer; padding: 2px 5px; border-radius: 4px; flex-shrink: 0; line-height: 1; }
    .del-btn:hover { color: #ef4444; background: #fef2f2; }
    .tbl-item.active .del-btn { color: #93c5fd; }
    .tbl-item.active .del-btn:hover { color: #ef4444; background: #fef2f2; }
    .loading-rows { padding: 40px; text-align: center; color: #94a3b8; font-size: 14px; }
    .empty-state { text-align: center; padding: 60px 20px; color: #94a3b8; }
    .empty-state p { margin-top: 14px; font-size: 14px; }

    @media (max-width: 900px) {
      .stats { grid-template-columns: repeat(2, 1fr); }
      .explorer { grid-template-columns: 1fr; }
      .detail-search { width: 160px; }
    }
  `]
})
export class DataExplorerComponent implements OnInit, OnDestroy {
  datasets: Dataset[] = [];
  userId = environment.defaultUserId;
  selected = 0;
  search = '';
  loading = false;
  loadingRows = false;
  columns: string[] = [];
  columnTypes: string[] = [];
  rows: any[][] = [];
  visibleRows: any[][] = [];
  childTables: ChildTable[] = [];
  sortCol: number | null = null;
  sortDir: 'asc' | 'desc' = 'asc';
  uploading = false;
  uploadError = '';
  fullscreen = false;
  private sidebarWasCollapsed = false;
  private schemaSub?: Subscription;

  constructor(private http: HttpClient, private upload: UploadService, private layout: LayoutService, private router: Router, private active: ActiveDatasetService) {}

  goToBuilder(): void {
    this.router.navigate(['/builder']);
  }

  ngOnInit() {
    this.active.ensureLoaded().then(() => this.loadDatasets());
    // Re-scope the page whenever the globally-active dataset changes.
    this.schemaSub = this.active.activeKey$.subscribe(() => this.loadDatasets());
  }

  ngOnDestroy() {
    this.schemaSub?.unsubscribe();
    // Restore the sidebar if the user navigates away while in full table view.
    if (this.fullscreen) this.layout.setSidebarCollapsed(this.sidebarWasCollapsed);
  }

  /** Toggles the maximized full-table view, auto-collapsing the shell sidebar for maximum width. */
  toggleFullscreen() {
    this.fullscreen = !this.fullscreen;
    if (this.fullscreen) {
      this.sidebarWasCollapsed = this.layout.sidebarCollapsed();
      this.layout.setSidebarCollapsed(true);
    } else {
      this.layout.setSidebarCollapsed(this.sidebarWasCollapsed);
    }
  }

  loadDatasets() {
    this.loading = true;
    const prevId = this.datasets[this.selected]?.id;
    this.http.get<Dataset[]>(`${environment.apiUrl}/datasets`).subscribe({
      next: (data) => {
        // Show every uploaded dataset — one row per dataset family (its newest version). Older
        // versions of the same dataset are collapsed into that row to keep the list clean.
        const all = data || [];
        const seen = new Set<string>();
        const unique: Dataset[] = [];
        for (const d of all) {
          const key = this.active.familyKeyOf(d as any);
          if (!seen.has(key)) { seen.add(key); unique.push(d); }
        }
        this.datasets = unique;
        this.loading = false;
        if (this.datasets.length > 0) {
          // Keep the dataset the user was viewing; otherwise fall back to the active one, then the first.
          let idx = prevId ? this.datasets.findIndex((d) => d.id === prevId) : -1;
          if (idx < 0) idx = this.datasets.findIndex((d) => this.active.datasetMatchesActive(d as any));
          this.select(idx < 0 ? 0 : idx);
        } else {
          this.columns = []; this.columnTypes = []; this.rows = []; this.visibleRows = [];
        }
      },
      error: () => { this.loading = false; }
    });
  }

  /** User picked a dataset from the selector: show it, and make it the app's active dataset so the
   *  "Next: Dashboard Builder" step (and the rest of the app) continues with the same dataset. */
  chooseDataset(i: number): void {
    this.select(i);
    const d = this.datasets[i];
    if (d) this.active.setActiveKey(this.active.familyKeyOf(d as any));
  }

  /** Friendly dataset name, falling back to the table name when an upload has no filename. */
  dsName(d: Dataset | null): string {
    return d ? (d.original_filename || d.table_name || 'Untitled dataset') : '';
  }

  onUploadSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.handleUpload(file);
    input.value = ''; // reset so the same file can be re-selected
  }

  /** Uploads a file to the backend (same flow as the Home page) and refreshes the dataset list in place. */
  private async handleUpload(file: File): Promise<void> {
    this.uploadError = '';
    if (!/\.(json|csv|xlsx|xls)$/i.test(file.name)) {
      this.uploadError = 'Unsupported file. Please upload JSON, CSV, or Excel.';
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      this.uploadError = 'File is too large (max 25MB).';
      return;
    }
    this.uploading = true;
    try {
      await this.upload.parse(file);
      await this.active.refreshAfterUpload(file.name);
      this.loadDatasets();
    } catch (err: any) {
      this.uploadError = err?.message || 'Could not upload the file.';
    } finally {
      this.uploading = false;
    }
  }

  select(i: number) {
    this.selected = i;
    this.search = '';
    this.sortCol = null; this.sortDir = 'asc';
    this.columns = []; this.columnTypes = []; this.rows = []; this.visibleRows = []; this.childTables = [];
    const ds = this.datasets[i];
    if (!ds) return;
    this.loadingRows = true;
    // Fetch the whole dataset structure: the root table plus every generated child table (nested arrays).
    this.http.get<{ tables: TablePayload[] }>(
      `${environment.apiUrl}/datasets/${ds.id}/tables`
    ).subscribe({
      next: (data) => {
        const tables = data.tables || [];
        const root = tables.find(t => t.isRoot) || tables[0];
        if (root) {
          this.columns = root.columns || [];
          this.columnTypes = root.types || [];
          this.rows = (root.rows || []).map((row: any) => this.columns.map(col => row[col] ?? ''));
          this.visibleRows = this.rows;
        }
        this.childTables = tables
          .filter(t => t !== root)
          .map(t => ({
            title: t.title,
            tableName: t.tableName,
            columns: t.columns || [],
            columnTypes: t.types || [],
            rows: (t.rows || []).map((row: any) => (t.columns || []).map(col => row[col] ?? '')),
          }));
        this.loadingRows = false;
      },
      error: () => { this.loadingRows = false; }
    });
  }

  deleteDataset(i: number, event: MouseEvent) {
    event.stopPropagation();
    const ds = this.datasets[i];
    if (!ds) return;
    this.uploadError = '';
    this.http.delete(`${environment.apiUrl}/datasets/${ds.id}`).subscribe({
      next: () => {
        // Reload so the previously uploaded dataset (if any) becomes the current one.
        this.columns = []; this.columnTypes = []; this.rows = []; this.visibleRows = [];
        this.loadDatasets();
      },
      error: () => { this.uploadError = `Could not delete "${ds.original_filename}". Please try again.`; }
    });
  }

  onSearch(v: string) {
    this.search = v;
    this.applyView();
  }

  sortBy(ci: number) {
    if (this.sortCol === ci) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortCol = ci;
      this.sortDir = 'asc';
    }
    this.applyView();
  }

  /** Recomputes visibleRows from the loaded rows by applying the current search filter, then sort. Purely client-side. */
  private applyView() {
    const q = this.search.trim().toLowerCase();
    let out = !q ? this.rows.slice()
      : this.rows.filter(r => r.some((cell: any) => String(cell).toLowerCase().includes(q)));

    if (this.sortCol !== null) {
      const ci = this.sortCol;
      const dir = this.sortDir === 'asc' ? 1 : -1;
      const numeric = this.typeClass(this.columnTypes[ci]) === 'num';
      out = out.slice().sort((a, b) => {
        const av = a[ci], bv = b[ci];
        const ae = this.isEmpty(av), be = this.isEmpty(bv);
        if (ae && be) return 0;
        if (ae) return 1;   // empties always sink to the bottom
        if (be) return -1;
        const cmp = numeric
          ? Number(av) - Number(bv)
          : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
        return cmp * dir;
      });
    }
    this.visibleRows = out;
  }

  isEmpty(v: any): boolean { return v === null || v === undefined || String(v).trim() === ''; }

  isBool(v: any): boolean {
    if (typeof v === 'boolean') return true;
    const s = String(v).trim().toLowerCase();
    return s === 'true' || s === 'false';
  }

  boolVal(v: any): boolean {
    if (typeof v === 'boolean') return v;
    return String(v).trim().toLowerCase() === 'true';
  }

  get activeDataset(): Dataset | null { return this.datasets[this.selected] ?? null; }
  totalRows(): number { return this.datasets.reduce((a, d) => a + (d.row_count || 0), 0); }
  totalCols(): number { return this.datasets.reduce((a, d) => a + (d.column_count || 0), 0); }

  /** Turns a snake_case DB column name into a friendly Title Case label for display only. */
  label(col: string): string {
    if (!col) return '';
    return col.split('_').filter(w => w.length).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  typeClass(fieldType: string): string {
    if (!fieldType) return 'text';
    const t = fieldType.toLowerCase();
    if (t === 'numeric') return 'num';
    if (t === 'date' || t.startsWith('timestamp')) return 'date';
    return 'text';
  }

  typeGlyph(fieldType: string): string {
    if (!fieldType) return 'A';
    const t = fieldType.toLowerCase();
    if (t === 'numeric') return '#';
    if (t === 'date' || t.startsWith('timestamp')) return '◷';
    return 'A';
  }
}