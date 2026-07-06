import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Saved {
  name: string;
  dataset: string;
  created: string;
  starred: boolean;
}

@Component({
  selector: 'app-saved-reports',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <div class="head">
        <div>
          <h1>Saved Reports</h1>
          <p>Your bookmarked and frequently accessed analyses.</p>
        </div>
        <div class="search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input placeholder="Search saved reports…" />
        </div>
      </div>

      <div class="card">
        <table class="tbl">
          <thead>
            <tr><th style="width:48px"></th><th>Report Name</th><th>Dataset</th><th>Created</th><th></th></tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of reports">
              <td>
                <button class="star" [class.on]="r.starred" (click)="r.starred = !r.starred">
                  <svg width="17" height="17" viewBox="0 0 24 24" [attr.fill]="r.starred ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 10.26 24 10.27 17.18 16.7 20.09 24.96 12 18.54 3.91 24.96 6.82 16.7 0 10.27 8.91 10.26 12 2"/></svg>
                </button>
              </td>
              <td>
                <div class="fcell">
                  <span class="fic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
                  {{ r.name }}
                </div>
              </td>
              <td class="muted">{{ r.dataset }}</td>
              <td class="muted">{{ r.created }}</td>
              <td>
                <div class="row-actions">
                  <button class="row-btn">Open</button>
                  <button class="row-btn danger">Delete</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 28px 32px; max-width: 1200px; margin: 0 auto; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
    .head h1 { margin: 0 0 6px; font-size: 26px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    .head p { margin: 0; font-size: 14px; color: #64748b; }
    .search { display: flex; align-items: center; gap: 9px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 9px 13px; width: 260px; }
    .search input { border: none; background: none; outline: none; font-size: 13px; flex: 1; color: #334155; }

    .card { background: white; border: 1px solid #e8ebf2; border-radius: 16px; padding: 10px 22px 14px; }
    .tbl { width: 100%; border-collapse: collapse; }
    .tbl th { text-align: left; padding: 14px 12px; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid #eef1f6; }
    .tbl td { padding: 14px 12px; font-size: 13px; color: #334155; border-bottom: 1px solid #f4f6fb; }
    .tbl tbody tr:hover { background: #f8faff; }
    .tbl tbody tr:last-child td { border-bottom: none; }
    .star { background: none; border: none; cursor: pointer; color: #cbd5e1; padding: 4px; display: flex; }
    .star:hover { color: #f59e0b; }
    .star.on { color: #f59e0b; }
    .fcell { display: flex; align-items: center; gap: 10px; font-weight: 500; color: #0f172a; }
    .fic { width: 28px; height: 28px; background: #eff6ff; border-radius: 7px; display: flex; align-items: center; justify-content: center; }
    .muted { color: #94a3b8; }
    .row-actions { display: flex; gap: 8px; }
    .row-btn { background: white; border: 1px solid #e2e8f0; color: #2563eb; padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; }
    .row-btn:hover { background: #eff6ff; border-color: #bfdbfe; }
    .row-btn.danger { color: #dc2626; }
    .row-btn.danger:hover { background: #fef2f2; border-color: #fca5a5; }
  `]
})
export class SavedReportsComponent {
  reports: Saved[] = [
    { name: 'Q3 Revenue Analysis', dataset: 'Q3_Revenue_Forecast.json', created: 'Oct 24, 2023', starred: true },
    { name: 'Supply Chain Overview', dataset: 'Global_Supply_Chain_Logs.json', created: 'Oct 22, 2023', starred: true },
    { name: 'Customer Churn Prediction', dataset: 'Customer_Churn_October.json', created: 'Oct 20, 2023', starred: false },
    { name: 'Inventory Distribution', dataset: 'Inventory_Levels.json', created: 'Oct 18, 2023', starred: false },
    { name: 'Employee Performance', dataset: 'Employee_Performance.json', created: 'Oct 15, 2023', starred: true }
  ];
}
