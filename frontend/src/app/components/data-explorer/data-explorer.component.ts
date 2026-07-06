import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface Dataset {
  id: string;
  table_name: string;
  original_filename: string;
  row_count: number;
  column_count: number;
  status: string;
  created_at: string;
}

@Component({
  selector: 'app-data-explorer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <!-- Header -->
      <div class="head">
        <div>
          <div class="crumbs">Data <span>/</span> <b>Uploaded Datasets</b></div>
          <h1>Uploaded Data</h1>
          <p class="sub" *ngIf="loading">Loading datasets…</p>
          <p class="sub" *ngIf="!loading">{{ datasets.length }} dataset{{ datasets.length === 1 ? '' : 's' }} — user_123</p>
        </div>
        <div class="head-actions">
          <button class="btn primary" (click)="loadDatasets()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15"/></svg>
            Refresh
          </button>
        </div>
      </div>

      <!-- Stat cards -->
      <div class="stats">
        <div class="stat"><span class="stat-label">Datasets</span><span class="stat-value">{{ datasets.length }}</span></div>
        <div class="stat"><span class="stat-label">Total Rows</span><span class="stat-value">{{ totalRows() }}</span></div>
        <div class="stat"><span class="stat-label">Total Columns</span><span class="stat-value">{{ totalCols() }}</span></div>
        <div class="stat"><span class="stat-label">User</span><span class="stat-value" style="font-size:15px;letter-spacing:0">user_123</span></div>
      </div>

            <!-- Empty state -->
      <div class="empty-state" *ngIf="!loading && datasets.length === 0">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><path d="M3 3h18v18H3z"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
        <p>No datasets found. Upload a file from the Home page to get started.</p>
      </div>

      <!-- Explorer -->
      <div class="explorer" *ngIf="datasets.length > 0">
        <!-- Dataset list -->
        <aside class="tables-nav">
          <div class="nav-label">DATASETS</div>
          <button class="tbl-item" *ngFor="let d of datasets; let i = index"
                  [class.active]="i === selected" (click)="select(i)">
            <span class="tbl-ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></span>
            <span class="tbl-name">{{ d.original_filename }}</span>
            <span class="tbl-count">{{ d.row_count }}</span>
            <button class="del-btn" (click)="deleteDataset(i, $event)" title="Delete">&#10005;</button>
          </button>
        </aside>

        <!-- Table detail -->
        <section class="detail">
          <div class="loading-rows" *ngIf="loadingRows">Loading rows...</div>

          <ng-container *ngIf="!loadingRows && activeDataset">
            <div class="detail-head">
              <div>
                <h3>{{ activeDataset.original_filename }}</h3>
                <span class="detail-meta">{{ visibleRows.length }} of {{ activeDataset.row_count }} rows · {{ columns.length }} columns</span>
              </div>
              <div class="detail-search">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input [value]="search" (input)="onSearch($any($event.target).value)" placeholder="Search rows..." />
              </div>
            </div>

            <!-- column type chips -->
            <div class="type-chips">
              <span class="tchip" *ngFor="let c of columns; let ci = index" [ngClass]="typeClass(columnTypes[ci])">
                <span class="tdot">{{ typeGlyph(columnTypes[ci]) }}</span>{{ c }}
              </span>
            </div>

            <div class="table-scroll">
              <table>
                <thead>
                  <tr><th class="rownum">#</th><th *ngFor="let c of columns">{{ c }}</th></tr>
                </thead>
                <tbody>
                  <tr *ngFor="let r of visibleRows; let ri = index">
                    <td class="rownum">{{ ri + 1 }}</td>
                    <td *ngFor="let cell of r; let ci = index" [ngClass]="typeClass(columnTypes[ci])">{{ cell }}</td>
                  </tr>
                  <tr *ngIf="visibleRows.length === 0">
                    <td [attr.colspan]="columns.length + 1" class="empty">{{ search ? 'No rows match' : 'No rows found' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </ng-container>
        </section>
      </div>
    </div>
  `,
  styles: [`
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

    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .stat { background: white; border: 1px solid #e8ebf2; border-radius: 14px; padding: 16px 20px; display: flex; flex-direction: column; gap: 8px; }
    .stat-label { font-size: 12px; font-weight: 600; color: #94a3b8; }
    .stat-value { font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }

    .explorer { display: grid; grid-template-columns: 240px 1fr; gap: 20px; }

    .tables-nav { background: white; border: 1px solid #e8ebf2; border-radius: 14px; padding: 14px; height: fit-content; }
    .nav-label { font-size: 10.5px; font-weight: 700; color: #94a3b8; letter-spacing: 0.5px; padding: 6px 8px 10px; }
    .tbl-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: none; border: none; border-radius: 9px; cursor: pointer; font-size: 13px; color: #475569; transition: all 0.15s ease; margin-bottom: 2px; }
    .tbl-item:hover { background: #f4f6fb; }
    .tbl-item.active { background: #eff6ff; color: #2563eb; }
    .tbl-ic { color: #94a3b8; display: flex; }
    .tbl-item.active .tbl-ic { color: #2563eb; }
    .tbl-name { flex: 1; text-align: left; font-weight: 600; }
    .tbl-count { font-size: 11px; font-weight: 700; background: #eef1f6; color: #64748b; padding: 2px 8px; border-radius: 20px; }
    .tbl-item.active .tbl-count { background: #dbeafe; color: #2563eb; }

    .detail { background: white; border: 1px solid #e8ebf2; border-radius: 14px; overflow: hidden; }
    .detail-head { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px; border-bottom: 1px solid #eef1f6; }
    .detail-head h3 { margin: 0 0 3px; font-size: 16px; font-weight: 700; color: #0f172a; text-transform: capitalize; }
    .detail-meta { font-size: 12px; color: #94a3b8; }
    .detail-search { display: flex; align-items: center; gap: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 9px; padding: 8px 12px; width: 240px; }
    .detail-search input { border: none; background: none; outline: none; font-size: 13px; flex: 1; color: #334155; }

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
    tbody tr:hover { background: #f8faff; }
    tbody tr:last-child td { border-bottom: none; }
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
export class DataExplorerComponent implements OnInit {
  datasets: Dataset[] = [];
  selected = 0;
  search = '';
  loading = false;
  loadingRows = false;
  columns: string[] = [];
  columnTypes: string[] = [];
  rows: any[][] = [];
  visibleRows: any[][] = [];

  constructor(private http: HttpClient) {}

  ngOnInit() { this.loadDatasets(); }

  loadDatasets() {
    this.loading = true;
    this.http.get<Dataset[]>(`${environment.apiUrl}/datasets`).subscribe({
      next: (data) => {
        this.datasets = data || [];
        this.loading = false;
        if (this.datasets.length > 0) { this.select(0); }
      },
      error: () => { this.loading = false; }
    });
  }

  select(i: number) {
    this.selected = i;
    this.search = '';
    this.columns = []; this.columnTypes = []; this.rows = []; this.visibleRows = [];
    const ds = this.datasets[i];
    if (!ds) return;
    this.loadingRows = true;
    this.http.get<{ columns: string[], types: string[], rows: any[] }>(
      `${environment.apiUrl}/datasets/${ds.id}/rows`
    ).subscribe({
      next: (data) => {
        this.columns = data.columns || [];
        this.columnTypes = data.types || [];
        this.rows = (data.rows || []).map((row: any) =>
          this.columns.map(col => row[col] ?? '')
        );
        this.visibleRows = this.rows;
        this.loadingRows = false;
      },
      error: () => { this.loadingRows = false; }
    });
  }

  deleteDataset(i: number, event: MouseEvent) {
    event.stopPropagation();
    const ds = this.datasets[i];
    if (!ds) return;
    this.http.delete(`${environment.apiUrl}/datasets/${ds.id}`).subscribe({
      next: () => {
        this.datasets.splice(i, 1);
        if (this.datasets.length === 0) {
          this.columns = []; this.columnTypes = []; this.rows = []; this.visibleRows = [];
        } else {
          this.select(Math.min(this.selected, this.datasets.length - 1));
        }
      }
    });
  }

  onSearch(v: string) {
    this.search = v;
    const q = v.trim().toLowerCase();
    this.visibleRows = !q ? this.rows
      : this.rows.filter(r => r.some((cell: any) => String(cell).toLowerCase().includes(q)));
  }

  get activeDataset(): Dataset | null { return this.datasets[this.selected] ?? null; }
  totalRows(): number { return this.datasets.reduce((a, d) => a + (d.row_count || 0), 0); }
  totalCols(): number { return this.datasets.reduce((a, d) => a + (d.column_count || 0), 0); }

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