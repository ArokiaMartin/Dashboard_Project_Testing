import { Component, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Chart, registerables } from 'chart.js';
import { WidgetTileComponent, WidgetSpec, Series, buildChartConfig } from './widget-tile.component';
import { ChartCompatibilityService, Column, VizDef } from '../../services/chart-compatibility.service';

Chart.register(...registerables);

interface VizCard extends VizDef { iconSafe: SafeHtml; }
interface ChartMeta { t: WidgetSpec['chartType']; axis: 'x' | 'y'; fill: boolean; multi: boolean; radial: boolean; }

@Component({
  selector: 'app-dashboard-builder',
  standalone: true,
  imports: [CommonModule, RouterLink, WidgetTileComponent],
  template: `
    <div class="builder" [class.dragging]="dragging">
      <!-- Toolbar -->
      <div class="toolbar">
        <div class="tb-left">
          <button class="add-widget" (click)="addWidget()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Widget
          </button>
          <div class="divider"></div>
          <button class="tb-icon" title="Reset" (click)="startOver()"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg></button>
          <div class="divider"></div>
          <button class="view-data" routerLink="/data">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3z"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            View Uploaded Data
          </button>
        </div>
        <div class="tb-right">
          <button class="tb-text" routerLink="/preview">Preview</button>
          <button class="tb-save">Save</button>
        </div>
      </div>

      <div class="body">
        <!-- LEFT: available columns (multi-select) -->
        <aside class="rail" [class.mini]="railWidth < 150" [style.width.px]="railWidth">
          <div class="rail-head">AVAILABLE COLUMNS</div>
          <div class="rail-hint">Pick 2–3 columns to see compatible charts.</div>
          <button class="col-item" *ngFor="let c of compat.columns"
                  [class.active]="isSelected(c)" (click)="toggleCol(c)">
            <span class="col-badge" [ngClass]="c.type">{{ glyph(c.type) }}</span>
            <span class="col-name">{{ c.name }}</span>
            <span class="col-check" *ngIf="isSelected(c)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
          </button>
        </aside>
        <div class="rail-resizer" (mousedown)="startDrag($event)" (dblclick)="toggleRail()"><span class="grip"></span></div>

        <!-- CENTER -->
        <section class="center">
          <div class="canvas-grid" *ngIf="committedWidgets.length">
            <app-widget-tile *ngFor="let w of committedWidgets; trackBy: trackWidget" [spec]="w" (remove)="removeWidget(w.id)"></app-widget-tile>
          </div>
          <div class="canvas-divider" *ngIf="committedWidgets.length">
            <span>{{ committedWidgets.length }} widget{{ committedWidgets.length > 1 ? 's' : '' }} on canvas — build another below</span>
          </div>

          <!-- Stepper -->
          <div class="stepper">
            <div class="stp" [class.active]="!hasColumns()" [class.done]="hasColumns()"><span class="stp-num">1</span> Select Columns</div>
            <div class="stp-line" [class.done]="hasColumns()"></div>
            <div class="stp" [class.active]="hasColumns() && !selectedViz" [class.done]="!!selectedViz"><span class="stp-num">2</span> Choose Visualization</div>
            <div class="stp-line" [class.done]="!!selectedViz"></div>
            <div class="stp" [class.active]="!!selectedViz"><span class="stp-num">3</span> Preview</div>
          </div>

          <div class="step-panel">
            <!-- selected columns -->
            <div class="sel-head">
              <h2>Selected columns</h2>
              <span class="sig" *ngIf="hasColumns()">{{ signatureText() }}</span>
            </div>
            <div class="chips">
              <span class="chip" *ngFor="let c of selectedCols">
                <span class="col-badge sm" [ngClass]="c.type">{{ glyph(c.type) }}</span>
                {{ c.name }}
                <button class="chip-x" (click)="toggleCol(c)">✕</button>
              </span>
              <span class="chips-empty" *ngIf="!hasColumns()">No columns selected — pick from the left.</span>
            </div>

            <!-- compatible visualizations -->
            <div *ngIf="hasColumns()">
              <div class="section-label">COMPATIBLE VISUALIZATIONS</div>
              <div class="viz-grid">
                <button class="viz-card" *ngFor="let v of vizCards"
                        [class.active]="v.key === selectedViz"
                        [class.disabled]="!allowed(v.key)"
                        (click)="pickViz(v.key)">
                  <span class="vc-ic" [innerHTML]="v.iconSafe"></span>
                  <span class="vc-label">{{ v.label }}</span>
                  <span class="vc-req" [class.bad]="!allowed(v.key)">{{ v.requirement }}</span>
                </button>
              </div>
            </div>

            <!-- preview -->
            <div class="preview">
              <div class="ph" *ngIf="!hasColumns()">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
                <p>Select columns to begin</p>
              </div>
              <div class="ph" *ngIf="hasColumns() && !selectedViz">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.5"><path d="M9 18l6-6-6-6"/></svg>
                <p>Now pick a <b>compatible visualization</b> above</p>
              </div>

              <div class="chart-wrap" *ngIf="selectedViz && isChartViz(selectedViz)"><canvas #previewCanvas></canvas></div>

              <div class="kpi-preview" *ngIf="selectedViz === 'kpi'">
                <div class="kpi-big">{{ previewKpi | number }}</div>
                <div class="kpi-cap">Total {{ measureNames()[0] }}</div>
                <div class="kpi-trend"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> +12.5% vs last week</div>
              </div>

              <div class="table-preview" *ngIf="selectedViz === 'table'">
                <table>
                  <thead><tr><th *ngFor="let c of previewColumns">{{ c }}</th></tr></thead>
                  <tbody>
                    <tr *ngFor="let row of previewRows"><td *ngFor="let cell of row">{{ cell }}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <!-- RIGHT: style options -->
        <aside class="right">
          <div class="right-head">Style Options</div>
          <div *ngIf="!selectedViz || !isChartViz(selectedViz)" class="right-hint">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2a10 10 0 0 0 0 20 3 3 0 0 0 0-6 2 2 0 0 1 0-4 3 3 0 0 0 0-6z"/></svg>
            <p>Color options appear for chart visualizations.</p>
          </div>
          <div *ngIf="selectedViz && isChartViz(selectedViz)">
            <div class="section-title">COLOR PALETTE</div>
            <div class="palette">
              <span class="sw" *ngFor="let c of palette; let i = index" [style.background]="c" [class.sel]="i === selPalette" (click)="setPalette(i)"></span>
            </div>
            <div class="section-title">LEGEND POSITION</div>
            <div class="legend-seg">
              <button *ngFor="let p of ['Bottom','Right','Top']" [class.active]="p === legendPos" (click)="setLegend(p)">{{ p }}</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  `,
  styles: [`
    .builder { display: flex; flex-direction: column; height: 100%; background: #f4f6fb; }
    .builder.dragging { user-select: none; cursor: col-resize; }
    .toolbar { height: 56px; background: white; border-bottom: 1px solid #e8ebf2; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0; }
    .tb-left { display: flex; align-items: center; gap: 6px; }
    .add-widget { display: inline-flex; align-items: center; gap: 7px; background: #2563eb; color: white; border: none; padding: 8px 15px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .add-widget:hover { background: #1d4ed8; }
    .divider { width: 1px; height: 24px; background: #e2e8f0; margin: 0 8px; }
    .tb-icon { width: 34px; height: 34px; border: none; background: none; border-radius: 8px; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .tb-icon:hover { background: #f1f5f9; color: #2563eb; }
    .view-data { display: inline-flex; align-items: center; gap: 7px; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 8px 14px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .view-data:hover { background: #dbeafe; }
    .tb-right { display: flex; align-items: center; gap: 10px; }
    .tb-text { background: none; border: none; color: #475569; font-size: 13px; font-weight: 600; cursor: pointer; padding: 8px 12px; }
    .tb-text:hover { color: #2563eb; }
    .tb-save { background: white; border: 1px solid #2563eb; color: #2563eb; padding: 8px 20px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .tb-save:hover { background: #eff6ff; }

    .body { flex: 1; display: flex; min-height: 0; }

    /* Left column list */
    .rail { background: white; border-right: 1px solid #e8ebf2; padding: 16px 12px; overflow-y: auto; flex-shrink: 0; }
    .rail-head { font-size: 10.5px; font-weight: 700; color: #94a3b8; letter-spacing: 0.6px; padding: 6px 10px 4px; }
    .rail-hint { font-size: 11px; color: #94a3b8; padding: 0 10px 12px; line-height: 1.4; }
    .col-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: white; border: 1.5px solid #e8ebf2; border-radius: 10px; cursor: pointer; text-align: left; margin-bottom: 6px; transition: all 0.15s ease; }
    .col-item:hover { border-color: #93c5fd; background: #f8fbff; }
    .col-item.active { border-color: #2563eb; background: #eff6ff; }
    .col-badge { width: 20px; height: 20px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; flex-shrink: 0; }
    .col-badge.sm { width: 16px; height: 16px; font-size: 9px; }
    .col-badge.number { background: #dbeafe; color: #2563eb; }
    .col-badge.string { background: #f1f5f9; color: #64748b; }
    .col-badge.date { background: #dcfce7; color: #059669; }
    .col-name { flex: 1; font-size: 13px; font-weight: 600; color: #0f172a; }
    .col-check { display: flex; }
    .rail.mini .rail-head, .rail.mini .rail-hint, .rail.mini .col-name, .rail.mini .col-check { display: none; }
    .rail.mini .col-item { justify-content: center; padding: 10px 0; }

    .rail-resizer { width: 7px; flex-shrink: 0; cursor: col-resize; background: transparent; display: flex; align-items: center; justify-content: center; transition: background 0.15s ease; }
    .rail-resizer:hover, .builder.dragging .rail-resizer { background: #e8ebf2; }
    .rail-resizer .grip { width: 2px; height: 32px; background: #cbd5e1; border-radius: 2px; }
    .rail-resizer:hover .grip { background: #2563eb; }

    .center { flex: 1; padding: 24px; overflow-y: auto; }
    .canvas-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; }
    .canvas-divider { display: flex; align-items: center; gap: 12px; margin: 8px 0 20px; font-size: 12px; color: #94a3b8; font-weight: 600; }
    .canvas-divider::before, .canvas-divider::after { content: ''; flex: 1; height: 1px; background: #e8ebf2; }

    .stepper { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    .stp { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #94a3b8; }
    .stp-num { width: 24px; height: 24px; border-radius: 50%; background: #e2e8f0; color: #94a3b8; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
    .stp.active { color: #2563eb; } .stp.active .stp-num { background: #2563eb; color: white; }
    .stp.done { color: #059669; } .stp.done .stp-num { background: #059669; color: white; }
    .stp-line { flex: 1; height: 2px; background: #e2e8f0; max-width: 60px; }
    .stp-line.done { background: #059669; }

    .step-panel { background: white; border: 1px solid #e8ebf2; border-radius: 14px; padding: 26px; }
    .sel-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
    .sel-head h2 { margin: 0; font-size: 17px; font-weight: 800; color: #0f172a; }
    .sig { font-size: 12px; color: #2563eb; font-weight: 600; background: #eff6ff; padding: 3px 10px; border-radius: 20px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 22px; min-height: 34px; align-items: center; }
    .chip { display: inline-flex; align-items: center; gap: 7px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 8px 6px 8px; font-size: 13px; font-weight: 600; color: #0f172a; }
    .chip-x { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 11px; padding: 0 2px; }
    .chip-x:hover { color: #ef4444; }
    .chips-empty { font-size: 13px; color: #94a3b8; }

    .section-label { font-size: 10.5px; font-weight: 700; color: #94a3b8; letter-spacing: 0.5px; margin-bottom: 12px; }
    .viz-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .viz-card { background: white; border: 1.5px solid #e8ebf2; border-radius: 12px; padding: 16px 12px; display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; text-align: center; transition: all 0.15s ease; }
    .viz-card:hover { border-color: #2563eb; box-shadow: 0 6px 18px rgba(37,99,235,0.1); }
    .viz-card.active { border-color: #2563eb; background: #eff6ff; }
    .viz-card.disabled { opacity: 0.5; cursor: not-allowed; background: #fafbfc; box-shadow: none; border-color: #eef1f6; }
    .viz-card.disabled:hover { border-color: #eef1f6; }
    .vc-ic { color: #2563eb; display: flex; }
    .viz-card.disabled .vc-ic { color: #cbd5e1; }
    .vc-ic svg { width: 26px; height: 26px; }
    .vc-label { font-size: 12px; font-weight: 700; color: #0f172a; }
    .vc-req { font-size: 10.5px; color: #94a3b8; line-height: 1.3; }
    .vc-req.bad { color: #f59e0b; }

    .preview { border: 1px solid #eef1f6; border-radius: 10px; background: #fbfcfe; min-height: 300px; display: flex; align-items: center; justify-content: center; padding: 18px; }
    .ph { text-align: center; color: #94a3b8; }
    .ph svg { margin-bottom: 12px; }
    .ph p { margin: 0; font-size: 13px; } .ph b { color: #2563eb; }
    .chart-wrap { width: 100%; height: 320px; position: relative; }
    .kpi-preview { text-align: center; }
    .kpi-big { font-size: 52px; font-weight: 800; color: #0f172a; letter-spacing: -1px; }
    .kpi-cap { font-size: 13px; color: #94a3b8; margin-top: 4px; text-transform: capitalize; }
    .kpi-trend { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #059669; margin-top: 12px; }
    .table-preview { width: 100%; overflow: auto; }
    .table-preview table { width: 100%; border-collapse: collapse; }
    .table-preview th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; border-bottom: 1px solid #eef1f6; white-space: nowrap; }
    .table-preview td { padding: 10px 12px; font-size: 13px; color: #334155; border-bottom: 1px solid #f4f6fb; white-space: nowrap; }

    .right { width: 240px; background: white; border-left: 1px solid #e8ebf2; padding: 18px; overflow-y: auto; flex-shrink: 0; }
    .right-head { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 16px; }
    .right-hint { text-align: center; color: #94a3b8; padding: 24px 8px; }
    .right-hint svg { margin-bottom: 10px; }
    .right-hint p { font-size: 12.5px; line-height: 1.5; margin: 0; }
    .section-title { font-size: 10.5px; font-weight: 700; color: #94a3b8; letter-spacing: 0.5px; margin-bottom: 12px; }
    .palette { display: flex; gap: 10px; margin-bottom: 24px; flex-wrap: wrap; }
    .sw { width: 26px; height: 26px; border-radius: 7px; cursor: pointer; border: 2px solid transparent; transition: all 0.15s ease; }
    .sw.sel { border-color: #0f172a; transform: scale(1.1); }
    .legend-seg { display: flex; background: #f1f5f9; border-radius: 9px; padding: 3px; }
    .legend-seg button { flex: 1; border: none; background: none; padding: 7px; font-size: 12px; font-weight: 600; color: #64748b; border-radius: 7px; cursor: pointer; }
    .legend-seg button.active { background: white; color: #0f172a; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }

    @media (max-width: 1200px) { .rail { width: 190px; } .right { width: 190px; } }
  `]
})
export class DashboardBuilderComponent {
  selectedCols: Column[] = [];
  selectedViz: string | null = null;
  vizCards: VizCard[];

  selPalette = 0;
  legendPos = 'Bottom';
  palette = ['#2563eb', '#64748b', '#cbd5e1', '#1e293b', '#93c5fd'];

  committedWidgets: WidgetSpec[] = [];
  private widgetSeq = 0;
  trackWidget = (_: number, w: WidgetSpec) => w.id;

  previewKpi = 0;
  previewColumns: string[] = [];
  previewRows: (string | number)[][] = [];

  railWidth = 240;
  dragging = false;
  private dragStartX = 0;
  private dragStartW = 0;
  private lastWidth = 240;

  private _canvas?: HTMLCanvasElement;
  private chart?: Chart;

  @ViewChild('previewCanvas') set canvasRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this._canvas = ref?.nativeElement;
    if (this._canvas) setTimeout(() => this.renderChart(), 0);
  }

  constructor(public compat: ChartCompatibilityService, private sanitizer: DomSanitizer) {
    this.vizCards = compat.vizTypes.map(v => ({ ...v, iconSafe: this.sanitizer.bypassSecurityTrustHtml(v.icon) }));
  }

  private meta(viz: string): ChartMeta {
    const m: Record<string, ChartMeta> = {
      bar: { t: 'bar', axis: 'x', fill: false, multi: false, radial: false },
      hbar: { t: 'bar', axis: 'y', fill: false, multi: false, radial: false },
      stacked: { t: 'bar', axis: 'x', fill: false, multi: false, radial: false },
      line: { t: 'line', axis: 'x', fill: false, multi: false, radial: false },
      area: { t: 'line', axis: 'x', fill: true, multi: false, radial: false },
      pie: { t: 'pie', axis: 'x', fill: false, multi: true, radial: false },
      donut: { t: 'doughnut', axis: 'x', fill: false, multi: true, radial: false },
      radar: { t: 'radar', axis: 'x', fill: true, multi: false, radial: true },
      polar: { t: 'polarArea', axis: 'x', fill: false, multi: true, radial: true },
      scatter: { t: 'scatter', axis: 'x', fill: false, multi: false, radial: false }
    };
    return m[viz];
  }

  // ---- selection ----
  glyph(t: string): string { return t === 'number' ? '#' : t === 'date' ? '◷' : 'A'; }
  isSelected(c: Column): boolean { return this.selectedCols.some(s => s.name === c.name); }
  hasColumns(): boolean { return this.selectedCols.length > 0; }
  allowed(key: string): boolean { return this.compat.isAllowed(key, this.selectedCols); }
  isChartViz(key: string | null): boolean { return !!key && key !== 'kpi' && key !== 'table'; }

  signatureText(): string {
    const s = this.compat.signature(this.selectedCols);
    const parts: string[] = [];
    if (s.str) parts.push(`${s.str} categor${s.str > 1 ? 'ies' : 'y'}`);
    if (s.date) parts.push(`${s.date} date`);
    if (s.num) parts.push(`${s.num} number${s.num > 1 ? 's' : ''}`);
    return parts.join(' · ');
  }

  toggleCol(c: Column) {
    if (this.isSelected(c)) {
      this.selectedCols = this.selectedCols.filter(s => s.name !== c.name);
    } else if (this.selectedCols.length < 4) {
      this.selectedCols = [...this.selectedCols, c];
    }
    // if the current chart is no longer valid for the new selection, clear it
    if (this.selectedViz && !this.allowed(this.selectedViz)) this.selectedViz = null;
    this.refreshPreview();
  }

  pickViz(key: string) {
    if (!this.allowed(key)) return;
    this.selectedViz = key;
    this.refreshPreview();
  }

  private refreshPreview() {
    this.destroyChart();
    if (!this.selectedViz || !this.allowed(this.selectedViz)) return;
    if (this.selectedViz === 'kpi') { this.previewKpi = this.specFor().kpiTotal ?? 0; return; }
    if (this.selectedViz === 'table') { const s = this.specFor(); this.previewColumns = s.tableColumns ?? []; this.previewRows = s.tableRows ?? []; return; }
    if (this._canvas) setTimeout(() => this.renderChart(), 0);
  }

  startOver() {
    this.selectedCols = []; this.selectedViz = null;
    this.previewKpi = 0; this.previewColumns = []; this.previewRows = [];
    this.destroyChart();
  }

  addWidget() {
    if (this.hasColumns() && this.selectedViz && this.allowed(this.selectedViz)) {
      const spec = this.specFor();
      spec.id = ++this.widgetSeq;
      this.committedWidgets.push(spec);
    }
    this.startOver();
  }
  removeWidget(id: number) { this.committedWidgets = this.committedWidgets.filter(w => w.id !== id); }

  setPalette(i: number) { this.selPalette = i; if (this.isChartViz(this.selectedViz)) setTimeout(() => this.renderChart(), 0); }
  setLegend(p: string) { this.legendPos = p; if (this.isChartViz(this.selectedViz)) setTimeout(() => this.renderChart(), 0); }

  // ---- resizable rail ----
  startDrag(e: MouseEvent) { this.dragging = true; this.dragStartX = e.clientX; this.dragStartW = this.railWidth; e.preventDefault(); }
  @HostListener('document:mousemove', ['$event'])
  onDrag(e: MouseEvent) { if (!this.dragging) return; this.railWidth = Math.min(400, Math.max(70, this.dragStartW + (e.clientX - this.dragStartX))); }
  @HostListener('document:mouseup')
  stopDrag() { if (this.dragging && this.railWidth > 150) this.lastWidth = this.railWidth; this.dragging = false; }
  toggleRail() { this.railWidth = this.railWidth < 150 ? this.lastWidth : 76; }

  // ---- data shaping ----
  private dimCols(): Column[] { return this.selectedCols.filter(c => c.type !== 'number'); }
  private measureCols(): Column[] { return this.selectedCols.filter(c => c.type === 'number'); }
  measureNames(): string[] { return this.measureCols().map(c => c.name); }

  private specFor(): WidgetSpec {
    const viz = this.selectedViz!;
    const primary = this.palette[this.selPalette];
    const dims = this.dimCols();
    const meas = this.measureCols();
    const base: WidgetSpec = {
      id: 0, viz, title: '', chartType: null, labels: [], datasets: [],
      primary, fill: false, multiColor: false, radial: false, indexAxis: 'x', showLegend: false
    };

    if (viz === 'kpi') {
      const m = meas[0];
      return { ...base, title: 'Total ' + m.name, kpiTotal: this.compat.valuesFor(m.name, 6).reduce((a, b) => a + b, 0), kpiLabel: m.name };
    }

    if (viz === 'table') {
      const rowLabels = dims.length ? this.compat.labelsFor(dims[0].name) : this.compat.valuesFor(meas[0].name, 6).map((_, i) => `Row ${i + 1}`);
      const n = rowLabels.length;
      const columns = this.selectedCols.map(c => c.name);
      const rows = rowLabels.map((label, i) =>
        this.selectedCols.map(c => c.type === 'number'
          ? this.compat.valuesFor(c.name, n)[i]
          : (c === dims[0] ? label : this.compat.labelsFor(c.name)[i % this.compat.labelsFor(c.name).length])));
      return { ...base, title: 'Data table', tableColumns: columns, tableRows: rows };
    }

    const mt = this.meta(viz);

    if (viz === 'scatter') {
      const n = 12;
      const xs = this.compat.valuesFor(meas[0].name, n);
      const ys = this.compat.valuesFor(meas[1].name, n);
      const points = xs.map((x, i) => ({ x, y: ys[i] }));
      return { ...base, chartType: 'scatter', title: `${meas[1].name} vs ${meas[0].name}`, points, datasets: [{ label: `${meas[1].name} vs ${meas[0].name}`, data: [] }] };
    }

    const dim = dims[0];
    const labels = this.compat.labelsFor(dim.name);
    const datasets: Series[] = (mt.multi ? [meas[0]] : meas).map(m => ({ label: m.name, data: this.compat.valuesFor(m.name, labels.length) }));
    return {
      ...base, chartType: mt.t, title: `${meas.map(m => m.name).join(', ')} by ${dim.name}`,
      labels, datasets, fill: mt.fill, multiColor: mt.multi, radial: mt.radial, indexAxis: mt.axis,
      stacked: viz === 'stacked',
      showLegend: mt.multi || datasets.length > 1
    };
  }

  private destroyChart() { if (this.chart) { this.chart.destroy(); this.chart = undefined; } }

  private renderChart() {
    if (!this._canvas || !this.isChartViz(this.selectedViz) || !this.allowed(this.selectedViz!)) return;
    this.destroyChart();
    const cfg = buildChartConfig(this.specFor(), false);
    // apply legend position choice
    if (cfg.options?.plugins?.legend) cfg.options.plugins.legend.position = this.legendPos.toLowerCase();
    this.chart = new Chart(this._canvas.getContext('2d')!, cfg);
  }
}
