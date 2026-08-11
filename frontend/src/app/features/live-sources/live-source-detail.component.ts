import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, interval, startWith, switchMap } from 'rxjs';
import {
  LiveSourceService, LiveSourceDetail, LiveSourceHealth, LiveStateKind,
  LiveBucket, LiveCoercionResult, LiveSourceSettingsPatch
} from '@core/services/live-source.service';

/**
 * `/live-sources/:id` — operate one source: read its immutable schema, edit window/refresh/retention,
 * watch liveness, send a test event, rotate the token, or delete it.
 */
@Component({
  selector: 'app-live-source-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="d-container" *ngIf="source">
      <a class="back" routerLink="/live-sources">← Live sources</a>

      <header class="d-head">
        <div>
          <h2>{{ source.name }}</h2>
          <span class="pill" [ngClass]="pillClass(health?.state ?? source.state)">{{ stateLabel(health?.state ?? source.state) }}</span>
        </div>
        <div class="d-metrics">
          <div><b>{{ (health?.eventsLastMinute ?? source.eventsPerMinute) | number }}</b><span>events/min</span></div>
          <div><b>{{ source.rows | number }}</b><span>rows</span></div>
          <div><b>{{ lastEvent(health?.lastEventAt ?? source.lastEventAt) }}</b><span>last event</span></div>
          <div><b>{{ health?.queueDepth ?? 0 | number }}</b><span>queued</span></div>
        </div>
      </header>

      <!-- Connection -->
      <section class="panel">
        <h3>Connection</h3>
        <label class="ro">Ingest URL
          <div class="copy-row"><code>{{ source.ingestUrl }}</code><button class="btn-secondary" (click)="copy(source.ingestUrl)">Copy</button></div>
        </label>
        <label class="ro">Send events with</label>
        <pre class="curl">{{ curl() }}</pre>

        <div class="row">
          <button class="btn-secondary" (click)="showTest = !showTest">Send test event</button>
          <button class="btn-secondary" (click)="regenerate()" [disabled]="regenerating">
            {{ regenerating ? 'Rotating…' : 'Regenerate token' }}
          </button>
        </div>
        <p class="note warn" *ngIf="newToken">
          New token (shown once): <code class="tok">{{ newToken }}</code>
          <button class="btn-secondary" (click)="copy(newToken)">Copy</button>
          The previous token stops working immediately.
        </p>

        <div class="test-box" *ngIf="showTest">
          <textarea [(ngModel)]="testJson" rows="6" spellcheck="false" placeholder='{ "ts": "...", "amount": 1 }'></textarea>
          <button class="btn-secondary" (click)="sendTest()">Validate (no insert)</button>
          <div class="error-message" *ngIf="testError">{{ testError }}</div>
          <table class="coerce" *ngIf="coercion.length">
            <thead><tr><th>Field</th><th>Column</th><th>Type</th><th>Input</th><th>Coerced</th><th>OK</th></tr></thead>
            <tbody>
              <tr *ngFor="let c of coercion" [class.bad]="!c.ok">
                <td>{{ c.field }}</td><td>{{ c.column }}</td><td>{{ c.sqlType }}</td>
                <td>{{ fmt(c.input) }}</td><td>{{ fmt(c.coerced) }}</td>
                <td>{{ c.ok ? '✓' : '✕ ' + (c.message || '') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Schema (read-only) -->
      <section class="panel">
        <h3>Schema <span class="muted">— permanent, cannot be changed</span></h3>
        <table class="schema">
          <thead><tr><th>Field</th><th>Column</th><th>Role</th><th>Type</th><th>Default agg</th><th>Null</th></tr></thead>
          <tbody>
            <tr *ngFor="let f of source.fields">
              <td>{{ f.name }}</td><td><code>{{ f.columnName }}</code></td><td>{{ f.role }}</td>
              <td>{{ f.sqlType }}</td><td>{{ f.defaultAgg || '—' }}</td><td>{{ f.nullable ? 'yes' : 'no' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Settings (editable) -->
      <section class="panel">
        <h3>Settings</h3>
        <div class="grid2">
          <label>Timezone <input [(ngModel)]="settings.timezone" /></label>
          <label>Bucket
            <select [(ngModel)]="settings.bucket">
              <option value="second">1s</option><option value="minute">1min</option>
              <option value="hour">1hr</option><option value="day">1day</option>
            </select>
          </label>
          <label>Default window (minutes) <input type="number" min="0" [(ngModel)]="settings.defaultWindowMinutes" /><small>0 = all time</small></label>
          <label>Retention (days)
            <div class="inline">
              <input type="number" min="1" [(ngModel)]="retentionDays" [disabled]="!retentionOn" />
              <label class="chk"><input type="checkbox" [(ngModel)]="retentionOn" /> Auto-delete</label>
            </div>
          </label>
          <label>Refresh interval
            <select [(ngModel)]="settings.refreshIntervalMs">
              <option [ngValue]="0">Off</option><option [ngValue]="5000">5s</option><option [ngValue]="15000">15s</option>
              <option [ngValue]="30000">30s</option><option [ngValue]="60000">1min</option><option [ngValue]="300000">5min</option>
            </select>
          </label>
          <label>Freshness (sec)
            <div class="inline">
              <input type="number" min="1" [(ngModel)]="freshnessSeconds" [disabled]="freshnessAuto" />
              <label class="chk"><input type="checkbox" [(ngModel)]="freshnessAuto" /> Auto</label>
            </div>
          </label>
        </div>
        <label class="toggle-row"><input type="checkbox" [(ngModel)]="settings.excludeOpenBucket" /> Exclude the current, incomplete bucket</label>
        <div class="row">
          <button class="btn-primary" (click)="save()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save settings' }}</button>
          <span class="saved" *ngIf="savedMsg">{{ savedMsg }}</span>
        </div>
      </section>

      <!-- Activity -->
      <section class="panel">
        <h3>Recent activity</h3>
        <svg class="spark" viewBox="0 0 300 60" preserveAspectRatio="none" *ngIf="spark.length > 1">
          <polyline [attr.points]="sparkPoints()" fill="none" stroke="#2563eb" stroke-width="2" />
        </svg>
        <div class="counters">
          <div><b>{{ health?.eventsLastMinute ?? 0 | number }}</b><span>events (last min)</span></div>
          <div><b>{{ health?.lagSeconds ?? '—' }}</b><span>lag (sec)</span></div>
          <div class="bad-counter" [class.bad]="(health?.failedBatches ?? 0) > 0">
            <b>{{ health?.failedBatches ?? 0 | number }}</b><span>failed batches</span>
          </div>
        </div>
      </section>

      <!-- Danger zone -->
      <section class="panel danger">
        <h3>Danger zone</h3>
        <p>Deleting a live source drops its table and every event in it. This cannot be undone.</p>
        <label>Type <b>{{ source.name }}</b> to confirm
          <input [(ngModel)]="deleteConfirm" [placeholder]="source.name" />
        </label>
        <button class="btn-danger" (click)="remove()" [disabled]="deleteConfirm !== source.name || deleting">
          {{ deleting ? 'Deleting…' : 'Delete this live source' }}
        </button>
      </section>
    </div>

    <div class="d-container" *ngIf="!source">
      <a class="back" routerLink="/live-sources">← Live sources</a>
      <p *ngIf="loadError" class="error-message">{{ loadError }}</p>
      <p *ngIf="!loadError">Loading…</p>
    </div>
  `,
  styles: [`
    .d-container { padding: 22px 30px 60px; max-width: 940px; margin: 0 auto; }
    .back { color: var(--text-secondary, #64748b); text-decoration: none; font-size: 0.85rem; }
    .d-head { display: flex; justify-content: space-between; align-items: flex-start; margin: 10px 0 22px; gap: 20px; flex-wrap: wrap; }
    .d-head h2 { margin: 0 0 6px; display: inline-block; margin-right: 10px; }
    .d-metrics { display: flex; gap: 22px; }
    .d-metrics div { text-align: right; }
    .d-metrics b { display: block; font-size: 1.15rem; }
    .d-metrics span { font-size: 0.72rem; color: var(--text-secondary, #94a3b8); }

    .pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.74rem; font-weight: 700; }
    .pill-live { background: #dcfce7; color: #15803d; }
    .pill-slow { background: #fef3c7; color: #b45309; }
    .pill-stalled { background: #fee2e2; color: #b91c1c; }
    .pill-never { background: #eef2f7; color: #64748b; }

    .panel { border: 1px solid var(--border-color, #e8ebf2); border-radius: 12px; padding: 18px 20px; margin-bottom: 18px; background: var(--bg-surface, #fff); }
    .panel h3 { margin: 0 0 14px; }
    .muted { color: var(--text-secondary, #94a3b8); font-weight: 400; font-size: 0.85rem; }
    label { display: flex; flex-direction: column; gap: 5px; font-size: 0.85rem; font-weight: 600; }
    input, select, textarea { font: inherit; padding: 8px 10px; border: 1px solid var(--border-color, #d5dbe6); border-radius: 8px; font-weight: 400; background: var(--bg-surface, #fff); color: inherit; }
    textarea { font-family: ui-monospace, monospace; font-size: 0.82rem; width: 100%; resize: vertical; }
    small { font-weight: 400; color: var(--text-secondary, #94a3b8); }
    .ro { margin-bottom: 12px; }
    .copy-row { display: flex; gap: 8px; align-items: center; }
    .copy-row code, code.tok { background: #0f172a; color: #86efac; padding: 6px 10px; border-radius: 6px; flex: 1; word-break: break-all; }
    pre.curl { background: #0f172a; color: #e2e8f0; padding: 12px 14px; border-radius: 10px; overflow-x: auto; font-size: 0.78rem; }
    .row { display: flex; gap: 12px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
    .note { font-size: 0.82rem; margin: 12px 0 0; }
    .note.warn { color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 12px; }
    .saved { color: #15803d; font-size: 0.82rem; }

    .test-box { margin-top: 14px; display: flex; flex-direction: column; gap: 10px; }
    .coerce, .schema { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .coerce th, .coerce td, .schema th, .schema td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border-color, #eef1f6); }
    .coerce tr.bad { background: #fef2f2; }

    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .inline { display: flex; gap: 8px; align-items: center; }
    .inline input[type=number] { width: 90px; }
    .chk { flex-direction: row; align-items: center; gap: 6px; font-weight: 400; }
    .toggle-row { flex-direction: row; align-items: center; gap: 8px; margin-top: 16px; }

    .spark { width: 100%; height: 60px; }
    .counters { display: flex; gap: 26px; margin-top: 10px; }
    .counters b { display: block; font-size: 1.1rem; }
    .counters span { font-size: 0.72rem; color: var(--text-secondary, #94a3b8); }
    .bad-counter.bad b { color: #b91c1c; }

    .panel.danger { border-color: #fecaca; }
    .panel.danger h3 { color: #b91c1c; }

    .btn-primary { background: var(--accent-primary, #2563eb); color: #fff; border: none; padding: 9px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; }
    .btn-primary:disabled { opacity: 0.6; }
    .btn-secondary { background: var(--bg-subtle, #eef2f7); color: inherit; border: 1px solid var(--border-color, #d5dbe6); padding: 8px 14px; border-radius: 8px; font-weight: 600; cursor: pointer; }
    .btn-danger { background: #dc2626; color: #fff; border: none; padding: 9px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; margin-top: 12px; }
    .btn-danger:disabled { opacity: 0.5; cursor: default; }
    .error-message { color: #b91c1c; background: #fee2e2; border-radius: 8px; padding: 8px 12px; }
  `]
})
export class LiveSourceDetailComponent implements OnInit, OnDestroy {
  id = '';
  source: LiveSourceDetail | null = null;
  health: LiveSourceHealth | null = null;
  loadError = '';

  settings: LiveSourceSettingsPatch = {};
  retentionDays = 7;
  retentionOn = true;
  freshnessSeconds = 60;
  freshnessAuto = true;
  saving = false;
  savedMsg = '';

  showTest = false;
  testJson = '';
  coercion: LiveCoercionResult[] = [];
  testError = '';

  regenerating = false;
  newToken = '';

  deleteConfirm = '';
  deleting = false;

  spark: number[] = [];

  private sub?: Subscription;

  constructor(private liveSources: LiveSourceService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.liveSources.get(this.id).subscribe({
      next: (s) => { this.source = s; this.hydrateSettings(s); },
      error: (e) => { this.loadError = e?.status === 404 ? 'This live source no longer exists.' : 'Could not load this source.'; }
    });
    this.sub = interval(5000).pipe(startWith(0), switchMap(() => this.liveSources.health(this.id)))
      .subscribe({
        next: (h) => {
          this.health = h;
          this.spark.push(h.eventsLastMinute);
          if (this.spark.length > 60) this.spark.shift();
        },
        error: () => { /* health may 404 before backend endpoints exist; ignore */ }
      });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  private hydrateSettings(s: LiveSourceDetail): void {
    this.settings = {
      timezone: s.timezone,
      bucket: s.bucket,
      defaultWindowMinutes: s.windowMinutes,
      excludeOpenBucket: s.excludeOpenBucket,
      refreshIntervalMs: s.refreshIntervalMs
    };
    this.retentionOn = s.retentionDays != null;
    this.retentionDays = s.retentionDays ?? 7;
    this.freshnessAuto = s.freshnessSeconds == null;
    this.freshnessSeconds = s.freshnessSeconds ?? 60;
  }

  save(): void {
    if (!this.source) return;
    this.saving = true;
    this.savedMsg = '';
    const patch: LiveSourceSettingsPatch = {
      ...this.settings,
      retentionDays: this.retentionOn ? this.retentionDays : null,
      freshnessSeconds: this.freshnessAuto ? null : this.freshnessSeconds
    };
    this.liveSources.update(this.id, patch).subscribe({
      next: (s) => { this.source = s; this.hydrateSettings(s); this.saving = false; this.savedMsg = 'Saved'; },
      error: () => { this.saving = false; this.savedMsg = 'Save failed'; }
    });
  }

  sendTest(): void {
    this.testError = '';
    this.coercion = [];
    let parsed: unknown;
    try { parsed = JSON.parse(this.testJson); } catch { this.testError = 'Not valid JSON.'; return; }
    this.liveSources.testEvent(this.id, parsed).subscribe({
      next: (r) => { this.coercion = r.results; },
      error: (e) => { this.testError = e?.error?.error || 'Validation request failed.'; }
    });
  }

  regenerate(): void {
    this.regenerating = true;
    this.liveSources.regenerateToken(this.id).subscribe({
      next: (r) => { this.regenerating = false; this.newToken = r.ingestToken; },
      error: () => { this.regenerating = false; }
    });
  }

  remove(): void {
    if (!this.source || this.deleteConfirm !== this.source.name) return;
    this.deleting = true;
    this.liveSources.delete(this.id).subscribe({
      next: () => { this.router.navigate(['/live-sources']); },
      error: () => { this.deleting = false; }
    });
  }

  copy(text: string): void { navigator.clipboard?.writeText(text); }

  curl(): string {
    if (!this.source) return '';
    const body: Record<string, unknown> = {};
    for (const f of this.source.fields) {
      if (f.role === 'timestamp') body[f.name] = new Date().toISOString();
      else if (f.role === 'measure') body[f.name] = 0;
      else if (f.role === 'dimension') body[f.name] = 'example';
    }
    return `curl -X POST "${this.source.ingestUrl}" \\\n`
      + `  -H "Authorization: Bearer <ingest-token>" \\\n`
      + `  -H "Content-Type: application/json" \\\n`
      + `  -d '${JSON.stringify(body)}'`;
  }

  sparkPoints(): string {
    const n = this.spark.length;
    if (n < 2) return '';
    const max = Math.max(1, ...this.spark);
    return this.spark.map((v, i) => {
      const x = (i / (n - 1)) * 300;
      const y = 58 - (v / max) * 54;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  fmt(v: unknown): string {
    if (v === null || v === undefined) return '∅';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  pillClass(state: LiveStateKind): string {
    switch (state) {
      case 'LIVE': return 'pill-live';
      case 'SLOW': return 'pill-slow';
      case 'STALLED': return 'pill-stalled';
      default: return 'pill-never';
    }
  }
  stateLabel(state: LiveStateKind): string { return state === 'NEVER_CONNECTED' ? 'NEVER CONNECTED' : state; }

  lastEvent(iso: string | null): string {
    if (!iso) return 'Never';
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 0) return 'now';
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }
}
