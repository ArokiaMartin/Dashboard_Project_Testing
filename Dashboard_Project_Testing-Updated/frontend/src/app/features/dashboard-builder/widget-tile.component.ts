import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewInit, OnDestroy, OnChanges, SimpleChanges, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { BackendIntegrationService, DrilldownFilter } from '@core/services/backend-integration.service';

Chart.register(...registerables);

export interface Series { label: string; data: number[]; }

/** Grid placement of a widget on the dashboard canvas, in 12-column grid units. */
export interface GridLayout { x: number; y: number; w: number; h: number; }

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
  /** Position + size on the dashboard grid. Assigned when the widget is placed on the canvas. */
  layout?: GridLayout;
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
        <button class="drill-crumb root" (click)="resetDrill()" [disabled]="!canReset()" title="Back to top level">
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
        <div class="tile-chart" *ngIf="showCanvas()"><canvas #cv></canvas></div>

        <div class="tile-kpi" *ngIf="showKpiNumber()" [class.drillable]="canDrillDown()" (click)="onKpiClick()">
          <div class="tk-num">{{ spec.kpiTotal | number }}</div>
          <div class="tk-cap">Total {{ spec.kpiLabel }}</div>
          <div class="tk-trend"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> +12.5%</div>
          <div class="tk-drillhint" *ngIf="canDrillDown()">click to break down by {{ currentDimLabel() }}</div>
        </div>

        <div class="tile-table" *ngIf="showRawTable()">
          <table>
            <thead><tr><th *ngFor="let c of spec.tableColumns">{{ c }}</th></tr></thead>
            <tbody>
              <tr *ngFor="let r of spec.tableRows; let i = index" [class.drillable]="canDrillDown()" (click)="onRawRowClick(i)"><td *ngFor="let cell of r">{{ cell }}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="tile-table" *ngIf="showDrillTable()">
          <table>
            <thead><tr><th *ngFor="let h of drillTableHeaders()">{{ h }}</th></tr></thead>
            <tbody>
              <tr *ngFor="let row of drillTableRows(); let i = index" [class.drillable]="canDrillDown()" (click)="onDrillRowClick(i)"><td *ngFor="let cell of row">{{ cell }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .tile { background: white; border: 1px solid #e8ebf2; border-radius: 12px; padding: 16px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; transition: box-shadow 0.15s, border-color 0.15s; }
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
    .tile-kpi.drillable { cursor: pointer; border-radius: 10px; transition: background 0.15s; }
    .tile-kpi.drillable:hover { background: #f8fafc; }
    .tk-num { font-size: 40px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    .tk-cap { font-size: 12px; color: #94a3b8; text-transform: capitalize; margin-top: 2px; }
    .tk-trend { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: #059669; margin-top: 10px; }
    .tk-drillhint { font-size: 10px; font-weight: 600; color: #2563eb; margin-top: 8px; }
    .tile-table { height: 100%; overflow: auto; }
    .tile-table table { width: 100%; border-collapse: collapse; }
    .tile-table th { text-align: left; padding: 7px 10px; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; border-bottom: 1px solid #eef1f6; position: sticky; top: 0; background: white; }
    .tile-table td { padding: 7px 10px; font-size: 12px; color: #334155; border-bottom: 1px solid #f4f6fb; white-space: nowrap; }
    .tile-table tbody tr.drillable { cursor: pointer; }
    .tile-table tbody tr.drillable:hover td { background: #eff6ff; color: #2563eb; }
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

  // ---- automatic (backend-driven) drill state, charts only ----
  // In auto mode the next dimension is NOT read from a pre-configured drillPath; the backend picks it
  // by cardinality (POST /api/drilldown) and tells us whether a further drill is meaningful. `drillStack`
  // is still the breadcrumb: each entry is {field = the dimension shown at that level, value = clicked}.
  private autoCurrentDim = '';           // dimension currently displayed
  private autoNextDim: string | null = null;  // backend-picked next dimension (null = nothing to drill into)
  private autoEnabled = false;           // backend verdict: is a further drill meaningful?

  constructor(private backend: BackendIntegrationService) {}

  /** Auto mode applies to category charts that carry a measure — the target of the new drill-down. */
  private autoMode(): boolean {
    return !!this.spec.chartType && this.spec.chartType !== 'scatter' && this.measureDefs().length > 0;
  }

  /** The dataset token (upload id) the widget queries. */
  private datasetToken(): string {
    const db = this.spec.databaseConfig as any;
    return db?.dataset ? String(db.dataset) : '';
  }

  /** The level-0 dimension a chart is grouped by (its first configured dimension). */
  private baseChartDim(): string {
    const db = this.spec.databaseConfig as any;
    return Array.isArray(db?.dimensions) && db.dimensions.length ? String(db.dimensions[0]) : '';
  }

  /** First measure as the backend expects it: {field, aggregation, alias}. */
  private primaryMeasure(): { field: string; aggregation: string; alias: string } | null {
    const db = this.spec.databaseConfig as any;
    const raw = Array.isArray(db?.measures) && db.measures.length ? db.measures[0] : null;
    if (!raw || !raw.field) return null;
    const agg = String(raw.aggregation ?? this.spec.editState?.aggregation ?? 'SUM').toUpperCase();
    return { field: String(raw.field), aggregation: agg, alias: String(raw.alias ?? raw.field) };
  }

  ngAfterViewInit() { setTimeout(() => this.initRender(), 0); }

  /** Redraw when the widget is updated in place (same id, new config) — otherwise edits wouldn't show. */
  ngOnChanges(changes: SimpleChanges) {
    if (changes['spec'] && !changes['spec'].firstChange) {
      this.resetDrillState();          // a replaced/edited widget starts fresh at the top level
      setTimeout(() => this.initRender(), 0);
    }
  }

  ngOnDestroy() { this.hideTooltip(); this.chart?.destroy(); }

  /** First paint: show the builder-hydrated data immediately, then (for multi-dimension charts)
   *  refine the base to a clean single-dimension grouping so the hierarchy can be drilled.
   *  KPIs and tables keep their hydrated base view (the number / raw rows) until the user drills. */
  private initRender() {
    this.render();
    if (this.autoMode()) {
      // Backend-driven: keep the widget's own hydrated base chart, but ask the backend whether — and into
      // which dimension — a click can drill (analysis only; data is replaced only once the user drills).
      if (!this.drillLabels) this.loadAuto([], this.baseChartDim(), false);
    } else if (this.spec.chartType && this.isDrillable() && !this.drillLabels) {
      this.loadLevel([]);
    }
  }

  // ---- drill hierarchy helpers ------------------------------------------------

  /**
   * Ordered dimension fields = the drill hierarchy.
   *  • Charts plot one dimension (level 0), then descend through the optional `drillPath`.
   *  • KPIs have no base dimension — the hierarchy is the `drillPath` alone (drilled from the total).
   *  • Tables carry an explicit `drillBase` (their first column) followed by the `drillPath`.
   */
  private hierarchy(): string[] {
    const db = this.spec.databaseConfig as any;
    const path = Array.isArray(db?.drillPath) ? db.drillPath.map((d: unknown) => String(d)) : [];
    if (this.spec.viz === 'kpi') return path;
    const base = db?.drillBase
      ? [String(db.drillBase)]
      : (Array.isArray(db?.dimensions) ? db.dimensions.slice(0, 1).map((d: unknown) => String(d)) : []);
    return [...base, ...path];
  }

  /** Measures ({field, alias}) used to read re-query result rows. Tables carry theirs in `drillMeasures`. */
  private measureDefs(): { field: string; alias: string }[] {
    const db = this.spec.databaseConfig as any;
    const raw = Array.isArray(db?.measures) && db.measures.length
      ? db.measures
      : (Array.isArray(db?.drillMeasures) ? db.drillMeasures : []);
    return Array.isArray(raw)
      ? raw
          .map((m: any) => ({ field: String(m?.field ?? ''), alias: String(m?.alias ?? m?.field ?? '') }))
          .filter((m: { field: string; alias: string }) => m.field && m.alias)
      : [];
  }

  /** A widget is drillable when it has a measure to aggregate and at least one dimension below its base. */
  isDrillable(): boolean {
    if (this.measureDefs().length === 0) return false;
    // Auto mode: any category chart with a measure can attempt a drill; whether a click actually descends
    // is decided per level by the backend (see canDrillDown()).
    if (this.autoMode()) return true;
    if (this.spec.viz === 'kpi') return this.hierarchy().length >= 1;   // total → at least one drill dim
    if (this.spec.viz === 'table') return this.hierarchy().length > 1;  // base column + at least one drill dim
    return !!this.spec.chartType && this.hierarchy().length > 1;
  }

  /** True once the user has drilled away from the base view (bars/table replace the number/raw rows). */
  drillActive(): boolean { return this.drillLabels !== null; }

  /** Whether the breadcrumb root can collapse the view back to its base. */
  canReset(): boolean {
    if (this.autoMode()) return this.drillStack.length > 0;
    if (this.spec.viz === 'kpi' || this.spec.viz === 'table') return this.drillActive() || this.drillStack.length > 0;
    return this.drillStack.length > 0;
  }

  /** True while a click on the current view would drill one level deeper. */
  canDrillDown(): boolean {
    if (!this.isDrillable()) return false;
    // Auto mode: the backend decides per level whether a meaningful next dimension exists.
    if (this.autoMode()) return this.autoEnabled && !!this.autoNextDim && !this.drillLoading;
    if (this.spec.viz === 'kpi' && !this.drillActive()) return true;   // the number always opens its first breakdown
    return this.drillStack.length < this.hierarchy().length - 1;
  }

  private prettyField(field: string): string {
    return field ? field.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : field;
  }
  baseDimLabel(): string {
    if (this.autoMode()) return this.prettyField(this.baseChartDim() || 'All');
    if (this.spec.viz === 'kpi') return this.spec.kpiLabel ? `Total ${this.prettyField(this.spec.kpiLabel)}` : 'Total';
    return this.prettyField(this.hierarchy()[0] ?? 'All');
  }
  /** The next-finer dimension a click would break the current level down into. */
  currentDimLabel(): string {
    if (this.autoMode()) return this.prettyField(this.autoNextDim ?? '');
    if (this.spec.viz === 'kpi' && !this.drillActive()) return this.prettyField(this.hierarchy()[0] ?? '');
    return this.prettyField(this.hierarchy()[this.drillStack.length + 1] ?? '');
  }

  // ---- what the tile body shows (base view vs drilled view) ----
  showCanvas(): boolean { return !!this.spec.chartType || (this.spec.viz === 'kpi' && this.drillActive()); }
  showKpiNumber(): boolean { return this.spec.viz === 'kpi' && !this.drillActive(); }
  showRawTable(): boolean { return this.spec.viz === 'table' && !this.drillActive(); }
  showDrillTable(): boolean { return this.spec.viz === 'table' && this.drillActive(); }

  /** Header row for a drilled table: the current dimension, then one column per aggregated measure. */
  drillTableHeaders(): string[] {
    const dim = this.prettyField(this.hierarchy()[this.drillStack.length] ?? '');
    return [dim, ...(this.drillDatasets ?? []).map((d) => this.prettyField(d.label))];
  }

  /** Body rows for a drilled table: each dimension value with its aggregated measure values. */
  drillTableRows(): (string | number)[][] {
    const labels = this.drillLabels ?? [];
    const datasets = this.drillDatasets ?? [];
    return labels.map((label, i) => [label, ...datasets.map((d) => d.data[i] ?? 0)]);
  }

  // ---- drill actions ----------------------------------------------------------

  /** Push the clicked value onto the stack and load the next-finer level. */
  private drillInto(value: string): void {
    if (!this.canDrillDown() || this.drillLoading) return;
    if (this.autoMode()) {
      // The clicked bar's dimension is the one currently displayed; descend into the backend's next pick.
      const nextDim = this.autoNextDim;
      if (!nextDim) return;
      const crumbs = [...this.drillStack, { field: this.autoCurrentDim, value }];
      this.loadAuto(crumbs, nextDim, true);
      return;
    }
    const field = this.hierarchy()[this.drillStack.length];
    if (!field) return;
    this.loadLevel([...this.drillStack, { field, value }]);
  }

  /** Click on a bar/point/slice → drill into that category using the next dimension in the hierarchy. */
  private onPointClick(chart: Chart, event: any): void {
    const els = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
    if (!els.length) return;
    const label = chart.data.labels?.[els[0].index];
    if (label === undefined || label === null) return;
    this.drillInto(String(label));
  }

  /** Click on a KPI's total → open its first breakdown (grouped by the first drill dimension). */
  onKpiClick(): void {
    if (this.spec.viz !== 'kpi' || this.drillActive() || !this.isDrillable() || this.drillLoading) return;
    this.loadLevel([]);
  }

  /** Click on a raw-table row → drill using that row's first-column (base dimension) value. */
  onRawRowClick(rowIndex: number): void {
    if (!this.canDrillDown() || this.drillLoading) return;
    const db = this.spec.databaseConfig as any;
    const cols = this.spec.tableColumns ?? [];
    const display = db?.drillBaseDisplay ? String(db.drillBaseDisplay) : '';
    let idx = display ? cols.indexOf(display) : 0;
    if (idx < 0) idx = 0;
    const value = (this.spec.tableRows ?? [])[rowIndex]?.[idx];
    if (value === undefined || value === null) return;
    this.drillInto(String(value));
  }

  /** Click on a drilled-table row → drill deeper using that row's dimension value. */
  onDrillRowClick(rowIndex: number): void {
    const value = (this.drillLabels ?? [])[rowIndex];
    if (value === undefined || value === null) return;
    this.drillInto(String(value));
  }

  /** Breadcrumb: jump back up to a given depth (0 = first crumb after the root). */
  drillUpTo(index: number): void {
    if (index >= this.drillStack.length) return;
    if (this.autoMode()) {
      // Crumb 0 collapses to the hydrated base view; deeper crumbs re-query that level (the dimension
      // shown at level `index` is the field recorded on that crumb) with the filters accumulated above it.
      if (index <= 0) { this.resetDrill(); return; }
      const dimAtLevel = this.drillStack[index]?.field;
      if (dimAtLevel === undefined) return;
      this.loadAuto(this.drillStack.slice(0, index), dimAtLevel, true);
      return;
    }
    const target = this.drillStack.slice(0, index);
    target.length ? this.loadLevel(target) : this.resetDrill();
  }

  /** Breadcrumb root: return to the widget's base view (chart base grouping / KPI number / raw table). */
  resetDrill(): void {
    if (this.autoMode()) {
      // Collapse back to the widget's hydrated base chart and refresh the drill verdict (analysis only).
      if (this.drillStack.length || this.drillActive()) {
        this.drillStack = [];
        this.renderedStack = [];
        this.drillLabels = null;
        this.drillDatasets = null;
        this.drillError = '';
        this.loadAuto([], this.baseChartDim(), false);
        this.scheduleRender();
      }
      return;
    }
    if (this.spec.viz === 'kpi' || this.spec.viz === 'table') {
      if (this.drillActive() || this.drillStack.length) this.collapseToBase();
      return;
    }
    if (!this.drillStack.length && !this.renderedStack.length) return;
    this.loadLevel([]);
  }

  /** Drop a KPI/table back to its non-drilled base view (the number / the raw rows). */
  private collapseToBase(): void {
    this.drillStack = [];
    this.renderedStack = [];
    this.drillLabels = null;
    this.drillDatasets = null;
    this.drillError = '';
    this.scheduleRender();
  }

  private resetDrillState(): void {
    this.drillStack = [];
    this.renderedStack = [];
    this.drillLabels = null;
    this.drillDatasets = null;
    this.drillLoading = false;
    this.drillError = '';
    this.autoCurrentDim = '';
    this.autoNextDim = null;
    this.autoEnabled = false;
  }

  /** Deferred render so a toggled *ngIf (e.g. a KPI's drill canvas) exists before we draw into it. */
  private scheduleRender(): void { setTimeout(() => this.render(), 0); }

  /**
   * Backend-driven drill (auto mode): query the current level via POST /api/drilldown and record the
   * server's verdict on the next level (enabled + nextDimension). `crumbs` is the accumulated drill path
   * (each: the dimension shown at that level + the clicked value); `currentDim` is the dimension to group
   * this level by. When `renderData` is false we only refresh the verdict without repainting.
   */
  private loadAuto(crumbs: DrillStep[], currentDim: string, renderData: boolean): void {
    if (this.drillLoading) return;
    const measure = this.primaryMeasure();
    if (!measure) return;

    this.drillStack = crumbs;          // optimistic breadcrumb; reverted on failure
    this.drillLoading = true;
    this.drillError = '';

    const filters: DrilldownFilter[] = crumbs.map((c) => ({ field: c.field, value: c.value }));
    // Carry the widget's own configured filters (category IN, measure ranges, …) so every drill level
    // shows the same data the base widget would — drill-click filters are layered on top.
    const db = this.spec.databaseConfig as any;
    const baseFilters = db?.filters && Array.isArray(db.filters.rules) && db.filters.rules.length
      ? { condition: db.filters.condition ?? 'AND', rules: db.filters.rules }
      : undefined;
    this.backend.drilldown({
      dataset: this.datasetToken(),
      chartType: this.spec.chartType ?? undefined,
      currentDimension: currentDim || null,
      measure,
      filters,
      baseFilters,
      topN: 50,
    })
      .then((res) => {
        this.autoCurrentDim = currentDim;
        this.autoNextDim = res.drilldown?.nextDimension ?? null;
        this.autoEnabled = !!res.drilldown?.enabled;
        if (renderData) {
          const rows = res.data ?? [];
          // The backend aggregates the single primary measure, so render exactly that one series and read
          // the dimension from the other column.
          const aliases = new Set([measure.alias]);
          this.drillLabels = rows.map((r) => this.dimValueOf(r, aliases));
          this.drillDatasets = [{
            label: measure.field,
            data: rows.map((r) => Number(this.rowValue(r, measure.alias)) || 0),
          }];
          this.renderedStack = crumbs;
          this.scheduleRender();
        }
        this.drillLoading = false;
      })
      .catch(() => {
        this.drillLoading = false;
        this.drillError = 'Could not load drill-down data.';
        this.drillStack = this.renderedStack;   // keep breadcrumb in sync with what's on screen
      });
  }

  /** Reads the dimension value from a drilldown row: the single column that isn't a measure alias. */
  private dimValueOf(row: Record<string, unknown>, aliases: Set<string>): string {
    for (const key of Object.keys(row)) {
      if (!aliases.has(key)) return String(row[key] ?? '');
    }
    return '';
  }

  /**
   * Re-query one drill level through the SAME execute-query path the builder uses (no new endpoint or
   * query shape), then re-render. `target` is the ancestor stack for the level to show.
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
        this.drillLabels = rows.map((r) => String(this.rowValue(r, dim) ?? ''));
        this.drillDatasets = this.measureDefs().map((m) => ({
          label: m.field,
          data: rows.map((r) => Number(this.rowValue(r, m.alias)) || 0),
        }));
        this.renderedStack = target;
        this.drillLoading = false;
        this.scheduleRender();
      })
      .catch(() => {
        this.drillLoading = false;
        this.drillError = 'Could not load drill-down data.';
        this.drillStack = this.renderedStack;   // keep breadcrumb in sync with what's on screen
      });
  }

  /** Reads a result-row value by field, tolerating the backend aliasing dots to underscores
   *  (e.g. a `patient.gender` grouping comes back as the `patient_gender` column). */
  private rowValue(row: Record<string, unknown>, field: string): unknown {
    if (row[field] !== undefined) return row[field];
    return row[field.replace(/\./g, '_')];
  }

  /** Clones the saved query config but groups by a single dimension and adds one '=' filter per ancestor. */
  private buildLevelConfig(dim: string, target: DrillStep[]): Record<string, unknown> {
    // Client-only drill hints never go to the query endpoint; measures fall back to a table's drillMeasures.
    const { drillPath, drillBase, drillBaseDisplay, drillMeasures, ...base } = (this.spec.databaseConfig ?? {}) as any;
    const measures = Array.isArray(base?.measures) && base.measures.length
      ? base.measures
      : (Array.isArray(drillMeasures) ? drillMeasures : []);
    const baseRules = Array.isArray(base?.filters?.rules) ? base.filters.rules : [];
    const drillRules = target.map((step) => ({ field: step.field, operator: '=', value: step.value }));
    return {
      ...base,
      dimensions: [dim],
      measures,
      filters: { condition: 'AND', rules: [...baseRules, ...drillRules] },
    };
  }

  // ---- rendering --------------------------------------------------------------

  /** The spec to draw: the drilled labels/series if present, otherwise the untouched base spec.
   *  A drilled KPI renders as a single-colour bar chart of its breakdown. */
  private currentSpec(): WidgetSpec {
    if (this.drillLabels && this.drillDatasets) {
      const trail = this.drillStack.map((s) => s.value).join(' › ');
      const chartType = this.spec.chartType ?? (this.spec.viz === 'kpi' ? 'bar' : null);
      return {
        ...this.spec,
        chartType,
        multiColor: this.spec.viz === 'kpi' ? false : this.spec.multiColor,
        labels: this.drillLabels,
        datasets: this.drillDatasets,
        title: trail ? `${this.spec.title} — ${trail}` : this.spec.title,
      };
    }
    return this.spec;
  }

  /** Chart.js doesn't fire its external-tooltip callback on destroy, so a drilldown that rebuilds
   *  the chart would leave the custom popup frozen on screen. Hide it whenever we (re)render. */
  private hideTooltip(): void {
    const el = this.canvas?.nativeElement?.parentElement?.querySelector<HTMLElement>('.wt-tooltip');
    if (el) el.style.opacity = '0';
  }

  private render() {
    this.hideTooltip();
    this.chart?.destroy();
    this.chart = undefined;

    const eff = this.currentSpec();
    // Tables render via template bindings; charts and drilled KPIs draw on the canvas.
    if (!eff.chartType || this.spec.viz === 'table' || !this.canvas) return;

    const cfg = buildChartConfig(eff, true);
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
