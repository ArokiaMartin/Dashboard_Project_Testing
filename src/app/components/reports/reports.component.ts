import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Report {
  name: string;
  uploaded: string;
  status: 'Processed' | 'Analyzing' | 'Failed';
  records: number;
  size: string;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <div class="head">
        <div>
          <h1>Reports &amp; Data Sources</h1>
          <p>Manage every uploaded dataset and monitor processing status.</p>
        </div>
        <button class="btn primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Upload Report
        </button>
      </div>

      <div class="stat-row">
        <div class="stat" *ngFor="let s of stats">
          <span class="stat-label">{{ s.label }}</span>
          <span class="stat-value">{{ s.value }}</span>
        </div>
      </div>

      <div class="card">
        <div class="filters">
          <div class="search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Search reports…" />
          </div>
          <div class="chips">
            <button class="chip active">All</button>
            <button class="chip">Processed</button>
            <button class="chip">Analyzing</button>
            <button class="chip">Failed</button>
          </div>
        </div>

        <table class="tbl">
          <thead>
            <tr><th>Report Name</th><th>Uploaded</th><th>Size</th><th>Records</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of reports">
              <td>
                <div class="fcell">
                  <span class="fic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
                  {{ r.name }}
                </div>
              </td>
              <td class="muted">{{ r.uploaded }}</td>
              <td class="muted">{{ r.size }}</td>
              <td class="mono">{{ r.records ? (r.records | number) : '—' }}</td>
              <td>
                <span class="stat-badge" [ngClass]="r.status.toLowerCase()">
                  <span class="bdot"></span>{{ r.status }}
                </span>
              </td>
              <td><button class="row-btn">View</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 28px 32px; max-width: 1300px; margin: 0 auto; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
    .head h1 { margin: 0 0 6px; font-size: 26px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    .head p { margin: 0; font-size: 14px; color: #64748b; }
    .btn { display: inline-flex; align-items: center; gap: 8px; padding: 11px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; }
    .btn.primary { background: #2563eb; color: white; }
    .btn.primary:hover { background: #1d4ed8; }

    .stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .stat { background: white; border: 1px solid #e8ebf2; border-radius: 14px; padding: 18px 20px; display: flex; flex-direction: column; gap: 8px; }
    .stat-label { font-size: 12px; font-weight: 600; color: #94a3b8; }
    .stat-value { font-size: 26px; font-weight: 800; color: #0f172a; }

    .card { background: white; border: 1px solid #e8ebf2; border-radius: 16px; padding: 22px; }
    .filters { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; gap: 16px; }
    .search { display: flex; align-items: center; gap: 9px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 9px 13px; width: 280px; }
    .search input { border: none; background: none; outline: none; font-size: 13px; flex: 1; color: #334155; }
    .chips { display: flex; gap: 8px; }
    .chip { border: 1px solid #e2e8f0; background: white; color: #64748b; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .chip:hover { border-color: #cbd5e1; }
    .chip.active { background: #2563eb; color: white; border-color: #2563eb; }

    .tbl { width: 100%; border-collapse: collapse; }
    .tbl th { text-align: left; padding: 11px 12px; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid #eef1f6; }
    .tbl td { padding: 14px 12px; font-size: 13px; color: #334155; border-bottom: 1px solid #f4f6fb; }
    .tbl tbody tr:hover { background: #f8faff; }
    .fcell { display: flex; align-items: center; gap: 10px; font-weight: 500; color: #0f172a; }
    .fic { width: 28px; height: 28px; background: #eff6ff; border-radius: 7px; display: flex; align-items: center; justify-content: center; }
    .muted { color: #94a3b8; }
    .mono { font-family: 'SF Mono', Monaco, monospace; font-size: 12px; color: #475569; }
    .stat-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; }
    .bdot { width: 7px; height: 7px; border-radius: 50%; }
    .stat-badge.processed { color: #059669; } .stat-badge.processed .bdot { background: #10b981; }
    .stat-badge.analyzing { color: #d97706; } .stat-badge.analyzing .bdot { background: #f59e0b; }
    .stat-badge.failed { color: #dc2626; } .stat-badge.failed .bdot { background: #ef4444; }
    .row-btn { background: white; border: 1px solid #e2e8f0; color: #2563eb; padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; }
    .row-btn:hover { background: #eff6ff; border-color: #bfdbfe; }

    @media (max-width: 900px) { .stat-row { grid-template-columns: repeat(2,1fr); } .filters { flex-direction: column; align-items: stretch; } }
  `]
})
export class ReportsComponent {
  stats = [
    { label: 'Total Reports', value: '47' },
    { label: 'Processed', value: '41' },
    { label: 'Analyzing', value: '4' },
    { label: 'Failed', value: '2' }
  ];

  reports: Report[] = [
    { name: 'Q3_Revenue_Forecast.json', uploaded: 'Oct 24, 2023', status: 'Processed', records: 12450, size: '8.2 MB' },
    { name: 'Global_Supply_Chain.json', uploaded: 'Oct 22, 2023', status: 'Processed', records: 84921, size: '45.6 MB' },
    { name: 'Customer_Churn_Data.json', uploaded: 'Oct 20, 2023', status: 'Analyzing', records: 5342, size: '12.4 MB' },
    { name: 'Inventory_Levels.json', uploaded: 'Oct 18, 2023', status: 'Processed', records: 23891, size: '18.7 MB' },
    { name: 'Sales_Transactions.json', uploaded: 'Oct 15, 2023', status: 'Failed', records: 0, size: '156.3 MB' },
    { name: 'Employee_Performance.json', uploaded: 'Oct 12, 2023', status: 'Processed', records: 4521, size: '6.1 MB' }
  ];
}
