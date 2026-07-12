import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewInit, OnDestroy, OnChanges, SimpleChanges, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { BackendIntegrationService } from '@core/services/backend-integration.service';

Chart.register(...registerables);

export interface Series { label: string; data: number[]; }

/** One hop in a drill-down path: the ancestor dimension field and the value the user clicked. */
export interface DrillStep { field: string; value: string; }

/** Snapshot of the builder inputs that produced a widget, so it can be reloaded for editing. */
export interface WidgetEditState {
  datasetIds: string[];
  colNames: string[];
  viz: string | null;
  filterKey: string | null;
  activeLabels: string[];
  granularity: 'monthly' | 'quarterly' | 'half-yearly' | 'yearly';
  topNOption: 'all' | 'top3' | 'top5' | 'bottom3';
  aggregation: 'sum' | 'avg' | 'min' | 'max';
  rangeMin: number | null;
  rangeMax: number | null;
  selPalette: number;
  legendPos: string;
  /** Ordered dimension columns to drill into, below the plotted dimension. Optional (older widgets have none). */
  drillPath?: string[];
}

export interface WidgetSpec {
  id: number;
  viz: string;
  title: string;
  chartType: 'bar' | 'line' | 'doughnut' | 'pie' | 'radar' | 'polarArea' | 'scatter' | null;
  labels: string[];
  datasets: Series[];
  points?: { x: number; y: number }[];
  primary: string;
  fill: boolean;
  multiColor: boolean;
  radial: boolean;
  indexAxis: 'x' | 'y';
  showLegend: boolean;
  legendPosition?: 'bottom' | 'right' | 'top';
  stacked?: boolean;
  kpiTotal?: number;
  kpiLabel?: string;
  tableColumns?: string[];
  tableRows?: (string | number)[][];
  databaseConfig?: Record<string, unknown>;
  editState?: WidgetEditState;
}

const PALETTE = ['#2563eb', '#60a5fa', '#93c5fd', '#1e40af', '#64748b', '#cbd5e1'];

@Component({
  selector: 'app-widget-tile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tile" [class.editing]="editing">
      <div class="tile-head">
        <span class="tile-title" *ngIf="!renaming">{{ spec.title }}</span>
        <input *ngIf="renaming" #renameInput class="tile-title-input" [value]="spec.title"
               (click)="$event.stopPropagation()"
               (keydown.enter)="commitRename($any($event.target).value)"
               (keydown.escape)="renaming = false"
               (blur)="commitRename($any($event.target).value)" />
        <div class="tile-menu" *ngIf="!readOnly">
          <button class="tile-dots" (click)="toggleMenu($event)" title="Options">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>
          </button>
          <div class="tile-dropdown" *ngIf="menuOpen" (click)="$event.stopPropagation()">
            <button (click)="startRename()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Rename
            </button>
            <button (click)="triggerEdit()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              Edit
            </button>
            <button class="danger" (click)="triggerRemove()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              Remove
            </button>
          </div>
        </div>
      </div>

      <!-- Drill-down breadcrumb: only shown once a widget has a multi-dimension hierarchy to drill. -->
      <div class="tile-drill" *ngIf="isDrillable()">
        <button class="drill-crumb root" (click)="resetDrill()" [disabled]="drillStack.length === 0" title="Back to top level">
          {{ baseDimLabel() }}
        </button>
        <ng-container *ngFor="let step of drillStack; let i = index">
          <span class="drill-sep">›</span>
          <button class="drill-crumb" (click)="drillUpTo(i)" [title]="'Back to ' + step.value">{{ step.value }}</button>
        </ng-container>
        <span class="drill-current" *ngIf="canDrillDown()">· click to break down by <b>{{ currentDimLabel() }}</b></span>
        <span class="drill-current leaf" *ngIf="!canDrillDown() && drillStack.length">· deepest level</span>
        <span class="drill-status" *ngIf="drillLoading">loading…</span>
        <span class="drill-status err" *ngIf="drillError" [title]="drillError">failed</span>
      </div>

      <div class="tile-body">
        <div class="tile-chart" *ngIf="spec.chartType"><canvas #cv></canvas></div>

        <div class="tile-kpi" *ngIf="spec.viz === 'kpi'">
          <div class="tk-num">{{ spec.kpiTotal | number }}</div>
          <div class="tk-cap">Total {{ spec.kpiLabel }}</div>
          <div class="tk-trend"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> +12.5%</div>
        </div>

        <div class="tile-table" *ngIf="spec.viz === 'table'">
          <table>
            <thead><tr><th *ngFor="let c of spec.tableColumns">{{ c }}</th></tr></thead>
            <tbody>
              <tr *ngFor="let r of spec.tableRows"><td *ngFor="let cell of r">{{ cell }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .tile { background: white; border: 1px solid #e8ebf2; border-radius: 12px; padding: 16px; height: 260px; display: flex; flex-direction: column; transition: box-shadow 0.15s, border-color 0.15s; }
    .tile.editing { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.15); }
    .tile-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .tile-title { font-size: 13px; font-weight: 700; color: #0f172a; }
    .tile-actions { display: flex; align-items: center; gap: 2px; }
    .tile-edit, .tile-remove { width: 26px; height: 26px; border: none; background: none; color: #cbd5e1; border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .tile-edit:hover { background: #eff6ff; color: #2563eb; }
    .tile-remove:hover { background: #fef2f2; color: #ef4444; }
    .tile-title-input { flex: 1; min-width: 0; font-size: 13px; font-weight: 700; color: #0f172a; border: 1.5px solid #2563eb; border-radius: 6px; padding: 3px 7px; outline: none; margin-right: 8px; }
    .tile-menu { position: relative; }
    .tile-dots { width: 26px; height: 26px; border: none; background: none; color: #94a3b8; border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .tile-dots:hover { background: #f1f5f9; color: #475569; }
    .tile-dropdown { position: absolute; top: 30px; right: 0; z-index: 30; background: white; border: 1px solid #e8ebf2; border-radius: 10px; box-shadow: 0 10px 30px rgba(15,23,42,0.14); padding: 5px; min-width: 148px; display: flex; flex-direction: column; }
    .tile-dropdown button { display: flex; align-items: center; gap: 9px; width: 100%; border: none; background: none; padding: 8px 10px; font-size: 13px; font-weight: 600; color: #334155; border-radius: 7px; cursor: pointer; text-align: left; }
    .tile-dropdown button:hover { background: #f8fafc; color: #2563eb; }
    .tile-dropdown button.danger { color: #64748b; }
    .tile-dropdown button.danger:hover { background: #fef2f2; color: #ef4444; }
    .tile-drill { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin: -4px 0 8px; font-size: 11px; color: #94a3b8; }
    .drill-crumb { border: none; background: #f1f5f9; color: #2563eb; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; cursor: pointer; }
    .drill-crumb:hover:not(:disabled) { background: #e0edff; }
    .drill-crumb:disabled { color: #64748b; cursor: default; background: #f1f5f9; }
    .drill-crumb.root { font-weight: 700; }
    .drill-sep { color: #cbd5e1; }
    .drill-current { color: #94a3b8; }
    .drill-current b { color: #475569; font-weight: 700; }
    .drill-current.leaf { color: #cbd5e1; }
    .drill-status { margin-left: auto; font-weight: 600; color: #94a3b8; }
    .drill-status.err { color: #ef4444; }
    .tile-body { flex: 1; min-height: 0; position: relative; }
    .tile-chart { position: absolute; inset: 0; }
    .tile-kpi { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .tk-num { font-size: 40px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    .tk-cap { font-size: 12px; color: #94a3b8; text-transform: capitalize; margin-top: 2px; }
    .tk-trend { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: #059669; margin-top: 10px; }
    .tile-table { height: 100%; overflow: auto; }
    .tile-table table { width: 100%; border-collapse: collapse; }
    .tile-table th { text-align: left; padding: 7px 10px; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; border-bottom: 1px solid #eef1f6; position: sticky; top: 0; background: white; }
    .tile-table td { padding: 7px 10px; font-size: 12px; color: #334155; border-bottom: 1px solid #f4f6fb; white-space: nowrap; }
  `]
})
export class WidgetTileComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() spec!: WidgetSpec;
  @Input() editing = false;
  @Input() readOnly = false;
  @Output() remove = new EventEmitter<void>();
  @Output() edit = new EventEmitter<void>();
  @ViewChild('cv') canvas?: ElementRef<HTMLCanvasElement>;
  private chart?: Chart;

  // ---- three-dots menu + inline rename ----
  menuOpen = false;
  renaming = false;
  @Output() renamed = new EventEmitter<string>();
  @ViewChild('renameInput') renameInput?: ElementRef<HTMLInputElement>;

  toggleMenu(e: MouseEvent) { e.stopPropagation(); this.menuOpen = !this.menuOpen; }

  /** Close the menu on any outside click (the toggle button stops propagation). */
  @HostListener('document:click') closeMenu() { this.menuOpen = false; }

  startRename() {
    this.menuOpen = false;
    this.renaming = true;
    setTimeout(() => { this.renameInput?.nativeElement.focus(); this.renameInput?.nativeElement.select(); }, 0);
  }

  commitRename(value: string) {
    const name = (value ?? '').trim();
    if (name) { this.spec.title = name; this.renamed.emit(name); }
    this.renaming = false;
  }

  triggerEdit() { this.menuOpen = false; this.edit.emit(); }
  triggerRemove() { this.menuOpen = false; this.remove.emit(); }

  // ---- drill-down state (additive; only engages when a widget has >1 dimension) ----
  /** Ancestor hops the user drilled through; drives the breadcrumb. Empty = top level. */
  drillStack: DrillStep[] = [];
  /** The stack whose data is actually rendered right now (used to revert the breadcrumb on a failed load). */
  private renderedStack: DrillStep[] = [];
  /** Labels/series for the current drill level; null = render the base spec the builder hydrated. */
  private drillLabels: string[] | null = null;
  private drillDatasets: Series[] | null = null;
  drillLoading = false;
  drillError = '';

  constructor(private backend: BackendIntegrationService) {}

  ngAfterViewInit() { setTimeout(() => this.initRender(), 0); }

  /** Redraw when the widget is updated in place (same id, new config) — otherwise edits wouldn't show. */
  ngOnChanges(changes: SimpleChanges) {
    if (changes['spec'] && !changes['spec'].firstChange) {
      this.resetDrillState();          // a replaced/edited widget starts fresh at the top level
      setTimeout(() => this.initRender(), 0);
    }
  }

  ngOnDestroy() { this.chart?.destroy(); }

  /** First paint: show the builder-hydrated data immediately, then (for multi-dimension widgets)
   *  refine the base to a clean single-dimension grouping so the hierarchy can be drilled. */
  private initRender() {
    this.render();
    if (this.isDrillable() && !this.drillLabels) {
      this.loadLevel([]);
    }
  }

  // ---- drill hierarchy helpers ------------------------------------------------

  /**
   * Ordered dimension fields = the drill hierarchy. Charts here plot exactly one dimension, so the
   * hierarchy is that plotted dimension (level 0) followed by the widget's optional `drillPath`
   * (finer dimensions to descend into). Both come straight from the saved query config.
   */
  private hierarchy(): string[] {
    const db = this.spec.databaseConfig as any;
    const base = Array.isArray(db?.dimensions) ? db.dimensions.map((d: unknown) => String(d)) : [];
    const path = Array.isArray(db?.drillPath) ? db.drillPath.map((d: unknown) => String(d)) : [];
    return [...base.slice(0, 1), ...path];
  }

  /** Measures ({field, alias}) from the saved query config, used to read re-query result rows. */
  private measureDefs(): { field: string; alias: string }[] {
    const raw = (this.spec.databaseConfig as any)?.measures;
    return Array.isArray(raw)
      ? raw
          .map((m: any) => ({ field: String(m?.field ?? ''), alias: String(m?.alias ?? m?.field ?? '') }))
          .filter((m: { field: string; alias: string }) => m.field && m.alias)
      : [];
  }

  /** A widget can drill only if it's a Chart.js chart with more than one dimension and at least one measure. */
  isDrillable(): boolean {
    return !!this.spec.chartType && this.hierarchy().length > 1 && this.measureDefs().length > 0;
  }

  /** True while there's still a finer dimension to drill into below the current level. */
  canDrillDown(): boolean {
    return this.isDrillable() && this.drillStack.length < this.hierarchy().length - 1;
  }

  private prettyField(field: string): string {
    return field ? field.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : field;
  }
  baseDimLabel(): string { return this.prettyField(this.hierarchy()[0] ?? 'All'); }
  /** The next-finer dimension a click would break the current level down into. */
  currentDimLabel(): string { return this.prettyField(this.hierarchy()[this.drillStack.length + 1] ?? ''); }

  // ---- drill actions ----------------------------------------------------------

  /** Click on a bar/point/slice → drill into that category using the next dimension in the hierarchy. */
  private onPointClick(chart: Chart, event: any): void {
    if (!this.canDrillDown() || this.drillLoading) return;
    const els = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
    if (!els.length) return;
    const label = chart.data.labels?.[els[0].index];
    if (label === undefined || label === null) return;
    const field = this.hierarchy()[this.drillStack.length];
    this.loadLevel([...this.drillStack, { field, value: String(label) }]);
  }

  /** Breadcrumb: jump back up to a given depth (0 = first crumb after the root). */
  drillUpTo(index: number): void {
    if (index >= this.drillStack.length) return;
    const target = this.drillStack.slice(0, index);
    target.length ? this.loadLevel(target) : this.resetDrill();
  }

  /** Breadcrumb root: return to the widget's original top-level view. */
  resetDrill(): void {
    if (!this.drillStack.length && !this.renderedStack.length) return;
    this.loadLevel([]);
  }

  private resetDrillState(): void {
    this.drillStack = [];
    this.renderedStack = [];
    this.drillLabels = null;
    this.drillDatasets = null;
    this.drillLoading = false;
    this.drillError = '';
  }

  /**
   * Re-query one drill level through the SAME execute-query path the builder uses (no new endpoint or
   * query shape), then re-render the same chart. `target` is the ancestor stack for the level to show.
   */
  private loadLevel(target: DrillStep[]): void {
    const dim = this.hierarchy()[target.length];
    if (!dim) return;

    this.drillStack = target;          // optimistic breadcrumb; reverted on failure
    this.drillLoading = true;
    this.drillError = '';

    this.backend.executeQuery(this.buildLevelConfig(dim, target))
      .then((res) => {
        const rows = res.data ?? [];
        this.drillLabels = rows.map((r) => String(r[dim] ?? ''));
        this.drillDatasets = this.measureDefs().map((m) => ({
          label: m.field,
          data: rows.map((r) => Number(r[m.alias]) || 0),
        }));
        this.renderedStack = target;
        this.drillLoading = false;
        this.render();
      })
      .catch(() => {
        this.drillLoading = false;
        this.drillError = 'Could not load drill-down data.';
        this.drillStack = this.renderedStack;   // keep breadcrumb in sync with what's on screen
      });
  }

  /** Clones the saved query config but groups by a single dimension and adds one '=' filter per ancestor. */
  private buildLevelConfig(dim: string, target: DrillStep[]): Record<string, unknown> {
    // `drillPath` is a client-only hint for the hierarchy; it never goes to the query endpoint.
    const { drillPath, ...base } = (this.spec.databaseConfig ?? {}) as any;
    const baseRules = Array.isArray(base?.filters?.rules) ? base.filters.rules : [];
    const drillRules = target.map((step) => ({ field: step.field, operator: '=', value: step.value }));
    return {
      ...base,
      dimensions: [dim],
      filters: { condition: 'AND', rules: [...baseRules, ...drillRules] },
    };
  }

  // ---- rendering --------------------------------------------------------------

  /** The spec to draw: the drilled labels/series if present, otherwise the untouched base spec. */
  private currentSpec(): WidgetSpec {
    if (this.drillLabels && this.drillDatasets) {
      const trail = this.drillStack.map((s) => s.value).join(' › ');
      return {
        ...this.spec,
        labels: this.drillLabels,
        datasets: this.drillDatasets,
        title: trail ? `${this.spec.title} — ${trail}` : this.spec.title,
      };
    }
    return this.spec;
  }

  private render() {
    this.chart?.destroy();
    this.chart = undefined;
    if (!this.spec.chartType || !this.canvas) return;   // KPI/table update via template bindings

    const cfg = buildChartConfig(this.currentSpec(), true);
    if (this.isDrillable()) {
      cfg.options = cfg.options ?? {};
      cfg.options.onClick = (evt: any, _els: unknown, chart: Chart) => this.onPointClick(chart, evt);
    }
    this.chart = new Chart(this.canvas.nativeElement.getContext('2d')!, cfg);
    this.canvas.nativeElement.style.cursor = this.canDrillDown() ? 'pointer' : 'default';
  }
}

/** Builds a colour sequence that always starts with the user's chosen primary colour. */
function paletteFrom(primary: string): string[] {
  const rest = PALETTE.filter(c => c.toLowerCase() !== primary.toLowerCase());
  return [primary, ...rest];
}

/** Shared Chart.js config builder — used by tiles and the builder preview. */
export function buildChartConfig(s: WidgetSpec, compact: boolean): any {
  const fontSize = compact ? 10 : 11;
  const pointSize = compact ? 3 : 4;
  const colors = paletteFrom(s.primary);
  let data: any;

  if (s.chartType === 'scatter') {
    data = { datasets: [{ label: s.datasets[0]?.label ?? '', data: s.points ?? [], backgroundColor: s.primary, pointRadius: pointSize + 2 }] };
  } else if (s.multiColor) {
    // pie / doughnut / polar — one series, many colours
    data = { labels: s.labels, datasets: [{ data: s.datasets[0]?.data ?? [], backgroundColor: colors, borderColor: '#fff', borderWidth: 2 }] };
  } else {
    // bar / line / area / radar — one dataset per measure
    data = {
      labels: s.labels,
      datasets: s.datasets.map((d, i) => {
        const c = colors[i % colors.length];
        return {
          label: d.label,
          data: d.data,
          backgroundColor: s.fill ? c + '22' : c,
          borderColor: c,
          borderWidth: (s.chartType === 'line' || s.chartType === 'radar') ? 2.5 : 0,
          fill: s.fill,
          tension: 0.4,
          pointRadius: (s.chartType === 'line' || s.chartType === 'radar') ? pointSize : 0,
          borderRadius: s.chartType === 'bar' ? (compact ? 5 : 6) : 0
        };
      })
    };
  }

  const showLegend = s.multiColor || s.datasets.length > 1;
  const cartesian = s.chartType === 'bar' || s.chartType === 'line';

  const plugins: any = {
    legend: { display: showLegend, position: s.legendPosition || 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: fontSize } } }
  };
  // Custom hover tooltip for every category chart (bar/line/radar/pie/doughnut/polar):
  // an HTML popup describing the hovered point (dimension, value, measure + aggregation, and
  // — for part-to-whole charts — its share of the total). Scatter keeps Chart.js's default,
  // since its points are (x, y) pairs rather than a dimension + measure.
  if (s.chartType && s.chartType !== 'scatter') {
    plugins.tooltip = { enabled: false, external: (ctx: any) => renderMetaTooltip(ctx, s) };
  }

  return {
    type: s.chartType,
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: s.indexAxis,
      plugins,
      scales: s.chartType === 'scatter'
        ? { x: { type: 'linear', position: 'bottom', grid: { color: '#f1f5f9' }, ticks: { font: { size: fontSize }, color: '#94a3b8' } }, y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: fontSize }, color: '#94a3b8' } } }
        : cartesian
          ? { y: { beginAtZero: true, stacked: !!s.stacked, grid: { color: '#f1f5f9' }, ticks: { font: { size: fontSize }, color: '#94a3b8' } }, x: { stacked: !!s.stacked, grid: { display: false }, ticks: { font: { size: fontSize }, color: '#94a3b8' } } }
          : {}
    }
  };
}

/* ------------------------------------------------------------------ *
 *  Custom hover tooltip (frontend-only, additive)
 *  Renders a lightweight HTML popup for the hovered data point using
 *  Chart.js's external-tooltip API. Shows only metadata the chart and
 *  widget config already hold — no underlying records are accessed.
 * ------------------------------------------------------------------ */

/** Formats a measure with its aggregation, e.g. "SUM(revenue)". Falls back to the bare label. */
function measureCaption(s: WidgetSpec, datasetLabel: string): string {
  const label = datasetLabel || 'value';
  const agg = s.editState?.aggregation;
  return agg ? `${agg.toUpperCase()}(${label})` : label;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Injects the popup's CSS once. Dynamically-created nodes miss Angular's view encapsulation,
 *  so the styles live in a single namespaced (`wt-`) global block. */
function ensureTooltipStyles(): void {
  if (typeof document === 'undefined' || document.getElementById('wt-tooltip-styles')) return;
  const style = document.createElement('style');
  style.id = 'wt-tooltip-styles';
  style.textContent = `
    .wt-tooltip { position: absolute; z-index: 20; pointer-events: none;
      transform: translate(-50%, calc(-100% - 10px));
      background: rgba(15,23,42,0.95); color: #f8fafc; border-radius: 8px; padding: 8px 10px;
      font-size: 11px; line-height: 1.35; box-shadow: 0 6px 20px rgba(15,23,42,0.28);
      white-space: nowrap; opacity: 0; transition: opacity 0.12s ease; }
    .wt-tooltip .wt-dim { font-weight: 700; margin-bottom: 5px; color: #fff; }
    .wt-tooltip .wt-row { display: flex; align-items: center; gap: 6px; }
    .wt-tooltip .wt-row + .wt-row { margin-top: 3px; }
    .wt-tooltip .wt-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
    .wt-tooltip .wt-metric { color: #cbd5e1; }
    .wt-tooltip .wt-value { margin-left: auto; padding-left: 14px; font-weight: 700; color: #fff; }
  `;
  document.head.appendChild(style);
}

/**
 * Chart.js external tooltip handler. Builds/positions an HTML popup inside the chart's own
 * (positioned) container — never `position: fixed` — describing the hovered point:
 *   • dimension / x label   • plotted value   • measure + aggregation (e.g. SUM(revenue))
 */
function renderMetaTooltip(context: { chart: Chart; tooltip: any }, s: WidgetSpec): void {
  ensureTooltipStyles();
  const { chart, tooltip } = context;
  const container = chart.canvas.parentNode as HTMLElement | null;
  if (!container) return;

  let el = container.querySelector<HTMLDivElement>('.wt-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.className = 'wt-tooltip';
    container.appendChild(el);
  }

  // Chart.js sets opacity 0 when nothing is hovered.
  if (!tooltip || tooltip.opacity === 0) {
    el.style.opacity = '0';
    return;
  }

  const points: any[] = tooltip.dataPoints ?? [];
  if (points.length) {
    const dimLabel = tooltip.title?.[0] ?? points[0].label ?? '';
    // Per-item colours resolved by Chart.js (a single slice colour for pie/doughnut/polar,
    // the series colour for bar/line/radar) — more reliable than reading the dataset directly.
    const labelColors: any[] = tooltip.labelColors ?? [];
    // Part-to-whole charts show one series in many colours; add each slice's share of the total.
    const multiColor = !!s.multiColor;
    const total = multiColor
      ? (points[0].dataset?.data ?? []).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0)
      : 0;
    const rows = points.map((p, i) => {
      // Part-to-whole charts don't put the measure name on the Chart dataset, so read it from the spec.
      const measureName = multiColor ? (s.datasets[0]?.label ?? '') : (p.dataset?.label ?? '');
      const caption = measureCaption(s, measureName);
      const swatch = multiColor
        ? (labelColors[i]?.backgroundColor ?? s.primary)
        : (p.dataset?.borderColor ?? labelColors[i]?.backgroundColor ?? s.primary);
      const share = multiColor && total ? ` (${Math.round((Number(p.raw) || 0) / total * 100)}%)` : '';
      return `<div class="wt-row">` +
        `<span class="wt-dot" style="background:${escapeHtml(swatch)}"></span>` +
        `<span class="wt-metric">${escapeHtml(caption)}</span>` +
        `<span class="wt-value">${escapeHtml(p.formattedValue)}${escapeHtml(share)}</span>` +
        `</div>`;
    }).join('');
    el.innerHTML = `<div class="wt-dim">${escapeHtml(dimLabel)}</div>${rows}`;
  }

  // caretX/caretY are relative to the canvas, which fills the container. The popup is centred on
  // the caret (translateX -50%), so clamp X to keep edge points' tooltips from spilling outside the tile.
  el.style.opacity = '1';
  const half = el.offsetWidth / 2;
  const maxX = container.clientWidth - half;
  const x = Math.max(half, Math.min(tooltip.caretX, maxX));
  el.style.left = `${x}px`;
  el.style.top = `${tooltip.caretY}px`;
}
