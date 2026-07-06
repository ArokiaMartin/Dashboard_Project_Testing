import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UploadService } from '../../services/upload.service';

interface DataTable {
  name: string;
  columns: string[];
  types: ('num' | 'text' | 'money' | 'date')[];
  rows: any[][];
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
          <div class="crumbs">Data <span>/</span> <b>Uploaded Report</b></div>
          <h1>Uploaded Data</h1>
          <p class="sub">Parsed from <b>{{ fileName }}</b> — {{ tables.length }} table{{ tables.length === 1 ? '' : 's' }} auto-detected</p>
        </div>
        <div class="head-actions">
          <button class="btn ghost">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>
          <button class="btn primary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload New
          </button>
        </div>
      </div>

      <!-- Stat cards -->
      <div class="stats">
        <div class="stat"><span class="stat-label">Tables</span><span class="stat-value">{{ tables.length }}</span></div>
        <div class="stat"><span class="stat-label">Total Rows</span><span class="stat-value">{{ totalRows() }}</span></div>
        <div class="stat"><span class="stat-label">Total Columns</span><span class="stat-value">{{ totalCols() }}</span></div>
        <div class="stat"><span class="stat-label">File Size</span><span class="stat-value">8.2 MB</span></div>
      </div>

      <!-- Explorer -->
      <div class="explorer">
        <!-- Table list -->
        <aside class="tables-nav">
          <div class="nav-label">TABLES</div>
          <button class="tbl-item" *ngFor="let t of tables; let i = index"
                  [class.active]="i === selected" (click)="select(i)">
            <span class="tbl-ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></span>
            <span class="tbl-name">{{ t.name }}</span>
            <span class="tbl-count">{{ t.rows.length }}</span>
          </button>
        </aside>

        <!-- Table detail -->
        <section class="detail">
          <div class="detail-head">
            <div>
              <h3>{{ active().name }}</h3>
              <span class="detail-meta">{{ visibleRows.length }} of {{ active().rows.length }} rows · {{ active().columns.length }} columns</span>
            </div>
            <div class="detail-search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input [value]="search" (input)="onSearch($any($event.target).value)" placeholder="Search rows…" />
            </div>
          </div>

          <!-- column type chips -->
          <div class="type-chips">
            <span class="tchip" *ngFor="let c of active().columns; let ci = index" [ngClass]="active().types[ci]">
              <span class="tdot">{{ typeGlyph(active().types[ci]) }}</span>{{ c }}
            </span>
          </div>

          <div class="table-scroll">
            <table>
              <thead>
                <tr><th class="rownum">#</th><th *ngFor="let c of active().columns">{{ c }}</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let r of visibleRows; let ri = index">
                  <td class="rownum">{{ ri + 1 }}</td>
                  <td *ngFor="let cell of r; let ci = index" [ngClass]="active().types[ci]">{{ cell }}</td>
                </tr>
                <tr *ngIf="visibleRows.length === 0">
                  <td [attr.colspan]="active().columns.length + 1" class="empty">No rows match “{{ search }}”</td>
                </tr>
              </tbody>
            </table>
          </div>
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

    @media (max-width: 900px) {
      .stats { grid-template-columns: repeat(2, 1fr); }
      .explorer { grid-template-columns: 1fr; }
      .detail-search { width: 160px; }
    }
  `]
})
export class DataExplorerComponent {
  selected = 0;
  search = '';

  tables: DataTable[] = [
    {
      name: 'summary',
      columns: ['blockers', 'severe', 'major', 'costUsd', 'generatedAt'],
      types: ['num', 'num', 'num', 'money', 'date'],
      rows: [[12, 34, 56, '$125,000', '2023-10-24']]
    },
    {
      name: 'findings',
      columns: ['id', 'title', 'severity', 'department', 'status'],
      types: ['text', 'text', 'text', 'text', 'text'],
      rows: [
        ['F-001', 'Login timeout under load', 'Critical', 'Engineering', 'Open'],
        ['F-002', 'Missing alt text on charts', 'Major', 'Design', 'Open'],
        ['F-003', 'Slow query on reports', 'Severe', 'Engineering', 'In Review'],
        ['F-004', 'Expired TLS certificate', 'Critical', 'IT', 'Resolved'],
        ['F-005', 'Incorrect tax rounding', 'Major', 'Finance', 'Open'],
        ['F-006', 'Broken export to CSV', 'Severe', 'Engineering', 'Open'],
        ['F-007', 'Session not invalidated', 'Critical', 'Security', 'In Review'],
        ['F-008', 'Chart legend overlap', 'Minor', 'Design', 'Resolved']
      ]
    },
    {
      name: 'plan',
      columns: ['phase', 'owner', 'dueDate', 'progress'],
      types: ['text', 'text', 'date', 'text'],
      rows: [
        ['Discovery', 'A. Sterling', '2023-11-01', '100%'],
        ['Remediation', 'J. Lee', '2023-11-20', '60%'],
        ['Verification', 'M. Ortiz', '2023-12-05', '10%'],
        ['Sign-off', 'A. Sterling', '2023-12-15', '0%']
      ]
    },
    {
      name: 'cost',
      columns: ['item', 'category', 'amountUsd'],
      types: ['text', 'text', 'money'],
      rows: [
        ['External audit', 'Services', '$45,000'],
        ['Tooling licenses', 'Software', '$28,500'],
        ['Engineering hours', 'Labor', '$51,500'],
        ['Training', 'Services', '$8,200'],
        ['Contingency', 'Reserve', '$12,000']
      ]
    },
    {
      name: 'metadata',
      columns: ['key', 'value'],
      types: ['text', 'text'],
      rows: [
        ['reportVersion', '2.4.1'],
        ['source', 'Hyland Compliance Scan'],
        ['region', 'EMEA'],
        ['recordCount', '1,284'],
        ['scanDurationMs', '48,210'],
        ['analyst', 'Alexander S.']
      ]
    }
  ];

  visibleRows: any[][] = [];
  fileName = 'sample_report.json';

  constructor(private upload: UploadService) {
    if (this.upload.hasData) {
      this.tables = this.upload.tables as DataTable[];
      this.fileName = this.upload.fileName;
    }
    this.refresh();
  }

  active(): DataTable { return this.tables[this.selected]; }
  select(i: number) { this.selected = i; this.search = ''; this.refresh(); }
  onSearch(v: string) { this.search = v; this.refresh(); }
  totalRows(): number { return this.tables.reduce((a, t) => a + t.rows.length, 0); }
  totalCols(): number { return this.tables.reduce((a, t) => a + t.columns.length, 0); }
  typeGlyph(t: string): string { return t === 'money' ? '$' : t === 'num' ? '#' : t === 'date' ? '◷' : 'A'; }

  private refresh() {
    const q = this.search.trim().toLowerCase();
    this.visibleRows = !q ? this.active().rows
      : this.active().rows.filter(r => r.some(cell => String(cell).toLowerCase().includes(q)));
  }
}
