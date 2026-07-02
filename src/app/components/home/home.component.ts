import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

interface DashCard {
  name: string;
  edited: string;
  thumb: string;
}

interface Report {
  name: string;
  date: string;
  status: 'Processed' | 'Analyzing';
  records: number;
  locked?: boolean;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <!-- Welcome banner -->
      <div class="welcome">
        <div class="welcome-text">
          <h1>Welcome, Alexander</h1>
          <p>Unlock deep insights with the Dynamic Dashboard Builder. Your data is ready for exploration—start by uploading a new report or pick up where you left off.</p>
          <div class="welcome-actions">
            <button class="btn primary" routerLink="/builder">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Create New Dashboard
            </button>
            <button class="btn ghost">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>
              Watch Tutorial
            </button>
          </div>
        </div>
        <svg class="welcome-art" viewBox="0 0 220 140" fill="none">
          <path d="M20 110 Q60 60 100 80 T200 30" stroke="#c7d7f5" stroke-width="3" fill="none"/>
          <circle cx="100" cy="80" r="5" fill="#93b4f0"/>
          <circle cx="200" cy="30" r="5" fill="#93b4f0"/>
          <path d="M165 20 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" fill="#dbe6fb"/>
          <path d="M40 40 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#e6eefc"/>
        </svg>
      </div>

      <!-- Upload + Dashboards -->
      <div class="mid-grid">
        <div class="card upload-card">
          <div class="card-head">
            <h3>Upload Report</h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div class="drop" [class.over]="over" (dragover)="onOver($event)" (dragleave)="over=false" (drop)="onDrop($event)">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.6"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <p class="drop-title">Drag &amp; drop JSON data here</p>
            <p class="drop-sub">Maximum file size: 25MB</p>
            <button class="btn light">Browse Files</button>
          </div>
          <div class="upload-foot">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            Supports standardized Hyland JSON exports.
          </div>
        </div>

        <div class="dash-block">
          <div class="block-head">
            <h3>My Dashboards</h3>
            <a routerLink="/dashboards" class="link">View All</a>
          </div>
          <div class="dash-grid">
            <div class="dash-card" *ngFor="let d of dashboards" routerLink="/preview">
              <div class="thumb" [style.background]="d.thumb">
                <svg viewBox="0 0 120 70" class="thumb-svg" preserveAspectRatio="none">
                  <rect x="12" y="40" width="10" height="22" rx="2" fill="rgba(255,255,255,.55)"/>
                  <rect x="28" y="28" width="10" height="34" rx="2" fill="rgba(255,255,255,.75)"/>
                  <rect x="44" y="34" width="10" height="28" rx="2" fill="rgba(255,255,255,.55)"/>
                  <rect x="60" y="20" width="10" height="42" rx="2" fill="rgba(255,255,255,.85)"/>
                  <rect x="76" y="30" width="10" height="32" rx="2" fill="rgba(255,255,255,.6)"/>
                  <rect x="92" y="24" width="10" height="38" rx="2" fill="rgba(255,255,255,.7)"/>
                </svg>
              </div>
              <div class="dash-info">
                <h4>{{ d.name }}</h4>
                <div class="dash-edited">Last edited {{ d.edited }} <span>›</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Reports -->
      <div class="card reports-card">
        <div class="reports-head">
          <div>
            <h3>Recent Reports</h3>
            <p>Manage and analyze your latest data imports.</p>
          </div>
          <div class="head-tools">
            <button class="tool"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg></button>
            <button class="tool"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg></button>
          </div>
        </div>

        <table class="tbl">
          <thead>
            <tr><th>Report Name</th><th>Date Uploaded</th><th>Status</th><th>Records</th><th>Action</th></tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of reports">
              <td>
                <div class="fcell">
                  <span class="fic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
                  {{ r.name }}
                </div>
              </td>
              <td class="muted">{{ r.date }}</td>
              <td>
                <span class="stat" [class.proc]="r.status==='Processed'" [class.analy]="r.status==='Analyzing'">
                  <span class="sdot"></span>{{ r.status }}
                </span>
              </td>
              <td>{{ r.records ? (r.records | number) : 'Pending' }}</td>
              <td>
                <span class="open" [class.locked]="r.locked">
                  Open
                  <svg *ngIf="!r.locked" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  <svg *ngIf="r.locked" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="tbl-foot">
          <span>Showing 3 of 12 reports</span>
          <div class="pager">
            <button disabled>Previous</button>
            <button>Next</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 28px 32px; max-width: 1200px; margin: 0 auto; }

    /* Welcome */
    .welcome {
      background: white; border: 1px solid #e8ebf2; border-radius: 16px;
      padding: 34px 36px; margin-bottom: 22px; position: relative; overflow: hidden;
      display: flex; justify-content: space-between; align-items: center;
    }
    .welcome-text { max-width: 560px; z-index: 2; }
    .welcome h1 { margin: 0 0 10px; font-size: 30px; font-weight: 800; color: #0f172a; letter-spacing: -0.6px; }
    .welcome p { margin: 0 0 22px; font-size: 14px; color: #64748b; line-height: 1.6; }
    .welcome-actions { display: flex; gap: 12px; }
    .welcome-art { width: 220px; height: 140px; flex-shrink: 0; opacity: 0.9; }

    .btn { display: inline-flex; align-items: center; gap: 8px; padding: 11px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: all 0.18s ease; }
    .btn.primary { background: #2563eb; color: white; }
    .btn.primary:hover { background: #1d4ed8; }
    .btn.ghost { background: white; border-color: #e2e8f0; color: #334155; }
    .btn.ghost:hover { border-color: #cbd5e1; }
    .btn.light { background: #f1f5f9; color: #334155; padding: 9px 18px; font-size: 13px; }
    .btn.light:hover { background: #e2e8f0; }

    /* Mid grid */
    .mid-grid { display: grid; grid-template-columns: 340px 1fr; gap: 22px; margin-bottom: 22px; }
    .card { background: white; border: 1px solid #e8ebf2; border-radius: 16px; padding: 22px; }
    .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .card-head h3 { margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; }

    .drop { border: 1.5px dashed #cbd5e1; border-radius: 12px; padding: 28px 18px; text-align: center; transition: all 0.2s ease; }
    .drop.over { border-color: #2563eb; background: #f0f6ff; }
    .drop svg { margin-bottom: 12px; }
    .drop-title { margin: 0 0 3px; font-size: 14px; font-weight: 600; color: #334155; }
    .drop-sub { margin: 0 0 14px; font-size: 12px; color: #94a3b8; }
    .upload-foot { display: flex; align-items: center; gap: 7px; margin-top: 16px; font-size: 12px; color: #94a3b8; }

    .block-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .block-head h3 { margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; }
    .link { color: #2563eb; font-size: 13px; font-weight: 600; text-decoration: none; }
    .link:hover { color: #1d4ed8; }

    .dash-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .dash-card { background: white; border: 1px solid #e8ebf2; border-radius: 12px; overflow: hidden; cursor: pointer; transition: all 0.2s ease; }
    .dash-card:hover { box-shadow: 0 10px 26px rgba(15,23,42,0.08); transform: translateY(-2px); border-color: #dbe4f0; }
    .thumb { height: 92px; display: flex; align-items: flex-end; padding: 0; }
    .thumb-svg { width: 100%; height: 70px; }
    .dash-info { padding: 12px 14px; }
    .dash-info h4 { margin: 0 0 4px; font-size: 13px; font-weight: 700; color: #0f172a; }
    .dash-edited { font-size: 12px; color: #94a3b8; display: flex; align-items: center; justify-content: space-between; }
    .dash-edited span { color: #cbd5e1; font-size: 16px; }

    /* Reports */
    .reports-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
    .reports-head h3 { margin: 0 0 3px; font-size: 16px; font-weight: 700; color: #0f172a; }
    .reports-head p { margin: 0; font-size: 13px; color: #94a3b8; }
    .head-tools { display: flex; gap: 8px; }
    .tool { width: 34px; height: 34px; border: 1px solid #e2e8f0; background: white; border-radius: 9px; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .tool:hover { border-color: #cbd5e1; color: #2563eb; }

    .tbl { width: 100%; border-collapse: collapse; }
    .tbl th { text-align: left; padding: 11px 12px; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid #eef1f6; }
    .tbl td { padding: 14px 12px; font-size: 13px; color: #334155; border-bottom: 1px solid #f4f6fb; }
    .tbl tbody tr:hover { background: #f8faff; }
    .fcell { display: flex; align-items: center; gap: 10px; font-weight: 500; color: #0f172a; }
    .fic { width: 28px; height: 28px; background: #eff6ff; border-radius: 7px; display: flex; align-items: center; justify-content: center; }
    .muted { color: #94a3b8; }
    .stat { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; }
    .sdot { width: 7px; height: 7px; border-radius: 50%; }
    .stat.proc { color: #059669; } .stat.proc .sdot { background: #10b981; }
    .stat.analy { color: #64748b; background: #f1f5f9; padding: 4px 9px; border-radius: 20px; } .stat.analy .sdot { background: #94a3b8; }
    .open { display: inline-flex; align-items: center; gap: 5px; color: #2563eb; font-size: 13px; font-weight: 600; cursor: pointer; }
    .open.locked { color: #cbd5e1; cursor: not-allowed; }
    .open:not(.locked):hover { color: #1d4ed8; }

    .tbl-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; font-size: 13px; color: #94a3b8; }
    .pager { display: flex; gap: 8px; }
    .pager button { border: 1px solid #e2e8f0; background: white; color: #475569; padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; }
    .pager button:hover:not(:disabled) { border-color: #cbd5e1; color: #2563eb; }
    .pager button:disabled { color: #cbd5e1; cursor: not-allowed; }

    @media (max-width: 900px) {
      .mid-grid { grid-template-columns: 1fr; }
      .dash-grid { grid-template-columns: repeat(3, 1fr); }
      .welcome-art { display: none; }
    }
    @media (max-width: 560px) {
      .page { padding: 18px; }
      .dash-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class HomeComponent {
  over = false;

  dashboards: DashCard[] = [
    { name: 'Accessibility', edited: '2h ago', thumb: 'linear-gradient(135deg,#8ea2c9,#aab8d6)' },
    { name: 'Sales Performance', edited: '1d ago', thumb: 'linear-gradient(135deg,#1e293b,#334155)' },
    { name: 'Inventory Audit', edited: '3d ago', thumb: 'linear-gradient(135deg,#1e3a8a,#2563eb)' }
  ];

  reports: Report[] = [
    { name: 'Q3_Revenue_Forecast.json', date: 'Oct 24, 2023', status: 'Processed', records: 12450 },
    { name: 'Global_Supply_Chain_Logs.json', date: 'Oct 22, 2023', status: 'Processed', records: 84921 },
    { name: 'Customer_Churn_October.json', date: 'Oct 20, 2023', status: 'Analyzing', records: 0, locked: true }
  ];

  onOver(e: DragEvent) { e.preventDefault(); this.over = true; }
  onDrop(e: DragEvent) { e.preventDefault(); this.over = false; }
}
