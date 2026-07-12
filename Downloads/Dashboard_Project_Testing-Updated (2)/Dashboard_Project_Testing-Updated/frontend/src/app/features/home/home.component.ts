import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { DashboardService, DashboardRecord } from '@core/services/dashboard.service';
import { ActiveDatasetService } from '@core/services/active-dataset.service';
import { Subscription } from 'rxjs';

interface DashCard {
  id: string;
  name: string;
  edited: string;
  thumb: string;
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
          <p>Get started by uploading your data and schema. Once ingested, you can explore it and build dashboards.</p>
          <div class="welcome-actions">
            <button class="btn primary" routerLink="/upload-data">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload Data &amp; Schema
            </button>
            <button class="btn ghost" routerLink="/builder">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Create New Dashboard
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

      <!-- Recent Dashboards -->
      <div class="dash-block">
        <div class="block-head">
          <h3>My Recent Dashboards</h3>
          <a routerLink="/dashboards" class="link" *ngIf="dashboards.length">View All</a>
        </div>
        <div class="dash-grid" *ngIf="dashboards.length">
          <div class="dash-card" *ngFor="let d of dashboards" (click)="openDashboard(d)">
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
        <div class="dash-empty" *ngIf="dashLoaded && !dashboards.length">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          <p>No dashboards yet</p>
          <span>Upload your data first, then build a dashboard — it will appear here.</span>
          <button class="btn light" routerLink="/upload-data">Upload Data &amp; Schema</button>
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

    /* Recent dashboards */
    .dash-block { background: white; border: 1px solid #e8ebf2; border-radius: 16px; padding: 22px; }
    .block-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .block-head h3 { margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; }
    .link { color: #2563eb; font-size: 13px; font-weight: 600; text-decoration: none; }
    .link:hover { color: #1d4ed8; }

    .dash-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .dash-empty { border: 1.5px dashed #e2e8f0; border-radius: 12px; padding: 34px 20px; text-align: center; }
    .dash-empty svg { margin-bottom: 10px; }
    .dash-empty p { margin: 0 0 4px; font-size: 14px; font-weight: 700; color: #475569; }
    .dash-empty span { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 16px; }
    .dash-card { background: white; border: 1px solid #e8ebf2; border-radius: 12px; overflow: hidden; cursor: pointer; transition: all 0.2s ease; }
    .dash-card:hover { box-shadow: 0 10px 26px rgba(15,23,42,0.08); transform: translateY(-2px); border-color: #dbe4f0; }
    .thumb { height: 92px; display: flex; align-items: flex-end; padding: 0; }
    .thumb-svg { width: 100%; height: 70px; }
    .dash-info { padding: 12px 14px; }
    .dash-info h4 { margin: 0 0 4px; font-size: 13px; font-weight: 700; color: #0f172a; }
    .dash-edited { font-size: 12px; color: #94a3b8; display: flex; align-items: center; justify-content: space-between; }
    .dash-edited span { color: #cbd5e1; font-size: 16px; }

    @media (max-width: 900px) {
      .dash-grid { grid-template-columns: repeat(2, 1fr); }
      .welcome-art { display: none; }
    }
    @media (max-width: 560px) {
      .page { padding: 18px; }
      .dash-grid { grid-template-columns: 1fr; }
      .welcome-actions { flex-direction: column; align-items: stretch; }
    }
  `]
})
export class HomeComponent implements OnInit, OnDestroy {
  /** Recently edited dashboards for the active dataset (most recent first). */
  dashboards: DashCard[] = [];
  dashLoaded = false;
  private records: DashboardRecord[] = [];
  private activeSub?: Subscription;

  private readonly cardGradients = [
    'linear-gradient(135deg,#1e3a8a,#2563eb)',
    'linear-gradient(135deg,#1e293b,#334155)',
    'linear-gradient(135deg,#0f766e,#14b8a6)'
  ];

  constructor(
    private router: Router,
    private dashboardService: DashboardService,
    private active: ActiveDatasetService
  ) {}

  ngOnInit(): void {
    this.active.ensureLoaded().then(() => this.applyScope());
    this.loadRecentDashboards();
    // Re-scope whenever the globally-active dataset changes.
    this.activeSub = this.active.activeKey$.subscribe(() => this.applyScope());
  }

  ngOnDestroy(): void {
    this.activeSub?.unsubscribe();
  }

  private loadRecentDashboards(): void {
    this.dashboardService.listDashboardRecords('anonymous').subscribe({
      next: (records) => {
        this.records = records ?? [];
        this.applyScope();
        this.dashLoaded = true;
      },
      error: () => { this.dashLoaded = true; }
    });
  }

  /** Keeps only the active dataset's dashboards, newest first, capped at three cards. */
  private applyScope(): void {
    this.dashboards = [...this.records]
      .filter((r) => this.active.dashboardMatchesActive(r))
      .sort((a, b) => this.time(b.updated_at || b.created_at) - this.time(a.updated_at || a.created_at))
      .slice(0, 3)
      .map((r, i) => ({
        id: r.dashboard_id,
        name: r.name,
        edited: this.formatEdited(r.updated_at || r.created_at),
        thumb: this.cardGradients[i % this.cardGradients.length]
      }));
  }

  openDashboard(d: DashCard): void {
    this.router.navigate(['/builder'], { queryParams: { dashboardId: d.id } });
  }

  private time(v: string): number { const t = new Date(v).getTime(); return Number.isFinite(t) ? t : 0; }

  private formatEdited(value: string): string {
    const t = new Date(value).getTime();
    if (!Number.isFinite(t)) return 'recently';
    const ms = Date.now() - t, min = 60000, hr = 60 * min, day = 24 * hr;
    if (ms < hr) return `${Math.max(1, Math.floor(ms / min))}m ago`;
    if (ms < day) return `${Math.floor(ms / hr)}h ago`;
    return `${Math.floor(ms / day)}d ago`;
  }
}
