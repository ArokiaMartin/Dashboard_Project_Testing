import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { DashboardRecord, DashboardService } from '../../services/dashboard.service';

interface DashItem {
  id: string;
  name: string;
  desc: string;
  edited: string;
  views: number;
  thumb: string;
}

@Component({
  selector: 'app-dashboards',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <div class="head">
        <div>
          <h1>My Dashboards</h1>
          <p>Build, customize, and share interactive analytics dashboards.</p>
        </div>
        <button class="btn primary" routerLink="/builder">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create Dashboard
        </button>
      </div>

      <p class="state" *ngIf="loading">Loading dashboards from database...</p>
      <p class="state error" *ngIf="!loading && error">{{ error }}</p>
      <p class="state" *ngIf="!loading && !error && dashboards.length === 0">No dashboards saved yet.</p>

      <div class="grid" *ngIf="!loading && !error && dashboards.length > 0">
        <div class="dash" *ngFor="let d of dashboards" (click)="openDashboard(d)">
          <div class="thumb" [style.background]="d.thumb">
            <svg viewBox="0 0 200 96" class="thumb-svg" preserveAspectRatio="none">
              <rect x="16" y="52" width="16" height="36" rx="3" fill="rgba(255,255,255,.5)"/>
              <rect x="42" y="34" width="16" height="54" rx="3" fill="rgba(255,255,255,.75)"/>
              <rect x="68" y="44" width="16" height="44" rx="3" fill="rgba(255,255,255,.5)"/>
              <rect x="94" y="24" width="16" height="64" rx="3" fill="rgba(255,255,255,.9)"/>
              <rect x="120" y="40" width="16" height="48" rx="3" fill="rgba(255,255,255,.6)"/>
              <rect x="146" y="30" width="16" height="58" rx="3" fill="rgba(255,255,255,.75)"/>
            </svg>
          </div>
          <div class="dash-body">
            <h3>{{ d.name }}</h3>
            <p>{{ d.desc }}</p>
            <div class="meta">
              <span>Edited {{ d.edited }}</span>
              <span class="views">{{ d.views }} views</span>
            </div>
          </div>
          <div class="actions">
            <button class="a" (click)="openDashboard(d); $event.stopPropagation()">Edit</button>
            <button class="a ghost" (click)="$event.stopPropagation()">Share</button>
          </div>
        </div>
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

    .state { margin: 4px 0 18px; color: #64748b; font-size: 14px; }
    .state.error { color: #b91c1c; }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 22px; }
    .dash { background: white; border: 1px solid #e8ebf2; border-radius: 16px; overflow: hidden; cursor: pointer; transition: all 0.2s ease; }
    .dash:hover { box-shadow: 0 12px 30px rgba(15,23,42,0.1); transform: translateY(-3px); border-color: #dbe4f0; }
    .thumb { height: 120px; display: flex; align-items: flex-end; }
    .thumb-svg { width: 100%; height: 96px; }
    .dash-body { padding: 18px 18px 12px; }
    .dash-body h3 { margin: 0 0 5px; font-size: 15px; font-weight: 700; color: #0f172a; }
    .dash-body p { margin: 0 0 14px; font-size: 13px; color: #94a3b8; line-height: 1.5; }
    .meta { display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8; padding-top: 12px; border-top: 1px solid #f1f5f9; }
    .views { font-weight: 600; }
    .actions { display: flex; gap: 8px; padding: 0 18px 18px; }
    .a { flex: 1; padding: 9px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #2563eb; background: #2563eb; color: white; }
    .a:hover { background: #1d4ed8; }
    .a.ghost { background: white; color: #475569; border-color: #e2e8f0; }
    .a.ghost:hover { border-color: #cbd5e1; color: #2563eb; }
  `]
})
export class DashboardsComponent {
  dashboards: DashItem[] = [];
  loading = true;
  error = '';

  private readonly cardGradients = [
    'linear-gradient(135deg,#1e3a8a,#2563eb)',
    'linear-gradient(135deg,#1e293b,#334155)',
    'linear-gradient(135deg,#0f766e,#14b8a6)',
    'linear-gradient(135deg,#b45309,#f59e0b)',
    'linear-gradient(135deg,#065f46,#10b981)'
  ];

  constructor(private dashboardService: DashboardService, private router: Router) {
    this.loadDashboards();
  }

  private loadDashboards(): void {
    this.loading = true;
    this.error = '';

    this.dashboardService.listDashboardRecords('anonymous').subscribe({
      next: (records) => {
        this.dashboards = records.map((record, index) => this.mapRecordToCard(record, index));
        this.loading = false;
      },
      error: () => {
        this.error = 'Unable to load dashboards from database.';
        this.loading = false;
      }
    });
  }

  private mapRecordToCard(record: DashboardRecord, index: number): DashItem {
    return {
      id: record.dashboard_id,
      name: record.name,
      desc: record.description || 'Saved dashboard',
      edited: this.formatEdited(record.updated_at || record.created_at),
      views: record.widgets?.length || 0,
      thumb: this.cardGradients[index % this.cardGradients.length]
    };
  }

  openDashboard(item: DashItem): void {
    this.router.navigate(['/builder'], { queryParams: { dashboardId: item.id } });
  }

  private formatEdited(value: string): string {
    const updatedAt = new Date(value).getTime();
    if (!Number.isFinite(updatedAt)) {
      return 'recently';
    }

    const elapsedMs = Date.now() - updatedAt;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (elapsedMs < hour) {
      const mins = Math.max(1, Math.floor(elapsedMs / minute));
      return `${mins}m ago`;
    }

    if (elapsedMs < day) {
      return `${Math.floor(elapsedMs / hour)}h ago`;
    }

    const days = Math.floor(elapsedMs / day);
    if (days < 7) {
      return `${days}d ago`;
    }

    return `${Math.floor(days / 7)}w ago`;
  }
}
