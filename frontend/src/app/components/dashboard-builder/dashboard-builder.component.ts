import { Component, ElementRef, ViewChild, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Chart, registerables } from 'chart.js';
import { WidgetTileComponent, WidgetSpec, WidgetEditState, Series, buildChartConfig } from './widget-tile.component';
import { ChartCompatibilityService, Column, VizDef } from '../../services/chart-compatibility.service';
import { BackendIntegrationService, DatasetSummary } from '../../services/backend-integration.service';
import { DashboardRecord, DashboardService, SaveDashboardRequest } from '../../services/dashboard.service';

Chart.register(...registerables);

interface VizCard extends VizDef { iconSafe: SafeHtml; }
interface ChartMeta { t: WidgetSpec['chartType']; axis: 'x' | 'y'; fill: boolean; multi: boolean; radial: boolean; }

@Component({
  selector: 'app-dashboard-builder',
  standalone: true,
  imports: [CommonModule, RouterLink, WidgetTileComponent],
  templateUrl: './dashboard-builder.component.html',
  styleUrls: ['./dashboard-builder.component.css']
})
export class DashboardBuilderComponent implements OnInit {
  selectedCols: Column[] = [];
  selectedViz: string | null = null;
  vizCards: VizCard[];

  // ---- datasets loaded live from the database ----
  datasets: DatasetSummary[] = [];
  selectedDatasetId = '';
  selectedDatasetIds: string[] = [];
  loadingDatasets = false;
  datasetError = '';
  /** Real rows for the active dataset (keys = original column names); null in demo mode. Used for scatter/table/fallback. */
  private realRows: Record<string, unknown>[] | null = null;
  /** Cache of numeric column name → 'I' (integer) or 'D' (double), inferred from the loaded row values. */
  private numKind = new Map<string, 'I' | 'D'>();
  /** The active dataset's upload id, used for server-side aggregate queries. */
  private uploadId: string | null = null;
  /** Server-computed aggregation: dimension value → { measure → aggregated number }. Full dataset, no 500 cap. */
  private serverAgg: Map<string, Record<string, number>> | null = null;
  /** Distinct dimension values from the server aggregation (full dataset). */
  private serverLabels: string[] | null = null;
  /** Server-computed KPI totals: measure → aggregated number (whole dataset). */
  private serverKpi: Record<string, number> | null = null;
  /** Guards against a slow aggregate response overwriting a newer one. */
  private aggRequestId = 0;

  selPalette = 0;
  legendPos = 'Bottom';
  palette = ['#2563eb', '#64748b', '#cbd5e1', '#1e293b', '#93c5fd'];

  committedWidgets: WidgetSpec[] = [];
  /** When set, the builder is editing this existing widget; Apply updates it in place instead of adding a new one. */
  editingWidgetId: number | null = null;
  private widgetSeq = 0;
  trackWidget = (_: number, w: WidgetSpec) => w.id;

  previewKpi = 0;
  previewColumns: string[] = [];
  previewRows: (string | number)[][] = [];
  saveBusy = false;
  saveMessage = '';
  private pendingDashboardId: string | null = null;
  private dashboardLoadedFromRoute = false;

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

  constructor(
    public compat: ChartCompatibilityService,
    private sanitizer: DomSanitizer,
    private backend: BackendIntegrationService,
    private dashboardService: DashboardService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.vizCards = compat.vizTypes.map(v => ({ ...v, iconSafe: this.sanitizer.bypassSecurityTrustHtml(v.icon) }));
  }

  ngOnInit(): void {
    this.pendingDashboardId = this.route.snapshot.queryParamMap.get('dashboardId');
    this.loadDatasets();
  }

  /** Loads the list of datasets stored in the database for the picker. */
  async loadDatasets(): Promise<void> {
    this.loadingDatasets = true;
    this.datasetError = '';
    try {
      this.datasets = await this.backend.listDatasets();
    } catch {
      this.datasetError = 'Could not reach the backend (localhost:8081) — showing demo columns.';
    } finally {
      this.loadingDatasets = false;
      this.tryLoadDashboardFromRoute();
    }
  }

  private tryLoadDashboardFromRoute(): void {
    if (this.dashboardLoadedFromRoute || !this.pendingDashboardId || this.loadingDatasets) {
      return;
    }

    this.dashboardLoadedFromRoute = true;
    this.dashboardService.getDashboardRecord(this.pendingDashboardId).subscribe({
      next: async (dashboard) => {
        await this.restoreDashboardState(dashboard);
        this.saveMessage = `Loaded dashboard: ${dashboard.name}`;
      },
      error: () => {
        this.saveMessage = 'Could not load selected dashboard.';
      }
    });
  }

  private async activateDatasetById(id: string, resetState: boolean): Promise<void> {
    await this.activateDatasets(id ? [id] : [], resetState);
  }

  /**
   * Loads one or more datasets and merges their columns + rows into the picker.
   * Columns are de-duplicated by name (first dataset wins on a name clash). Server-side aggregation
   * is only used when exactly one dataset is active (a single DB table); with several selected we
   * fall back to the in-browser aggregation over the merged rows.
   */
  private async activateDatasets(ids: string[], resetState: boolean): Promise<void> {
    this.selectedDatasetIds = ids;
    this.selectedDatasetId = ids[0] ?? '';
    if (resetState) {
      this.startOver();
    }
    this.uploadId = ids.length === 1 ? ids[0] : null;
    this.serverAgg = null;
    this.serverLabels = null;
    this.serverKpi = null;
    this.numKind.clear();

    if (!ids.length) {
      this.realRows = null;
      this.compat.useDemoColumns();
      return;
    }

    const mergedRows: Record<string, unknown>[] = [];
    const mergedCols: { name: string; type: string }[] = [];
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const id of ids) {
      const data = await this.backend.getDatasetData(id, 10000);
      mergedRows.push(...data.rows);
      data.columns.forEach((name, i) => {
        if (!seen.has(name)) { seen.add(name); mergedCols.push({ name, type: data.types[i] }); }
      });
      labels.push(this.datasets.find(d => d.id === id)?.original_filename ?? id);
    }
    this.realRows = mergedRows;
    const label = labels.length === 1 ? labels[0] : `${labels.length} datasets`;
    this.compat.useRealColumns(label, mergedCols);
  }

  isDatasetSelected(id: string): boolean { return this.selectedDatasetIds.includes(id); }

  /** Adds/removes a dataset from the selection and rebuilds the merged column list. */
  async toggleDataset(id: string): Promise<void> {
    const chosen = new Set(this.selectedDatasetIds);
    chosen.has(id) ? chosen.delete(id) : chosen.add(id);
    // preserve the dataset list order for a stable, predictable column order
    const ids = this.datasets.map(d => d.id).filter(x => chosen.has(x));
    this.datasetError = '';
    this.loadingDatasets = true;
    try {
      await this.activateDatasets(ids, true);
    } catch {
      this.realRows = null;
      this.datasetError = 'Could not load one of the selected datasets.';
    } finally {
      this.loadingDatasets = false;
    }
  }

  private parseChartType(raw: unknown): WidgetSpec['chartType'] {
    const chart = String(raw ?? '');
    if (chart === 'bar' || chart === 'line' || chart === 'doughnut' || chart === 'pie' || chart === 'radar' || chart === 'polarArea' || chart === 'scatter') {
      return chart;
    }
    return null;
  }

  private restoreWidget(index: number, widget: { chart_config_json?: Record<string, unknown>; database_config_json?: Record<string, unknown>; widget_name?: string; }): WidgetSpec | null {
    const chart = widget.chart_config_json ?? {};
    const style = (chart['style'] as Record<string, unknown> | undefined) ?? {};
    const datasets = Array.isArray(chart['datasets']) ? chart['datasets'] as Series[] : [];
    const labels = Array.isArray(chart['labels']) ? chart['labels'].map((l) => String(l)) : [];
    const tableColumns = Array.isArray(chart['tableColumns']) ? chart['tableColumns'].map((c) => String(c)) : [];
    const tableRows = Array.isArray(chart['tableRows']) ? chart['tableRows'].map((row) => Array.isArray(row) ? row.map((v) => (typeof v === 'number' || typeof v === 'string') ? v : String(v ?? '')) : []) : [];
    const viz = String(chart['viz'] ?? 'table');

    return {
      id: index + 1,
      viz,
      title: String(chart['title'] ?? widget.widget_name ?? 'Widget'),
      chartType: this.parseChartType(chart['chartType']),
      labels,
      datasets,
      points: Array.isArray(chart['points']) ? chart['points'] as { x: number; y: number }[] : undefined,
      primary: String(style['primary'] ?? this.palette[0]),
      fill: Boolean(style['fill'] ?? false),
      multiColor: Boolean(style['multiColor'] ?? false),
      radial: Boolean(style['radial'] ?? false),
      indexAxis: style['indexAxis'] === 'y' ? 'y' : 'x',
      showLegend: Boolean(style['showLegend'] ?? false),
      legendPosition: style['legendPosition'] === 'right' || style['legendPosition'] === 'top' ? style['legendPosition'] as 'bottom' | 'right' | 'top' : 'bottom',
      stacked: Boolean(style['stacked'] ?? false),
      kpiTotal: typeof chart['kpiTotal'] === 'number' ? chart['kpiTotal'] as number : undefined,
      kpiLabel: chart['kpiLabel'] ? String(chart['kpiLabel']) : undefined,
      tableColumns,
      tableRows,
      databaseConfig: widget.database_config_json
    };
  }

  private async restoreDashboardState(dashboard: DashboardRecord): Promise<void> {
    this.saveMessage = '';
    this.startOver();
    this.committedWidgets = [];

    const widgets = dashboard.widgets ?? [];
    if (!widgets.length) {
      return;
    }

    const firstDbConfig = (widgets[0].database_config_json ?? {}) as Record<string, unknown>;
    const datasetTable = String(firstDbConfig['dataset'] ?? '');
    if (datasetTable) {
      const dataset = this.datasets.find((d) => d.table_name === datasetTable);
      if (dataset) {
        try {
          await this.activateDatasetById(dataset.id, false);
        } catch {
          this.datasetError = 'Dashboard loaded, but source dataset could not be restored.';
        }
      }
    }

    const restored = widgets
      .map((widget, index) => this.restoreWidget(index, widget))
      .filter((w): w is WidgetSpec => w !== null);

    this.committedWidgets = restored;
    this.widgetSeq = restored.reduce((max, w) => Math.max(max, w.id), 0);
    this.refreshPreview();
  }

  /**
   * Asks PostgreSQL to group + aggregate the current dimension/measure selection (full dataset, no
   * 500-row cap) and stores the result. currentAllLabels()/rawValuesFor()/KPI then prefer this over
   * the in-browser fallback. Guarded by a request id so a slow response can't overwrite a newer one.
   */
  private async refreshServerAgg(): Promise<void> {
    const requestId = ++this.aggRequestId;
    this.serverAgg = null; this.serverLabels = null; this.serverKpi = null;
    if (!this.compat.usingRealData || !this.uploadId) return;

    const dims = this.dimCols();
    const meas = this.measureCols();
    if (meas.length === 0) return;                     // nothing numeric to aggregate
    if (dims.length > 1) return;                       // only single-dimension grouping is supported server-side
    const agg = this.aggregation.toUpperCase();
    const measures = meas.map(m => ({ field: m.name, agg }));

    try {
      const dimName = dims.length === 1 ? dims[0].name : null;
      const res = await this.backend.aggregate(this.uploadId, { dimension: dimName, measures });
      if (requestId !== this.aggRequestId) return;     // a newer request superseded this one
      if (dimName) {
        const map = new Map<string, Record<string, number>>();
        const labels: string[] = [];
        for (const row of res.rows) {
          const label = String(row[dimName]);
          const rec: Record<string, number> = {};
          for (const m of meas) rec[m.name] = Number(row[m.name]) || 0;
          map.set(label, rec);
          labels.push(label);
        }
        this.serverAgg = map;
        this.serverLabels = labels;
      } else {
        const rec: Record<string, number> = {};
        for (const m of meas) rec[m.name] = res.rows.length ? Number(res.rows[0][m.name]) || 0 : 0;
        this.serverKpi = rec;
      }
      this.refreshPreview();
    } catch {
      // Backend unavailable — fall back to the in-browser aggregation on realRows.
    }
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
  /** Single-letter type badge: S = String, I = Integer, D = Double, T = Date/Time. */
  glyph(c: Column): string {
    if (c.type === 'date') return 'T';
    if (c.type !== 'number') return 'S';
    return this.numericKind(c.name);
  }

  /** Full type name for the badge tooltip. */
  typeLabel(c: Column): string {
    if (c.type === 'date') return 'Date';
    if (c.type !== 'number') return 'String';
    return this.numericKind(c.name) === 'I' ? 'Integer' : 'Double';
  }

  /** Decides Integer vs Double for a numeric column by sampling its real values. Cached per column. */
  private numericKind(name: string): 'I' | 'D' {
    const cached = this.numKind.get(name);
    if (cached) return cached;
    let kind: 'I' | 'D' = 'I';
    const rows = this.realRows;
    if (rows && rows.length) {
      let seen = 0;
      for (const r of rows) {
        const v = r[name];
        if (v === null || v === undefined || v === '') continue;
        const n = Number(v);
        if (!Number.isFinite(n)) continue;
        if (!Number.isInteger(n)) { kind = 'D'; break; }
        if (++seen >= 500) break;   // enough of a sample to trust "all integers"
      }
    }
    this.numKind.set(name, kind);
    return kind;
  }
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
    this.syncLabelFilter();
    this.refreshServerAgg();
    this.refreshPreview();
  }

  pickViz(key: string) {
    if (!this.allowed(key)) return;
    this.selectedViz = key;
    this.refreshServerAgg();
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
    this.editingWidgetId = null;
    this.selectedCols = []; this.selectedViz = null;
    this.previewKpi = 0; this.previewColumns = []; this.previewRows = [];
    this.filterKey = null; this.activeLabels = []; this.granularity = 'monthly'; this.topNOption = 'all';
    this.aggregation = 'sum'; this.rangeMin = null; this.rangeMax = null; this.chipSearch = ''; this.chipsExpanded = false;
    this.serverAgg = null; this.serverLabels = null; this.serverKpi = null;
    this.destroyChart();
  }

  addWidget() {
    if (this.hasColumns() && this.selectedViz && this.allowed(this.selectedViz)) {
      const spec = this.specFor();
      spec.databaseConfig = this.buildQueryBuilderConfig();
      spec.editState = this.captureEditState();
      const editId = this.editingWidgetId;
      if (editId != null && this.committedWidgets.some(w => w.id === editId)) {
        // update the existing widget in place (keeps its id + position on the canvas)
        spec.id = editId;
        this.committedWidgets = this.committedWidgets.map(w => w.id === editId ? spec : w);
      } else {
        spec.id = ++this.widgetSeq;
        this.committedWidgets.push(spec);
      }
    }
    this.startOver();
  }

  /** Exit edit mode without changing the widget (it stays on the canvas as-is). */
  cancelEdit() {
    this.startOver();
    this.saveMessage = '';
  }

  /** Best-effort rebuild of a widget's edit state from its stored query config (for widgets with no snapshot). */
  private reconstructEditState(w: WidgetSpec): WidgetEditState | null {
    const cfg = w.databaseConfig as any;
    if (!cfg) return null;
    const dimensions: string[] = Array.isArray(cfg.dimensions) ? cfg.dimensions : [];
    const measures: any[] = Array.isArray(cfg.measures) ? cfg.measures : [];
    const colNames = [...dimensions, ...measures.map(m => m?.field).filter(Boolean)];
    if (!colNames.length) return null;

    const ds = this.datasets.find(d => d.table_name === cfg.dataset);
    const aggRaw = String(measures[0]?.aggregation ?? 'sum').toLowerCase();
    const aggregation = (['sum', 'avg', 'min', 'max'].includes(aggRaw) ? aggRaw : 'sum') as WidgetEditState['aggregation'];

    const rules: any[] = cfg.filters?.rules ?? [];
    let activeLabels: string[] = [];
    let rangeMin: number | null = null;
    let rangeMax: number | null = null;
    for (const r of rules) {
      if (r?.operator === 'IN' && Array.isArray(r.values)) activeLabels = r.values.map(String);
      if (r?.operator === '>=' && typeof r.value === 'number') rangeMin = r.value;
      if (r?.operator === '<=' && typeof r.value === 'number') rangeMax = r.value;
    }

    let topNOption: WidgetEditState['topNOption'] = 'all';
    const sort = cfg.sorting?.[0];
    const top = cfg.pagination?.top;
    if (sort && (top === 3 || top === 5)) {
      topNOption = sort.direction === 'ASC' ? 'bottom3' : (top === 5 ? 'top5' : 'top3');
    }

    return {
      datasetIds: ds ? [ds.id] : [],
      colNames,
      viz: w.viz,
      filterKey: null,
      activeLabels,
      granularity: 'monthly',
      topNOption,
      aggregation,
      rangeMin,
      rangeMax,
      selPalette: 0,
      legendPos: this.legendPos
    };
  }

  /** Snapshots the current builder inputs so the widget can be reloaded and edited later. */
  private captureEditState(): WidgetEditState {
    return {
      datasetIds: [...this.selectedDatasetIds],
      colNames: this.selectedCols.map(c => c.name),
      viz: this.selectedViz,
      filterKey: this.filterKey,
      activeLabels: [...this.activeLabels],
      granularity: this.granularity,
      topNOption: this.topNOption,
      aggregation: this.aggregation,
      rangeMin: this.rangeMin,
      rangeMax: this.rangeMax,
      selPalette: this.selPalette,
      legendPos: this.legendPos
    };
  }

  /**
   * Pulls a committed widget back into the builder for editing: restores its datasets, columns,
   * visualization and filters, then removes it from the canvas so re-clicking Apply saves the changes.
   */
  async editWidget(id: number): Promise<void> {
    const widget = this.committedWidgets.find(w => w.id === id);
    if (!widget) return;
    // Prefer the captured snapshot; otherwise rebuild it from the stored query config (older / restored widgets).
    const es = widget.editState ?? this.reconstructEditState(widget);
    if (!es) {
      this.saveMessage = 'This widget has no editable configuration.';
      return;
    }

    // Resolve the datasets to reload. IDs can go stale (a re-uploaded file gets a new id), so keep only
    // ids that still exist and, if none survive, fall back to matching by the stored table name.
    let datasetIds = es.datasetIds.filter(did => this.datasets.some(d => d.id === did));
    if (!datasetIds.length) {
      const tableName = (widget.databaseConfig as any)?.dataset;
      const byName = tableName ? this.datasets.find(d => d.table_name === tableName) : undefined;
      if (byName) datasetIds = [byName.id];
    }

    // Reload the datasets this widget was built from so its columns are available again.
    this.loadingDatasets = true;
    this.datasetError = '';
    try {
      await this.activateDatasets(datasetIds, true);   // resets builder state + rebuilds the column list
    } catch {
      this.datasetError = 'Could not reload the dataset(s) for this widget.';
    } finally {
      this.loadingDatasets = false;
    }

    // Mark which widget we're editing (set AFTER activateDatasets, whose reset would otherwise clear it).
    // The widget stays on the canvas; clicking Update replaces it in place.
    this.editingWidgetId = id;

    // Restore the editing inputs from the snapshot.
    this.selectedCols = es.colNames
      .map(name => this.compat.columns.find(c => c.name === name))
      .filter((c): c is Column => !!c);
    this.selectedViz = es.viz;
    this.filterKey = es.filterKey;
    this.activeLabels = [...es.activeLabels];
    this.granularity = es.granularity;
    this.topNOption = es.topNOption;
    this.aggregation = es.aggregation;
    this.rangeMin = es.rangeMin;
    this.rangeMax = es.rangeMax;
    this.selPalette = es.selPalette;
    this.legendPos = es.legendPos;

    // Older / DB-restored widgets may have no stored label filter — rebuild it so the axis isn't empty.
    if (!this.activeLabels.length) {
      const dimName = this.currentDimName();
      if (dimName) this.activeLabels = this.axisFor(dimName, true).map(a => a.label);
    }

    if (es.colNames.length && this.selectedCols.length < es.colNames.length) {
      this.saveMessage = `Editing "${widget.title}" — some columns couldn't be restored because their dataset is no longer available. Re-pick the columns, then click Update.`;
    } else {
      this.saveMessage = `Editing "${widget.title}" — change the columns/filters and click Update.`;
    }

    await this.refreshServerAgg();
    this.refreshPreview();
  }

  hasSomethingToSave(): boolean {
    return this.committedWidgets.length > 0 || this.canSaveCurrentSelection();
  }

  canSaveCurrentSelection(): boolean {
    return this.hasColumns() && !!this.selectedViz && this.allowed(this.selectedViz);
  }

  private toAlias(field: string): string {
    return field.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  }

  private buildQueryBuilderConfig(): Record<string, unknown> {
    const dimensions = this.dimCols().map((d) => d.name);
    const measures = this.measureCols().map((m) => ({
      field: m.name,
      aggregation: this.aggregation.toUpperCase(),
      alias: `${this.aggregation}_${this.toAlias(m.name)}`
    }));

    const rules: Array<Record<string, unknown>> = [];
    const dimName = this.currentDimName();
    if (dimName) {
      const allLabels = this.allLabelsForFilter();
      if (this.activeLabels.length > 0 && this.activeLabels.length < allLabels.length) {
        rules.push({
          field: dimName,
          operator: 'IN',
          values: this.activeLabels
        });
      }
    }

    const primaryMeasure = this.measureCols()[0]?.name;
    if (primaryMeasure && this.rangeMin != null) {
      rules.push({ field: primaryMeasure, operator: '>=', value: this.rangeMin });
    }
    if (primaryMeasure && this.rangeMax != null) {
      rules.push({ field: primaryMeasure, operator: '<=', value: this.rangeMax });
    }

    let sorting: Array<Record<string, unknown>> = [];
    let pagination: Record<string, unknown> = { top: 100, offset: 0 };
    if (primaryMeasure && this.topNOption !== 'all') {
      const alias = `${this.aggregation}_${this.toAlias(primaryMeasure)}`;
      const top = this.topNOption === 'top5' ? 5 : 3;
      const direction = this.topNOption === 'bottom3' ? 'ASC' : 'DESC';
      sorting = [{ field: alias, direction }];
      pagination = { top, offset: 0 };
    }

    const dataset = this.datasets.find((d) => d.id === this.selectedDatasetId)?.table_name ?? '';

    return {
      dataset,
      dimensions,
      measures,
      filters: { condition: 'AND', rules },
      having: [],
      sorting,
      pagination
    };
  }

  saveDashboard() {
    if (this.saveBusy || !this.hasSomethingToSave()) {
      return;
    }

    const suggestedName = `Dashboard ${new Date().toLocaleString()}`;
    const enteredName = window.prompt('Dashboard name:', suggestedName);
    if (enteredName === null) {
      return;
    }

    const widgetsToSave = this.committedWidgets.length
      ? this.committedWidgets
      : (() => {
          const spec = this.specFor();
          spec.id = ++this.widgetSeq;
          spec.databaseConfig = this.buildQueryBuilderConfig();
          return [spec];
        })();

    const payload: SaveDashboardRequest = {
      user_id: 'anonymous',
      name: enteredName.trim() || suggestedName,
      description: this.compat.usingRealData
        ? `Built from ${this.compat.datasetLabel ?? 'dataset'}`
        : 'Built in demo mode',
      widgets: widgetsToSave.map((widget) => ({
        widget_name: widget.title || widget.viz,
        layout_json: { widget_id: widget.id },
        chart_config_json: {
          viz: widget.viz,
          chartType: widget.chartType,
          title: widget.title,
          labels: widget.labels,
          datasets: widget.datasets,
          points: widget.points,
          kpiTotal: widget.kpiTotal,
          kpiLabel: widget.kpiLabel,
          tableColumns: widget.tableColumns,
          tableRows: widget.tableRows,
          style: {
            primary: widget.primary,
            fill: widget.fill,
            multiColor: widget.multiColor,
            radial: widget.radial,
            indexAxis: widget.indexAxis,
            showLegend: widget.showLegend,
            legendPosition: widget.legendPosition,
            stacked: widget.stacked
          }
        },
        database_config_json: widget.databaseConfig || this.buildQueryBuilderConfig()
      }))
    };

    this.saveBusy = true;
    this.saveMessage = 'Saving dashboard...';
    this.dashboardService.createDashboardRecord(payload).subscribe({
      next: () => {
        this.saveBusy = false;
        this.saveMessage = 'Dashboard saved to database.';
        this.router.navigate(['/dashboards']);
      },
      error: () => {
        this.saveBusy = false;
        this.saveMessage = 'Could not save dashboard. Please check backend connection on localhost:8081.';
      }
    });
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

  // ---- category / date filter for the single selected dimension ----
  activeLabels: string[] = [];
  granularity: 'monthly' | 'quarterly' | 'half-yearly' | 'yearly' = 'monthly';
  topNOption: 'all' | 'top3' | 'top5' | 'bottom3' = 'all';
  aggregation: 'sum' | 'avg' | 'min' | 'max' = 'sum';
  rangeMin: number | null = null;
  rangeMax: number | null = null;
  chipSearch = '';
  chipsExpanded = false;
  private filterKey: string | null = null;
  private static readonly MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  /** Rows-per-category to simulate, so aggregation choices are meaningful even on this demo's one-value dataset. */
  private readonly sampleSize = 4;

  currentDimName(): string | null {
    const dims = this.dimCols();
    return dims.length === 1 ? dims[0].name : null;
  }

  currentDimType(): 'string' | 'date' | null {
    const dims = this.dimCols();
    return dims.length === 1 ? (dims[0].type as 'string' | 'date') : null;
  }

  /** Distinct values of a dimension: server-aggregated (full dataset) if available, else the fetched rows, else demo. */
  private currentAllLabels(dimName: string): string[] {
    if (this.serverLabels && this.currentDimName() === dimName) return this.serverLabels;
    if (this.realRows) {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const row of this.realRows) {
        const v = row[dimName];
        if (v === null || v === undefined) continue;
        const s = String(v);
        if (!seen.has(s)) { seen.add(s); out.push(s); }
      }
      return out;
    }
    return this.compat.labelsFor(dimName);
  }

  /** All numeric values of a measure across the whole real dataset (used for KPI / no-dimension aggregation). */
  private realMeasureValues(measure: string): number[] {
    if (!this.realRows) return [];
    return this.realRows.map(r => Number(r[measure])).filter(n => Number.isFinite(n));
  }

  /** Calendar-correct quarter/half/year key for a label — parses real dates when possible, falls back to month-name matching. */
  private calendarKey(label: string): { quarter: string; half: string; year: string; sortIdx: number } {
    const d = new Date(label);
    if (!isNaN(d.getTime()) && /\d{4}/.test(label)) {
      const year = d.getFullYear();
      const month = d.getMonth(); // 0-11, real calendar month
      return { quarter: `${year}-Q${Math.floor(month / 3) + 1}`, half: `${year}-H${month < 6 ? 1 : 2}`, year: `${year}`, sortIdx: year * 12 + month };
    }
    const month = DashboardBuilderComponent.MONTH_NAMES.findIndex(m => label.toLowerCase().startsWith(m));
    const m = month >= 0 ? month : 0;
    return { quarter: `Q${Math.floor(m / 3) + 1}`, half: `H${m < 6 ? 1 : 2}`, year: 'Year 1', sortIdx: m };
  }

  /** Buckets a date dimension's raw labels into quarters/halves/years by real calendar meaning, not array position; null means "use raw labels". */
  private bucketsFor(dimName: string): { label: string; idxs: number[] }[] | null {
    if (this.currentDimType() !== 'date' || this.granularity === 'monthly') return null;
    const all = this.currentAllLabels(dimName);
    const groups = new Map<string, { idxs: number[]; sortIdx: number }>();
    all.forEach((label, i) => {
      const k = this.calendarKey(label);
      const key = this.granularity === 'quarterly' ? k.quarter : this.granularity === 'half-yearly' ? k.half : k.year;
      if (!groups.has(key)) groups.set(key, { idxs: [], sortIdx: k.sortIdx });
      groups.get(key)!.idxs.push(i);
    });
    return Array.from(groups.entries())
      .sort((a, b) => a[1].sortIdx - b[1].sortIdx)
      .map(([label, g]) => ({ label, idxs: g.idxs }));
  }

  private hashStr(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /**
   * The underlying numeric values for one category of the current dimension + a measure.
   * Real mode: the actual matching rows from the database. Demo mode: a seeded stand-in so
   * Sum/Average/Min/Max still differ on the one-value-per-category demo dataset.
   */
  private rawValuesFor(measure: string, category: string): number[] {
    // Prefer the server-side aggregate (already grouped per category, full dataset).
    if (this.serverAgg) {
      const rec = this.serverAgg.get(category);
      return rec && rec[measure] !== undefined ? [rec[measure]] : [];
    }
    if (this.realRows) {
      const dimName = this.currentDimName();
      if (!dimName) return [];
      return this.realRows
        .filter(r => String(r[dimName]) === category)
        .map(r => Number(r[measure]))
        .filter(n => Number.isFinite(n));
    }
    const base = measure === 'costUsd' ? 4000 : measure === 'tickets' ? 600 : 25;
    let seed = this.hashStr(`${measure}::${category}`);
    const out: number[] = [];
    for (let i = 0; i < this.sampleSize; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      out.push(Math.round(base * (0.35 + seed / 4294967296)));
    }
    return out;
  }

  private aggregateValues(values: number[]): number {
    if (!values.length) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    switch (this.aggregation) {
      case 'avg': return Math.round(sum / values.length);
      case 'min': return Math.min(...values);
      case 'max': return Math.max(...values);
      default: return sum;
    }
  }

  /** Aggregated value for one axis entry — may span several raw category indices (e.g. all months in a quarter). */
  private categoryValue(measure: string, idxs: number[], allLabels: string[]): number {
    const raw = idxs.flatMap(i => this.rawValuesFor(measure, allLabels[i]));
    return this.aggregateValues(raw);
  }

  /** Resolved x-axis entries (label + contributing source indices), optionally ignoring the active filter. */
  private axisFor(dimName: string, ignoreFilter = false): { label: string; idxs: number[] }[] {
    const buckets = this.bucketsFor(dimName);
    const all = buckets ?? this.currentAllLabels(dimName).map((l, i) => ({ label: l, idxs: [i] }));
    if (ignoreFilter) return all;
    const filtered = all.filter(a => this.activeLabels.includes(a.label));
    // Never let a stale/empty filter blank the chart — fall back to all categories.
    return filtered.length ? filtered : all;
  }

  private syncLabelFilter() {
    const dimName = this.currentDimName();
    if (!dimName) { this.filterKey = null; this.activeLabels = []; return; }
    const key = dimName + '|' + this.granularity;
    if (this.filterKey !== key) {
      this.filterKey = key;
      this.topNOption = 'all';
      this.rangeMin = null; this.rangeMax = null;
      this.chipSearch = ''; this.chipsExpanded = false;
      this.activeLabels = this.axisFor(dimName, true).map(a => a.label);
    }
  }

  showFilter(): boolean { return this.hasColumns() && this.currentDimName() !== null; }
  allLabelsForFilter(): string[] { const n = this.currentDimName(); return n ? this.axisFor(n, true).map(a => a.label) : []; }
  isLabelActive(label: string): boolean { return this.activeLabels.includes(label); }

  toggleLabel(label: string) {
    if (this.isLabelActive(label)) {
      if (this.activeLabels.length > 1) this.activeLabels = this.activeLabels.filter(l => l !== label);
    } else {
      this.activeLabels = [...this.activeLabels, label];
    }
    this.topNOption = 'all';
    this.refreshPreview();
  }

  resetFilter() {
    this.topNOption = 'all';
    this.activeLabels = this.allLabelsForFilter();
    this.refreshPreview();
  }

  onGranularityChange(e: Event) {
    this.granularity = (e.target as HTMLSelectElement).value as typeof this.granularity;
    this.filterKey = null;
    this.syncLabelFilter();
    this.refreshPreview();
  }

  onTopNChange(e: Event) {
    this.topNOption = (e.target as HTMLSelectElement).value as typeof this.topNOption;
    const dimName = this.currentDimName();
    const meas = this.measureCols();
    if (!dimName || !meas.length || this.topNOption === 'all') {
      this.activeLabels = this.allLabelsForFilter();
      this.refreshPreview();
      return;
    }
    const axis = this.axisFor(dimName, true);
    const allLabels = this.currentAllLabels(dimName);
    const scored = axis.map(a => ({ label: a.label, v: this.categoryValue(meas[0].name, a.idxs, allLabels) }));
    scored.sort((a, b) => this.topNOption === 'bottom3' ? a.v - b.v : b.v - a.v);
    const n = this.topNOption === 'top5' ? 5 : 3;
    this.activeLabels = scored.slice(0, n).map(s => s.label);
    this.refreshPreview();
  }

  onAggregationChange(e: Event) {
    this.aggregation = (e.target as HTMLSelectElement).value as typeof this.aggregation;
    this.refreshServerAgg();
    this.refreshPreview();
  }

  onRangeInput(which: 'min' | 'max', e: Event) {
    const raw = (e.target as HTMLInputElement).value;
    const val = raw === '' ? null : Number(raw);
    if (which === 'min') this.rangeMin = val; else this.rangeMax = val;
  }

  applyRange() {
    const dimName = this.currentDimName();
    const meas = this.measureCols();
    if (!dimName || !meas.length) return;
    const axis = this.axisFor(dimName, true);
    const allLabels = this.currentAllLabels(dimName);
    const kept = axis.filter(a => {
      const v = this.categoryValue(meas[0].name, a.idxs, allLabels);
      if (this.rangeMin != null && v < this.rangeMin) return false;
      if (this.rangeMax != null && v > this.rangeMax) return false;
      return true;
    }).map(a => a.label);
    this.topNOption = 'all';
    this.activeLabels = kept.length ? kept : axis.map(a => a.label);
    this.refreshPreview();
  }

  clearRange() {
    this.rangeMin = null;
    this.rangeMax = null;
    this.resetFilter();
  }

  private filteredChipList(): string[] {
    const all = this.allLabelsForFilter();
    return this.chipSearch ? all.filter(l => l.toLowerCase().includes(this.chipSearch.toLowerCase())) : all;
  }

  onChipSearch(e: Event) { this.chipSearch = (e.target as HTMLInputElement).value; }
  visibleChips(): string[] { const f = this.filteredChipList(); return this.chipsExpanded ? f : f.slice(0, 12); }
  hiddenChipCount(): number { return Math.max(0, this.filteredChipList().length - 12); }
  showMoreToggle(): boolean { return this.filteredChipList().length > 12; }
  toggleChipsExpanded() { this.chipsExpanded = !this.chipsExpanded; }

  private specFor(): WidgetSpec {
    const viz = this.selectedViz!;
    const primary = this.palette[this.selPalette];
    const dims = this.dimCols();
    const meas = this.measureCols();
    const base: WidgetSpec = {
      id: 0, viz, title: '', chartType: null, labels: [], datasets: [],
      primary, fill: false, multiColor: false, radial: false, indexAxis: 'x', showLegend: false,
      legendPosition: this.legendPos.toLowerCase() as WidgetSpec['legendPosition']
    };

    if (viz === 'kpi') {
      const m = meas[0];
      const total = this.serverKpi && this.serverKpi[m.name] !== undefined
        ? this.serverKpi[m.name]
        : this.realRows
          ? this.aggregateValues(this.realMeasureValues(m.name))
          : this.compat.valuesFor(m.name, 6).reduce((a, b) => a + b, 0);
      return { ...base, title: 'Total ' + m.name, kpiTotal: total, kpiLabel: m.name };
    }

    if (viz === 'table') {
      // Real dataset: show the actual rows straight from the database.
      if (this.realRows) {
        const columns = this.selectedCols.map(c => c.name);
        const rows = this.realRows.slice(0, 1000).map(r => this.selectedCols.map(c => {
          const v = r[c.name];
          return (typeof v === 'number' || typeof v === 'string') ? v : String(v ?? '');
        }));
        return { ...base, title: 'Data table', tableColumns: columns, tableRows: rows };
      }
      const dim0 = dims[0];
      const axis = dim0 ? this.axisFor(dim0.name) : null;
      const rowLabels = axis ? axis.map(a => a.label) : this.compat.valuesFor(meas[0].name, 6).map((_, i) => `Row ${i + 1}`);
      const allLabels0 = dim0 ? this.currentAllLabels(dim0.name) : [];
      const columns = this.selectedCols.map(c => c.name);
      const rows = rowLabels.map((label, ri) => {
        const idxs = axis ? axis[ri].idxs : [ri];
        return this.selectedCols.map(c => {
          if (c.type === 'number') return this.categoryValue(c.name, idxs, allLabels0);
          return c === dim0 ? label : this.compat.labelsFor(c.name)[idxs[0] % this.compat.labelsFor(c.name).length];
        });
      });
      return { ...base, title: 'Data table', tableColumns: columns, tableRows: rows };
    }

    const mt = this.meta(viz);

    if (viz === 'scatter') {
      let points: { x: number; y: number }[];
      if (this.realRows) {
        points = this.realRows
          .map(r => ({ x: Number(r[meas[0].name]), y: Number(r[meas[1].name]) }))
          .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
      } else {
        const n = 12;
        const xs = this.compat.valuesFor(meas[0].name, n);
        const ys = this.compat.valuesFor(meas[1].name, n);
        points = xs.map((x, i) => ({ x, y: ys[i] }));
      }
      return { ...base, chartType: 'scatter', title: `${meas[1].name} vs ${meas[0].name}`, points, datasets: [{ label: `${meas[1].name} vs ${meas[0].name}`, data: [] }] };
    }

    const dim = dims[0];
    const axis = this.axisFor(dim.name);
    const labels = axis.map(a => a.label);
    const allLabels = this.currentAllLabels(dim.name);
    const datasets: Series[] = (mt.multi ? [meas[0]] : meas).map(m => ({
      label: m.name,
      data: axis.map(a => this.categoryValue(m.name, a.idxs, allLabels))
    }));
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
    this.chart = new Chart(this._canvas.getContext('2d')!, cfg);
  }
}
