import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription, interval, startWith, switchMap } from 'rxjs';
import { LiveSourceService, LiveSourceSummary, LiveStateKind } from '@core/services/live-source.service';

/**
 * `/live-sources` — the list of live sources. The State column is the point of the page: a stalled feed
 * renders as a flat line elsewhere and reads as "business is quiet"; the pill is the only thing that
 * distinguishes a dead pipe from a genuinely idle one.
 */
@Component({
  selector: 'app-live-source-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="ls-container">
      <header class="ls-header">
        <div>
          <h2>Live Sources</h2>
          <p class="ls-sub">Real-time feeds that append events continuously and refresh dashboards in place.</p>
        </div>
        <a class="btn-primary" routerLink="/live-sources/new" *ngIf="sources.length > 0">+ Connect a live source</a>
      </header>

      <div class="ls-loading" *ngIf="loading">Loading live sources…</div>

      <div class="error-message" *ngIf="error">{{ error }}</div>

      <!-- Empty state -->
      <div class="ls-empty" *ngIf="!loading && !error && sources.length === 0">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.4">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
        <h3>No live sources yet</h3>
        <p>
          A live source is a continuously-appended stream — orders, sensor readings, events — stored in the
          same database as your uploads and charted through the same builder, refreshed on an interval.
        </p>
        <a class="btn-primary" routerLink="/live-sources/new">Connect a live source</a>
      </div>

      <table class="ls-table" *ngIf="!loading && sources.length > 0">
        <thead>
          <tr>
            <th>Name</th>
            <th>State</th>
            <th>Last event</th>
            <th class="num">Events/min</th>
            <th class="num">Rows</th>
            <th>Bucket</th>
            <th>Window</th>
            <th>Retention</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let s of sources" [routerLink]="['/live-sources', s.id]" class="ls-row">
            <td class="ls-name">{{ s.name }}</td>
            <td><span class="pill" [ngClass]="pillClass(s.state)">{{ stateLabel(s.state) }}</span></td>
            <td>{{ lastEvent(s.lastEventAt) }}</td>
            <td class="num">{{ s.eventsPerMinute | number }}</td>
            <td class="num">{{ s.rows | number }}</td>
            <td>{{ bucketLabel(s.bucket) }}</td>
            <td>{{ windowLabel(s.windowMinutes) }}</td>
            <td>{{ s.retentionDays == null ? 'Forever' : s.retentionDays + 'd' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .ls-container { padding: 26px 30px; max-width: 1180px; margin: 0 auto; }
    .ls-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
    .ls-header h2 { margin: 0 0 4px; font-size: 1.5rem; }
    .ls-sub { margin: 0; color: var(--text-secondary, #64748b); font-size: 0.9rem; }
    .ls-loading { color: var(--text-secondary, #64748b); padding: 30px 0; }

    .ls-empty { text-align: center; padding: 60px 20px; border: 1px dashed var(--border-color, #e2e8f0); border-radius: 14px; }
    .ls-empty h3 { margin: 14px 0 6px; }
    .ls-empty p { color: var(--text-secondary, #64748b); max-width: 520px; margin: 0 auto 20px; line-height: 1.5; }

    .ls-table { width: 100%; border-collapse: collapse; background: var(--bg-surface, #fff);
      border: 1px solid var(--border-color, #e8ebf2); border-radius: 12px; overflow: hidden; }
    .ls-table th, .ls-table td { text-align: left; padding: 12px 14px; font-size: 0.88rem;
      border-bottom: 1px solid var(--border-color, #eef1f6); }
    .ls-table th { background: var(--bg-subtle, #f8fafc); color: var(--text-secondary, #64748b); font-weight: 600; }
    .ls-table th.num, .ls-table td.num { text-align: right; }
    .ls-row { cursor: pointer; transition: background 0.15s; }
    .ls-row:hover { background: var(--bg-subtle, #f6f9ff); }
    .ls-name { font-weight: 600; }

    .pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.74rem; font-weight: 700; letter-spacing: 0.02em; }
    .pill-live { background: #dcfce7; color: #15803d; }
    .pill-slow { background: #fef3c7; color: #b45309; }
    .pill-stalled { background: #fee2e2; color: #b91c1c; }
    .pill-never { background: #eef2f7; color: #64748b; }

    .btn-primary { background: var(--accent-primary, #2563eb); color: #fff; border: none; padding: 9px 16px;
      border-radius: 8px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; white-space: nowrap; }
    .btn-primary:hover { filter: brightness(1.05); }
    .error-message { color: #b91c1c; background: #fee2e2; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; }
  `]
})
export class LiveSourceListComponent implements OnInit, OnDestroy {
  sources: LiveSourceSummary[] = [];
  loading = true;
  error = '';
  private sub?: Subscription;

  constructor(private liveSources: LiveSourceService) {}

  ngOnInit(): void {
    // Poll every 10s so state pills reflect liveness without a manual refresh.
    this.sub = interval(10_000)
      .pipe(startWith(0), switchMap(() => this.liveSources.list()))
      .subscribe({
        next: (rows) => { this.sources = rows ?? []; this.loading = false; this.error = ''; },
        error: () => { this.loading = false; this.error = 'Could not load live sources. Is the backend running?'; }
      });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  pillClass(state: LiveStateKind): string {
    switch (state) {
      case 'LIVE': return 'pill-live';
      case 'SLOW': return 'pill-slow';
      case 'STALLED': return 'pill-stalled';
      default: return 'pill-never';
    }
  }

  stateLabel(state: LiveStateKind): string {
    return state === 'NEVER_CONNECTED' ? 'NEVER CONNECTED' : state;
  }

  bucketLabel(bucket: string): string {
    const map: Record<string, string> = {
      second: '1s', minute: '1min', five_minute: '5min', hour: '1hr', day: '1day'
    };
    return map[bucket] ?? bucket;
  }

  windowLabel(minutes: number): string {
    if (minutes <= 0) return 'All time';
    if (minutes % (60 * 24) === 0) return `${minutes / (60 * 24)}d`;
    if (minutes % 60 === 0) return `${minutes / 60}h`;
    return `${minutes}m`;
  }

  lastEvent(iso: string | null): string {
    if (!iso) return 'Never';
    const diffMs = Date.now() - new Date(iso).getTime();
    if (diffMs < 0) return 'just now';
    const s = Math.floor(diffMs / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }
}
