import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { environment } from '@env/environment';
import {
  LiveSourceService, LiveArrival, LiveRole, LiveSqlType, LiveAgg, LiveBucket,
  ExternalPgConnection, LiveSourceCreateRequest, LiveFieldSpec, LiveSourceCreateResult
} from '@core/services/live-source.service';

/** One row in the schema editor (Step 3). Detection suggests these; the user commits them. */
interface DetectedField {
  name: string;
  role: LiveRole;
  type: LiveSqlType;
  defaultAgg: LiveAgg;
  nullable: boolean;
  sampleValue: string;
  looksLikeId: boolean;
}

type WindowUnit = 'min' | 'hr' | 'day';

/**
 * `/live-sources/new` — the six-step wizard. Nothing is created server-side until Step 6 is confirmed;
 * every step is re-editable before submit.
 */
@Component({
  selector: 'app-live-source-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="wz-container">
      <header class="wz-header">
        <h2>Connect a live source</h2>
        <a class="wz-cancel" routerLink="/live-sources">Cancel</a>
      </header>

      <!-- Stepper -->
      <ol class="wz-steps">
        <li *ngFor="let s of stepLabels; let i = index"
            [class.active]="step === i + 1" [class.done]="step > i + 1"
            [class.skipped]="i + 1 === 2 && arrival !== 'external_pg'">
          <span class="dot">{{ step > i + 1 ? '✓' : (i + 1) }}</span>
          <span class="lbl">{{ s }}</span>
        </li>
      </ol>

      <!-- STEP 1 — arrival -->
      <section class="wz-step" *ngIf="step === 1">
        <label class="name-field">Name
          <input [(ngModel)]="name" placeholder="e.g. Store orders" maxlength="80" />
          <small>Shown on the list and in the widget builder. You can change this later.</small>
        </label>
        <h3>How does data arrive?</h3>
        <div class="cards">
          <label class="card" *ngFor="let opt of arrivalOptions"
                 [class.selected]="arrival === opt.value" [class.disabled]="opt.disabled"
                 [title]="opt.disabled ? opt.tooltip : ''">
            <input type="radio" name="arrival" [value]="opt.value" [(ngModel)]="arrival" [disabled]="opt.disabled" />
            <div class="card-body">
              <div class="card-title">{{ opt.label }} <span class="badge" *ngIf="opt.recommended">recommended</span></div>
              <div class="card-sub">{{ opt.sub }}</div>
            </div>
          </label>
        </div>
      </section>

      <!-- STEP 2 — external_pg connection -->
      <section class="wz-step" *ngIf="step === 2 && arrival === 'external_pg'">
        <h3>Connection</h3>
        <div class="grid2">
          <label>Host <input [(ngModel)]="conn.host" placeholder="db.internal" /></label>
          <label>Port <input type="number" [(ngModel)]="conn.port" /></label>
          <label>Database <input [(ngModel)]="conn.database" /></label>
          <label>Schema <input [(ngModel)]="conn.schema" /></label>
          <label>Table or view <input [(ngModel)]="conn.table" /></label>
          <label>Username <input [(ngModel)]="conn.username" /></label>
          <label>Password
            <input type="password" [(ngModel)]="connPassword" autocomplete="new-password" placeholder="write-only" />
          </label>
          <label>SSL mode
            <select [(ngModel)]="conn.sslMode">
              <option value="disable">disable</option>
              <option value="require">require</option>
              <option value="verify-full">verify-full</option>
            </select>
          </label>
          <label>Poll interval (sec)
            <input type="number" min="5" max="300" [(ngModel)]="conn.pollIntervalSeconds" />
          </label>
        </div>
        <p class="note warn">
          The password is write-only: it is stored server-side only and never returned, logged, or placed in a
          widget config.
        </p>
        <div class="row">
          <button class="btn-secondary" type="button" (click)="testConnection()" [disabled]="testingConn">
            {{ testingConn ? 'Testing…' : 'Test connection' }}
          </button>
          <span class="conn-status" *ngIf="connStatus" [class.ok]="connStatus === 'connected'">{{ connStatus }}</span>
        </div>
      </section>

      <!-- STEP 3 — describe events -->
      <section class="wz-step" *ngIf="step === 3">
        <h3>Describe the events</h3>
        <div class="split">
          <div class="split-left">
            <label class="lbl-block">Paste one sample event (JSON)</label>
            <textarea [(ngModel)]="sampleJson" rows="14" spellcheck="false"
                      placeholder='{ "ts": "2026-08-11T14:03:00Z", "amount": 42.5, "region": "North" }'></textarea>
            <button class="btn-secondary" type="button" (click)="detectFields()">Detect fields</button>
            <div class="error-message" *ngIf="detectError">{{ detectError }}</div>
          </div>
          <div class="split-right">
            <p class="note warn">
              <strong>Types are permanent.</strong> A live source's columns cannot be re-typed later. If a
              measure is declared as text, it can never be aggregated. Check the Type column before continuing.
            </p>
            <table class="field-table" *ngIf="fields.length > 0">
              <thead>
                <tr><th>Field</th><th>Role</th><th>Type</th><th>Default agg</th><th>Null</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let f of fields">
                  <td>
                    {{ f.name }}
                    <div class="id-warn" *ngIf="f.role === 'dimension' && f.looksLikeId">
                      Looks like an identifier — grouping by it produces one bar per event.
                    </div>
                  </td>
                  <td>
                    <select [(ngModel)]="f.role" (ngModelChange)="onRoleChange(f)">
                      <option value="timestamp">Timestamp</option>
                      <option value="measure">Measure</option>
                      <option value="dimension">Dimension</option>
                      <option value="ignore">Ignore</option>
                    </select>
                  </td>
                  <td>
                    <select [(ngModel)]="f.type" [disabled]="f.role === 'timestamp' || f.role === 'dimension' || f.role === 'ignore'">
                      <ng-container *ngIf="f.role === 'timestamp'"><option value="TIMESTAMPTZ">TIMESTAMPTZ</option></ng-container>
                      <ng-container *ngIf="f.role === 'measure'">
                        <option value="NUMERIC">NUMERIC</option>
                        <option value="BIGINT">BIGINT</option>
                        <option value="DOUBLE PRECISION">DOUBLE PRECISION</option>
                      </ng-container>
                      <ng-container *ngIf="f.role === 'dimension' || f.role === 'ignore'"><option value="TEXT">TEXT</option></ng-container>
                    </select>
                  </td>
                  <td>
                    <select [(ngModel)]="f.defaultAgg" [disabled]="f.role !== 'measure'">
                      <option value="SUM">SUM</option><option value="AVG">AVG</option>
                      <option value="COUNT">COUNT</option><option value="MIN">MIN</option><option value="MAX">MAX</option>
                    </select>
                  </td>
                  <td class="center"><input type="checkbox" [(ngModel)]="f.nullable" /></td>
                </tr>
              </tbody>
            </table>
            <div class="error-message" *ngIf="timestampError">{{ timestampError }}</div>
          </div>
        </div>
      </section>

      <!-- STEP 4 — time & window -->
      <section class="wz-step" *ngIf="step === 4">
        <h3>Time and window semantics</h3>
        <div class="grid2">
          <label>Timezone
            <input list="tzlist" [(ngModel)]="time.timezone" />
            <datalist id="tzlist"><option *ngFor="let tz of timezones" [value]="tz"></option></datalist>
            <small>Buckets and day boundaries are computed in this timezone.</small>
          </label>
          <label>Bucket size
            <select [(ngModel)]="time.bucket">
              <option value="second">1s</option><option value="minute">1min</option>
              <option value="hour">1hr</option><option value="day">1day</option>
            </select>
            <small>Events are grouped into buckets of this size before charting.</small>
          </label>
          <label>Default window
            <div class="inline">
              <input type="number" min="1" [(ngModel)]="windowValue" />
              <select [(ngModel)]="windowUnit">
                <option value="min">min</option><option value="hr">hr</option><option value="day">day</option>
              </select>
            </div>
            <small>How far back a live widget looks by default. Each widget can override this.</small>
          </label>
          <label>Retention
            <div class="inline">
              <input type="number" min="1" [(ngModel)]="retentionDays" [disabled]="!retentionOn" />
              <label class="chk"><input type="checkbox" [(ngModel)]="retentionOn" /> Delete oldest automatically</label>
            </div>
            <small>Older events are removed. Without this the table grows forever.</small>
          </label>
        </div>
        <label class="toggle-row">
          <input type="checkbox" [(ngModel)]="time.excludeOpenBucket" />
          Exclude the current, incomplete bucket
          <small>The bucket still filling up is only partly counted, so including it makes every metric look like it just dropped.</small>
        </label>
      </section>

      <!-- STEP 5 — refresh -->
      <section class="wz-step" *ngIf="step === 5">
        <h3>How the dashboard updates</h3>
        <div class="grid2">
          <label>Refresh interval
            <select [(ngModel)]="refreshMs">
              <option [ngValue]="0">Off</option>
              <option [ngValue]="5000">5s</option>
              <option [ngValue]="15000">15s</option>
              <option [ngValue]="30000">30s</option>
              <option [ngValue]="60000">1min</option>
              <option [ngValue]="300000">5min</option>
            </select>
          </label>
          <label>Freshness threshold
            <div class="inline">
              <input type="number" min="1" [(ngModel)]="freshnessSeconds" [disabled]="freshnessAuto" />
              <label class="chk"><input type="checkbox" [(ngModel)]="freshnessAuto" /> Auto</label>
            </div>
            <small>Auto = p95 of inter-arrival gaps over 24h, floored at 3 buckets.</small>
          </label>
        </div>
        <label class="toggle-row disabled">
          <input type="checkbox" [checked]="true" disabled /> Pause when tab is hidden
          <small>Always on: a hidden tab stops polling so an idle dashboard does not accumulate work.</small>
        </label>
        <p class="note" *ngIf="refreshMs > 0">About {{ requestsPerMinute() }} requests/min per widget on this dashboard.</p>
        <p class="note warn" *ngIf="refreshShorterThanBucket()">
          Refreshing faster than the bucket size means repeated identical results per bucket. Consider matching
          the refresh to the bucket size.
        </p>
      </section>

      <!-- STEP 6 — review -->
      <section class="wz-step" *ngIf="step === 6">
        <h3>Review and create</h3>
        <div class="review">
          <h4>Summary</h4>
          <ul class="summary">
            <li><b>Name</b><span>{{ name || '(unnamed)' }}</span></li>
            <li><b>Arrival</b><span>{{ arrival }}</span></li>
            <li><b>Timestamp</b><span>{{ timestampField()?.name || '—' }}</span></li>
            <li><b>Measures</b><span>{{ measureNames() || '—' }}</span></li>
            <li><b>Dimensions</b><span>{{ dimensionNames() || '—' }}</span></li>
            <li><b>Timezone</b><span>{{ time.timezone }}</span></li>
            <li><b>Bucket</b><span>{{ time.bucket }}</span></li>
            <li><b>Default window</b><span>{{ windowValue }} {{ windowUnit }}</span></li>
            <li><b>Exclude open bucket</b><span>{{ time.excludeOpenBucket ? 'Yes' : 'No' }}</span></li>
            <li><b>Retention</b><span>{{ retentionOn ? retentionDays + ' days' : 'Forever' }}</span></li>
            <li><b>Refresh</b><span>{{ refreshMs === 0 ? 'Off' : (refreshMs / 1000) + 's' }}</span></li>
          </ul>

          <h4>Table that will be created</h4>
          <pre class="ddl" *ngIf="ddlPreview">{{ ddlPreview }}</pre>
          <p class="note" *ngIf="!ddlPreview && !ddlError">Loading DDL preview…</p>
          <p class="note warn" *ngIf="ddlError">Could not load DDL preview from the server ({{ ddlError }}). It will be created on confirm.</p>

          <h4>How to send events</h4>
          <pre class="curl">{{ sampleCurl() }}</pre>
          <p class="note warn">This endpoint is unauthenticated at the network level. Do not expose it publicly.</p>
        </div>
      </section>

      <!-- Nav -->
      <footer class="wz-nav" *ngIf="!created">
        <button class="btn-secondary" type="button" (click)="goBack()" [disabled]="step === 1">Back</button>
        <div class="spacer"></div>
        <span class="step-error" *ngIf="navError">{{ navError }}</span>
        <button class="btn-primary" type="button" *ngIf="step < 6" (click)="goNext()">Next</button>
        <button class="btn-primary" type="button" *ngIf="step === 6" (click)="create()" [disabled]="creating">
          {{ creating ? 'Creating…' : 'Create live source' }}
        </button>
      </footer>

      <!-- Token panel (shown once, after create) -->
      <div class="token-panel" *ngIf="created">
        <h3>Live source created</h3>
        <p class="warn">
          Copy this token now. It will not be shown again. Anyone with this token and network access to this
          server can write events to this source.
        </p>
        <div class="token-box">
          <code>{{ created.ingestToken }}</code>
          <button class="btn-secondary" type="button" (click)="copy(created.ingestToken)">Copy</button>
        </div>
        <pre class="curl">{{ createdCurl() }}</pre>
        <a class="btn-primary" [routerLink]="['/live-sources', created.id]">Go to source</a>
      </div>
    </div>
  `,
  styles: [`
    .wz-container { padding: 24px 30px 60px; max-width: 980px; margin: 0 auto; }
    .wz-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
    .wz-header h2 { margin: 0; }
    .wz-cancel { color: var(--text-secondary, #64748b); text-decoration: none; }

    .wz-steps { display: flex; list-style: none; padding: 0; margin: 0 0 26px; gap: 6px; flex-wrap: wrap; }
    .wz-steps li { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 8px; color: var(--text-secondary, #94a3b8); font-size: 0.82rem; }
    .wz-steps li.active { color: var(--accent-primary, #2563eb); font-weight: 600; }
    .wz-steps li.done { color: #15803d; }
    .wz-steps li.skipped { opacity: 0.4; text-decoration: line-through; }
    .wz-steps .dot { width: 22px; height: 22px; border-radius: 50%; background: var(--bg-subtle, #eef2f7); display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; }
    .wz-steps li.active .dot { background: var(--accent-primary, #2563eb); color: #fff; }
    .wz-steps li.done .dot { background: #dcfce7; color: #15803d; }

    .wz-step h3 { margin: 0 0 16px; }
    .name-field { margin-bottom: 22px; max-width: 420px; }
    .cards { display: grid; gap: 12px; }
    .card { display: flex; gap: 12px; border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; padding: 14px 16px; cursor: pointer; align-items: flex-start; }
    .card.selected { border-color: var(--accent-primary, #2563eb); box-shadow: 0 0 0 2px rgba(37,99,235,0.12); }
    .card.disabled { opacity: 0.5; cursor: not-allowed; }
    .card-title { font-weight: 600; }
    .badge { font-size: 0.68rem; background: #dcfce7; color: #15803d; padding: 1px 7px; border-radius: 999px; margin-left: 6px; }
    .card-sub { color: var(--text-secondary, #64748b); font-size: 0.85rem; margin-top: 2px; }

    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    label { display: flex; flex-direction: column; gap: 5px; font-size: 0.85rem; font-weight: 600; }
    input, select, textarea { font: inherit; padding: 8px 10px; border: 1px solid var(--border-color, #d5dbe6); border-radius: 8px; font-weight: 400; background: var(--bg-surface, #fff); color: inherit; }
    textarea { width: 100%; resize: vertical; font-family: ui-monospace, monospace; font-size: 0.82rem; }
    small { font-weight: 400; color: var(--text-secondary, #94a3b8); }
    .inline { display: flex; gap: 8px; align-items: center; }
    .inline input[type=number] { width: 90px; }
    .chk { flex-direction: row; align-items: center; gap: 6px; font-weight: 400; }
    .toggle-row { flex-direction: row; align-items: flex-start; gap: 8px; margin-top: 18px; font-weight: 600; }
    .toggle-row small { display: block; }
    .toggle-row.disabled { opacity: 0.65; }

    .split { display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px; }
    .split-left { display: flex; flex-direction: column; gap: 10px; }
    .lbl-block { font-weight: 600; }
    .field-table { width: 100%; border-collapse: collapse; }
    .field-table th, .field-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border-color, #eef1f6); font-size: 0.82rem; }
    .field-table .center { text-align: center; }
    .field-table select { padding: 4px 6px; }
    .id-warn { color: #b45309; font-size: 0.72rem; margin-top: 3px; }

    .note { color: var(--text-secondary, #64748b); font-size: 0.82rem; margin: 12px 0 0; }
    .note.warn { color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 12px; }
    .row { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
    .conn-status { font-size: 0.82rem; color: #b91c1c; }
    .conn-status.ok { color: #15803d; }

    .review h4 { margin: 18px 0 8px; }
    .summary { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
    .summary li { display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color, #eef1f6); padding: 4px 0; font-size: 0.85rem; }
    .summary b { color: var(--text-secondary, #64748b); font-weight: 600; }
    pre.ddl, pre.curl { background: #0f172a; color: #e2e8f0; padding: 12px 14px; border-radius: 10px; overflow-x: auto; font-size: 0.78rem; }

    .wz-nav { display: flex; align-items: center; gap: 12px; margin-top: 28px; padding-top: 18px; border-top: 1px solid var(--border-color, #eef1f6); }
    .wz-nav .spacer { flex: 1; }
    .step-error { color: #b91c1c; font-size: 0.82rem; }

    .token-panel { margin-top: 24px; border: 1px solid #fde68a; background: #fffbeb; border-radius: 12px; padding: 20px; }
    .token-panel .warn { color: #b45309; }
    .token-box { display: flex; gap: 10px; align-items: center; margin: 10px 0; }
    .token-box code { background: #0f172a; color: #86efac; padding: 8px 12px; border-radius: 8px; flex: 1; word-break: break-all; }

    .btn-primary { background: var(--accent-primary, #2563eb); color: #fff; border: none; padding: 9px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; }
    .btn-primary:disabled { opacity: 0.6; cursor: default; }
    .btn-secondary { background: var(--bg-subtle, #eef2f7); color: inherit; border: 1px solid var(--border-color, #d5dbe6); padding: 8px 14px; border-radius: 8px; font-weight: 600; cursor: pointer; }
    .error-message { color: #b91c1c; background: #fee2e2; border-radius: 8px; padding: 8px 12px; }
  `]
})
export class LiveSourceWizardComponent {
  step = 1;
  readonly stepLabels = ['Arrival', 'Connection', 'Schema', 'Time', 'Refresh', 'Review'];

  arrival: LiveArrival = 'http_push';
  readonly arrivalOptions: { value: LiveArrival; label: string; sub: string; disabled: boolean; recommended: boolean; tooltip: string }[] = [
    { value: 'http_push', label: 'Push events to this app', sub: 'Your system POSTs JSON to a URL we give you. Nothing to install.', disabled: false, recommended: true, tooltip: '' },
    { value: 'simulator', label: 'Generate sample events', sub: 'A built-in simulator so you can try live dashboards without wiring a real producer.', disabled: false, recommended: false, tooltip: '' },
    { value: 'external_pg', label: 'Read from another Postgres table', sub: 'We poll a table you already have. Requires connection details.', disabled: false, recommended: false, tooltip: '' },
    { value: 'kafka', label: 'Kafka topic', sub: 'Not available.', disabled: true, recommended: false, tooltip: 'Not needed at this scale — add a second consumer or a replay requirement first.' }
  ];

  name = '';

  conn: ExternalPgConnection = {
    host: '', port: 5432, database: '', schema: 'public', table: '', username: '', sslMode: 'require', pollIntervalSeconds: 15
  };
  connPassword = '';
  testingConn = false;
  connStatus = '';

  sampleJson = '';
  fields: DetectedField[] = [];
  detectError = '';
  timestampError = '';

  readonly timezones: string[] = this.loadTimezones();
  time = {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    bucket: 'minute' as LiveBucket,
    excludeOpenBucket: true
  };
  windowValue = 60;
  windowUnit: WindowUnit = 'min';
  retentionDays = 7;
  retentionOn = true;

  refreshMs = 15000;
  freshnessSeconds = 60;
  freshnessAuto = true;

  ddlPreview = '';
  ddlError = '';
  navError = '';

  creating = false;
  created: LiveSourceCreateResult | null = null;

  constructor(private liveSources: LiveSourceService, private router: Router) {}

  // ---- Step 3 detection ----------------------------------------------------

  detectFields(): void {
    this.detectError = '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.sampleJson);
    } catch {
      this.detectError = 'That is not valid JSON. Paste a single sample event.';
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      this.detectError = 'Paste one sample event as a JSON object.';
      return;
    }
    const flat = this.flatten(parsed as Record<string, unknown>, '');
    const rows: DetectedField[] = [];
    let tsAssigned = false;
    for (const [key, value] of Object.entries(flat)) {
      const isNumber = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value)));
      const looksTs = /(^|_)(ts|time|timestamp|date|_at)$/i.test(key) || this.isIsoDate(value);
      let role: LiveRole;
      let type: LiveSqlType;
      if (looksTs && !tsAssigned) { role = 'timestamp'; type = 'TIMESTAMPTZ'; tsAssigned = true; }
      else if (isNumber) { role = 'measure'; type = 'NUMERIC'; }
      else { role = 'dimension'; type = 'TEXT'; }
      rows.push({
        name: key, role, type, defaultAgg: 'SUM', nullable: true,
        sampleValue: String(value),
        looksLikeId: /(^|_)(id|key|uuid|guid)$/i.test(key) || this.isUuid(value)
      });
    }
    this.fields = rows;
  }

  onRoleChange(f: DetectedField): void {
    if (f.role === 'timestamp') { f.type = 'TIMESTAMPTZ'; }
    else if (f.role === 'measure') { if (f.type === 'TEXT' || f.type === 'TIMESTAMPTZ') f.type = 'NUMERIC'; }
    else { f.type = 'TEXT'; }
  }

  private flatten(obj: Record<string, unknown>, prefix: string): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}_${k}` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        Object.assign(out, this.flatten(v as Record<string, unknown>, key));
      } else if (!Array.isArray(v)) {
        out[key] = v;
      }
    }
    return out;
  }

  private isIsoDate(v: unknown): boolean {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v);
  }
  private isUuid(v: unknown): boolean {
    return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  }

  // ---- selectors -----------------------------------------------------------

  timestampField(): DetectedField | undefined { return this.fields.find(f => f.role === 'timestamp'); }
  measures(): DetectedField[] { return this.fields.filter(f => f.role === 'measure'); }
  dimensions(): DetectedField[] { return this.fields.filter(f => f.role === 'dimension'); }
  measureNames(): string { return this.measures().map(f => f.name).join(', '); }
  dimensionNames(): string { return this.dimensions().map(f => f.name).join(', '); }

  windowMinutes(): number {
    if (this.windowUnit === 'hr') return this.windowValue * 60;
    if (this.windowUnit === 'day') return this.windowValue * 60 * 24;
    return this.windowValue;
  }

  requestsPerMinute(): number { return this.refreshMs > 0 ? Math.round(60000 / this.refreshMs) : 0; }
  refreshShorterThanBucket(): boolean {
    const bucketMs: Record<LiveBucket, number> = { second: 1000, minute: 60000, hour: 3600000, day: 86400000 };
    return this.refreshMs > 0 && this.refreshMs < bucketMs[this.time.bucket];
  }

  // ---- navigation ----------------------------------------------------------

  goNext(): void {
    this.navError = '';
    if (!this.validateStep(this.step)) return;
    let next = this.step + 1;
    if (next === 2 && this.arrival !== 'external_pg') next = 3;   // Step 2 only for external_pg
    this.step = next;
    if (this.step === 6) this.loadDdlPreview();
  }

  goBack(): void {
    this.navError = '';
    let prev = this.step - 1;
    if (prev === 2 && this.arrival !== 'external_pg') prev = 1;
    this.step = Math.max(1, prev);
  }

  private validateStep(step: number): boolean {
    if (step === 1) {
      if (!this.name.trim()) { this.navError = 'Give the source a name.'; return false; }
      return true;
    }
    if (step === 2 && this.arrival === 'external_pg') {
      if (!this.conn.host || !this.conn.database || !this.conn.table || !this.conn.username || !this.connPassword) {
        this.navError = 'Fill in host, database, table, username and password.'; return false;
      }
      if (this.connStatus !== 'connected') { this.navError = 'Run a successful Test connection before continuing.'; return false; }
    }
    if (step === 3) {
      this.timestampError = '';
      if (this.fields.length === 0) { this.navError = 'Detect fields from a sample event first.'; return false; }
      const tsCount = this.fields.filter(f => f.role === 'timestamp').length;
      if (tsCount !== 1) {
        this.timestampError = 'Pick which field is the event timestamp — a live source needs to know when each event happened.';
        return false;
      }
      if (this.measures().length === 0 && this.dimensions().length === 0) {
        this.navError = 'Declare at least one measure or dimension.'; return false;
      }
    }
    return true;
  }

  // ---- external_pg test ----------------------------------------------------

  testConnection(): void {
    this.testingConn = true;
    this.connStatus = '';
    this.liveSources.testConnection(this.conn, this.connPassword).subscribe({
      next: (r) => { this.testingConn = false; this.connStatus = r.status; if (r.tables?.length) { /* could populate a dropdown */ } },
      error: () => { this.testingConn = false; this.connStatus = 'host unreachable'; }
    });
  }

  // ---- step 6 --------------------------------------------------------------

  private buildPayload(): LiveSourceCreateRequest {
    const ts = this.timestampField();
    const measures: LiveFieldSpec[] = this.measures().map(f => ({ name: f.name, type: f.type, defaultAgg: f.defaultAgg, nullable: f.nullable }));
    const dimensions: LiveFieldSpec[] = this.dimensions().map(f => ({ name: f.name, type: f.type, nullable: f.nullable }));
    return {
      name: this.name.trim(),
      arrival: this.arrival,
      connection: this.arrival === 'external_pg' ? this.conn : null,
      timestampField: { name: ts ? ts.name : 'ts', type: 'TIMESTAMPTZ' },
      measures,
      dimensions,
      time: {
        timezone: this.time.timezone,
        bucket: this.time.bucket,
        defaultWindowMinutes: this.windowMinutes(),
        excludeOpenBucket: this.time.excludeOpenBucket,
        retentionDays: this.retentionOn ? this.retentionDays : null
      },
      refresh: { intervalMs: this.refreshMs, freshnessSeconds: this.freshnessAuto ? null : this.freshnessSeconds }
    };
  }

  private loadDdlPreview(): void {
    this.ddlPreview = '';
    this.ddlError = '';
    this.liveSources.previewDdl(this.buildPayload()).subscribe({
      next: (r) => { this.ddlPreview = r.ddl; },
      error: (e) => { this.ddlError = e?.status ? `HTTP ${e.status}` : 'unavailable'; }
    });
  }

  sampleCurl(): string {
    const body: Record<string, unknown> = {};
    const ts = this.timestampField();
    if (ts) body[ts.name] = new Date().toISOString();
    for (const m of this.measures()) body[m.name] = 0;
    for (const d of this.dimensions()) body[d.name] = 'example';
    return `curl -X POST "${environment.apiUrl}/live/{sourceId}/events" \\\n`
      + `  -H "Authorization: Bearer <ingest-token>" \\\n`
      + `  -H "Content-Type: application/json" \\\n`
      + `  -d '${JSON.stringify(body)}'`;
  }

  createdCurl(): string {
    if (!this.created) return '';
    const body: Record<string, unknown> = {};
    const ts = this.timestampField();
    if (ts) body[ts.name] = new Date().toISOString();
    for (const m of this.measures()) body[m.name] = 0;
    for (const d of this.dimensions()) body[d.name] = 'example';
    return `curl -X POST "${this.created.ingestUrl}" \\\n`
      + `  -H "Authorization: Bearer ${this.created.ingestToken}" \\\n`
      + `  -H "Content-Type: application/json" \\\n`
      + `  -d '${JSON.stringify(body)}'`;
  }

  create(): void {
    this.navError = '';
    if (!this.name.trim()) { this.step = 6; this.navError = 'Enter a name for the source.'; return; }
    this.creating = true;
    this.liveSources.create(this.buildPayload()).subscribe({
      next: (r) => { this.creating = false; this.created = r; },
      error: (e) => { this.creating = false; this.navError = e?.error?.error || 'Could not create the source. Is the backend running?'; }
    });
  }

  copy(text: string): void {
    navigator.clipboard?.writeText(text);
  }

  private loadTimezones(): string[] {
    const anyIntl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    if (typeof anyIntl.supportedValuesOf === 'function') {
      try { return anyIntl.supportedValuesOf('timeZone'); } catch { /* fall through */ }
    }
    return ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London',
      'Europe/Berlin', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney'];
  }
}
