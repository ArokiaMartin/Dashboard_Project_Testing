import { Component, ElementRef, ViewChild, HostListener, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, Subscription } from 'rxjs';
import { Chart, registerables } from 'chart.js';
import { WidgetSpec, WidgetEditState, Series, buildChartConfig } from './widget-tile.component';
import { DashboardGridComponent, defaultGridLayout } from './dashboard-grid.component';
import { ChartCompatibilityService, Column, VizDef } from '@core/services/chart-compatibility.service';
import { BackendIntegrationService, DatasetSummary } from '@core/services/backend-integration.service';
import { DashboardRecord, DashboardWidgetRecord, DashboardService, SaveDashboardRequest } from '@core/services/dashboard.service';
import { ActiveDatasetService, NO_ACTIVE_DATASET } from '@core/services/active-dataset.service';
import { DashboardDraftService } from '@core/services/dashboard-draft.service';

Chart.register(...registerables);

interface VizCard extends VizDef { iconSafe: SafeHtml; }
interface ChartMeta { t: WidgetSpec['chartType']; axis: 'x' | 'y'; fill: boolean; multi: boolean; radial: boolean; }

@Component({
  selector: 'app-dashboard-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DashboardGridComponent],
  templateUrl: './dashboard-builder.component.html',
  styleUrls: ['./dashboard-builder.component.css']
})
export class DashboardBuilderComponent implements OnInit, OnDestroy {
  selectedCols: Column[] = [];
  selectedViz: string | null = null;
  /** Extra dimension columns (display names, ordered) to drill into below the plotted dimension. */
  drillPathNames: string[] = [];
  vizCards: VizCard[];

  // ---- datasets loaded live from the database ----
  datasets: DatasetSummary[] = [];
  selectedDatasetId = '';
  selectedDatasetIds: string[] = [];
  /** Optional second data version (upload id) overlaid on the same chart for version comparison. */
  compareVersionId = '';
  loadingDatasets = false;
  datasetError = '';
  queryError = '';
  /** Real rows for the active dataset (keys = original column names); null in demo mode. Used for scatter/table/fallback. */
  private realRows: Record<string, unknown>[] | null = null;
  /** Display-name -> normalized DB column mapping for execute-query payload generation. */
  private displayToDb = new Map<string, string>();
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
  /** Read-only preview mode (?mode=view): renders only the saved widgets, no editing chrome. */
  viewMode = false;
  /** Name of the dashboard loaded from the route, shown in the view-mode header. */
  loadedDashboardName = '';

  // ---- save-to-dashboard picker modal ----
  showSaveModal = false;
  loadingExisting = false;
  existingDashboards: DashboardRecord[] = [];
  /** Ids of existing dashboards the current widget(s) will be added to. */
  saveTargetIds: string[] = [];
  createNewChecked = false;
  newDashboardName = '';

  railWidth = 240;
  dragging = false;
  private dragStartX = 0;
  private dragStartW = 0;
  private lastWidth = 240;

  private _canvas?: HTMLCanvasElement;
  private chart?: Chart;
  private previewSpec: WidgetSpec | null = null;

  @ViewChild('previewCanvas') set canvasRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this._canvas = ref?.nativeElement;
    if (this._canvas) setTimeout(() => this.refreshPreview(), 0);
  }

  constructor(
    public compat: ChartCompatibilityService,
    private sanitizer: DomSanitizer,
    private backend: BackendIntegrationService,
    private dashboardService: DashboardService,
    private route: ActivatedRoute,
    private router: Router,
    private active: ActiveDatasetService,
    private draft: DashboardDraftService
  ) {
    this.vizCards = compat.vizTypes.map(v => ({ ...v, iconSafe: this.sanitizer.bypassSecurityTrustHtml(v.icon) }));
  }

  private schemaSub?: Subscription;

  ngOnInit(): void {
    this.pendingDashboardId = this.route.snapshot.queryParamMap.get('dashboardId');
    this.viewMode = this.route.snapshot.queryParamMap.get('mode') === 'view' && !!this.pendingDashboardId;
    // Restore the in-progress canvas (e.g. when returning from the full-screen Preview) so the user's
    // widgets and their grid layout survive the round-trip. Skipped when opening a specific saved
    // dashboard from the route, which restores its own widgets instead.
    if (!this.pendingDashboardId && this.draft.widgets().length) {
      this.committedWidgets = this.draft.widgets().map(w => ({ ...w }));
      this.widgetSeq = this.committedWidgets.reduce((max, w) => Math.max(max, w.id), 0);
    }
    this.loadDatasets();
  }

  ngOnDestroy(): void {
    this.schemaSub?.unsubscribe();
  }

  /** Loads the list of datasets stored in the database for the picker. */
  async loadDatasets(): Promise<void> {
    this.loadingDatasets = true;
    this.datasetError = '';
    try {
      await this.active.ensureLoaded();
      this.datasets = await this.backend.listDatasets();
      // Focus the builder on the globally-active dataset (schema). Older datasets stay
      // in the database but are not offered in the picker. Skip when opening a saved
      // dashboard from the route (it restores its own dataset).
      if (this.datasets.length && !this.pendingDashboardId) {
        const target = this.activeSchemaDataset();
        if (target) {
          await this.activateDatasetById(target.id, true);
        }
      }
    } catch {
      this.compat.columns = [];
      this.datasetError = 'Could not reach the backend. Builder preview/save requires backend data.';
    } finally {
      this.loadingDatasets = false;
      this.tryLoadDashboardFromRoute();
      // React to later dataset switches from the sidebar (fresh-build mode only).
      if (!this.schemaSub) {
        this.schemaSub = this.active.activeKey$.subscribe(() => this.onActiveSchemaChanged());
      }
    }
  }

  /** Newest dataset belonging to the globally-active family, or undefined when nothing is selected. */
  private activeSchemaDataset(): DatasetSummary | undefined {
    const scoped = this.datasets.filter((d) => this.active.datasetMatchesActive(d));
    return scoped.length ? scoped[0] : undefined;
  }

  /** Family key of the dataset the builder is currently focused on. */
  private currentFamilyKey(): string {
    const current = this.datasets.find((d) => d.id === this.selectedDatasetId);
    return current ? this.active.familyKeyOf(current) : NO_ACTIVE_DATASET;
  }

  /** When the user switches the active dataset in the sidebar, rebuild on that schema. */
  private onActiveSchemaChanged(): void {
    if (this.pendingDashboardId) {
      return; // editing a specific saved dashboard
    }
    if (this.active.activeKey === this.currentFamilyKey()) {
      return; // already focused on this dataset family
    }
    const target = this.activeSchemaDataset();
    if (target) {
      this.activateDatasetById(target.id, true);
    } else {
      // No dataset for the active selection (e.g. "Select a dataset") -> clear the builder.
      this.activateDatasetById('', true);
    }
  }

  /** One row per uploaded dataset family (its newest version), so the picker lists every dataset. */
  get visibleDatasets(): DatasetSummary[] {
    const seen = new Set<string>();
    const out: DatasetSummary[] = [];
    for (const d of this.datasets) {   // datasets come newest-first
      const key = this.active.familyKeyOf(d);
      if (!seen.has(key)) { seen.add(key); out.push(d); }
    }
    return out;
  }

  /** Display label for a dataset row, falling back to its table name when the upload has no filename. */
  datasetLabel(d: DatasetSummary): string {
    return d.original_filename || d.table_name || 'Untitled dataset';
  }

  /** Radio state: this row is the picked dataset (matched by family so an older version stays selected). */
  isDatasetActive(d: DatasetSummary): boolean {
    if (!this.selectedDatasetId) return false;
    return this.active.familyKeyOf(d) === this.currentFamilyKey();
  }

  /** The dropdown's current value: the listed dataset whose family is active (empty if none picked). */
  get selectedDatasetRowId(): string {
    return this.visibleDatasets.find((d) => this.isDatasetActive(d))?.id ?? '';
  }

  /** Single-select: make this dataset the one the builder works on, replacing any current selection. */
  async selectDataset(id: string): Promise<void> {
    if (this.selectedDatasetIds.length === 1 && this.selectedDatasetIds[0] === id) return;
    this.datasetError = '';
    this.loadingDatasets = true;
    try {
      await this.activateDatasets([id], true);
      const d = this.datasets.find((x) => x.id === id);
      if (d) this.active.setActiveKey(this.active.familyKeyOf(d));
    } catch {
      this.realRows = null;
      this.datasetError = 'Could not load the selected dataset.';
    } finally {
      this.loadingDatasets = false;
    }
  }

  private tryLoadDashboardFromRoute(): void {
    if (this.dashboardLoadedFromRoute || !this.pendingDashboardId || this.loadingDatasets) {
      return;
    }

    this.dashboardLoadedFromRoute = true;
    this.dashboardService.getDashboardRecord(this.pendingDashboardId).subscribe({
      next: async (dashboard) => {
        this.loadedDashboardName = dashboard.name;
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
    this.queryError = '';
    this.numKind.clear();
    this.displayToDb.clear();

    if (!ids.length) {
      this.realRows = null;
      this.compat.columns = [];
      this.compat.usingRealData = false;
      this.compat.datasetLabel = null;
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
        if (!seen.has(name)) {
          seen.add(name);
          mergedCols.push({ name, type: data.types[i] });
          this.displayToDb.set(name, name);
        }
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

  // ---- schema version comparison ----

  /** schema_id of the currently active primary dataset (null for legacy/generic uploads). */
  get activeSchemaId(): string | null {
    return this.datasets.find((d) => d.id === this.selectedDatasetId)?.schema_id ?? null;
  }

  /** All data versions that belong to the active schema, ordered oldest → newest. */
  get schemaVersions(): DatasetSummary[] {
    const sid = this.activeSchemaId;
    if (!sid) return [];
    return this.datasets
      .filter((d) => d.schema_id === sid)
      .sort((a, b) => (a.version_number ?? 0) - (b.version_number ?? 0));
  }

  /** Show the version selector only when the active schema has more than one data version. */
  get showVersionControls(): boolean {
    return this.schemaVersions.length > 1;
  }

  /** Versions that can be overlaid for comparison (every version except the primary one). */
  get compareVersionOptions(): DatasetSummary[] {
    return this.schemaVersions.filter((d) => d.id !== this.selectedDatasetId);
  }

  /** Short human label for a version, e.g. "v2". */
  versionLabelFor(datasetId: string): string {
    const d = this.datasets.find((x) => x.id === datasetId);
    return d?.version_number != null ? `v${d.version_number}` : (d?.original_filename ?? 'version');
  }

  /** Switch the primary version the builder works on (resets the current widget state). */
  async selectVersion(id: string): Promise<void> {
    if (!id || id === this.selectedDatasetId) return;
    this.compareVersionId = '';
    this.datasetError = '';
    this.loadingDatasets = true;
    try {
      await this.activateDatasets([id], true);
    } catch {
      this.realRows = null;
      this.datasetError = 'Could not load the selected version.';
    } finally {
      this.loadingDatasets = false;
      this.refreshPreview();
    }
  }

  /** Choose a second version to overlay on the same chart (empty = no comparison). */
  setCompareVersion(id: string): void {
    this.compareVersionId = id || '';
    this.refreshPreview();
  }

  /** Overlaying two versions only makes sense for shared-axis charts (bar/line/radar), not pie/KPI/table/scatter. */
  private canOverlayVersions(spec: WidgetSpec): boolean {
    return !!this.compareVersionId
      && spec.viz !== 'kpi' && spec.viz !== 'table' && spec.viz !== 'scatter'
      && !spec.multiColor;
  }

  private parseChartType(raw: unknown): WidgetSpec['chartType'] {
    const chart = String(raw ?? '');
    if (chart === 'bar' || chart === 'line' || chart === 'doughnut' || chart === 'pie' || chart === 'radar' || chart === 'polarArea' || chart === 'scatter') {
      return chart;
    }
    return null;
  }

  private asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map((v) => String(v)) : [];
  }

  private measureDefsFromConfig(config: Record<string, unknown>): Array<{ field: string; alias: string }> {
    const raw = Array.isArray(config['measures']) ? config['measures'] : [];
    return raw
      .map((m) => {
        const rec = (m ?? {}) as Record<string, unknown>;
        return {
          field: String(rec['field'] ?? ''),
          alias: String(rec['alias'] ?? rec['field'] ?? '')
        };
      })
      .filter((m) => m.field && m.alias);
  }

  private toCellValue(value: unknown): string | number {
    return typeof value === 'number' || typeof value === 'string' ? value : String(value ?? '');
  }

  private toDbField(displayName: string): string {
    return this.displayToDb.get(displayName) ?? displayName;
  }

  private hydrateWidgetFromRows(spec: WidgetSpec, dbConfig: Record<string, unknown>, rows: Record<string, unknown>[]): WidgetSpec {
    const dims = this.asStringArray(dbConfig['dimensions']);
    const measures = this.measureDefsFromConfig(dbConfig);
    const viz = spec.viz;

    if (viz === 'kpi') {
      const m = measures[0];
      const total = m && rows.length ? Number(rows[0][m.alias]) || 0 : 0;
      return { ...spec, kpiTotal: total, kpiLabel: m?.field ?? spec.kpiLabel };
    }

    if (viz === 'table') {
      const columns = this.selectedCols.length
        ? this.selectedCols.map((c) => c.name)
        : (dims.length ? dims : Object.keys(rows[0] ?? {}));
      const tableRows = rows
        .slice(0, 1000)
        .map((row) => columns.map((col) => this.toCellValue(row[this.toDbField(col)])));
      return { ...spec, tableColumns: columns, tableRows };
    }

    if (viz === 'scatter') {
      const xField = this.measureCols()[0]?.name ?? this.selectedCols[0]?.name;
      const yField = this.measureCols()[1]?.name ?? this.selectedCols[1]?.name;
      const xDbField = xField ? this.toDbField(xField) : '';
      const yDbField = yField ? this.toDbField(yField) : '';
      const points = xField && yField
        ? rows
            .map((row) => ({ x: Number(row[xDbField]), y: Number(row[yDbField]) }))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        : [];
      return {
        ...spec,
        points,
        datasets: [{ label: `${yField ?? 'Y'} vs ${xField ?? 'X'}`, data: [] }]
      };
    }

    const dim = dims[0] ?? '';
    const labels = dim ? rows.map((row) => String(row[dim] ?? '')) : rows.map((_, i) => `Row ${i + 1}`);
    const valueMeasures = (spec.multiColor ? measures.slice(0, 1) : measures);
    const datasets: Series[] = valueMeasures.map((m) => ({
      label: m.field,
      data: rows.map((row) => Number(row[m.alias]) || 0)
    }));
    return { ...spec, labels, datasets };
  }

  private async hydrateWidgetData(spec: WidgetSpec, dbConfig: Record<string, unknown>): Promise<WidgetSpec> {
    if (!this.compat.usingRealData || !dbConfig['dataset']) {
      this.queryError = 'Select a dataset to load data from backend.';
      throw new Error('Dataset required for backend query execution');
    }

    try {
      const response = await this.backend.executeQuery(dbConfig);
      this.queryError = '';
      let hydrated = this.hydrateWidgetFromRows(spec, dbConfig, response.data ?? []);
      if (this.canOverlayVersions(hydrated)) {
        hydrated = await this.applyVersionOverlay(hydrated, dbConfig);
      }
      return hydrated;
    } catch (err: unknown) {
      const message = err instanceof HttpErrorResponse
        ? (typeof err.error?.error === 'string' ? err.error.error : err.message)
        : (err instanceof Error ? err.message : 'Backend query failed.');
      this.queryError = `Execute query failed: ${message}`;
      throw err instanceof Error ? err : new Error(message);
    }
  }

  /**
   * Runs the same query against the compare version and appends its measure series to the chart so
   * both versions render side by side on shared category labels. Compare values are aligned to the
   * primary chart's labels by dimension value (missing categories show as 0).
   */
  private async applyVersionOverlay(spec: WidgetSpec, dbConfig: Record<string, unknown>): Promise<WidgetSpec> {
    const compareConfig = { ...dbConfig, dataset: this.compareVersionId };
    const compareRows = (await this.backend.executeQuery(compareConfig)).data ?? [];

    const dims = this.asStringArray(dbConfig['dimensions']);
    const dim = dims[0] ?? '';
    const measures = this.measureDefsFromConfig(dbConfig);
    const labels = spec.labels ?? [];

    const compareByLabel = new Map<string, Record<string, unknown>>();
    for (const row of compareRows) {
      compareByLabel.set(String(row[dim] ?? ''), row);
    }

    const primaryTag = this.versionLabelFor(this.selectedDatasetId);
    const compareTag = this.versionLabelFor(this.compareVersionId);

    const primaryDatasets: Series[] = (spec.datasets ?? []).map((d) => ({
      ...d,
      label: `${d.label} (${primaryTag})`
    }));
    const compareDatasets: Series[] = measures.map((m) => ({
      label: `${m.field} (${compareTag})`,
      data: labels.map((l) => Number(compareByLabel.get(l)?.[m.alias]) || 0)
    }));

    return { ...spec, datasets: [...primaryDatasets, ...compareDatasets] };
  }

  /** Reads a persisted grid layout ({x,y,w,h}) from a widget's layout_json, or undefined if absent/partial. */
  private parseLayout(layoutJson: Record<string, unknown> | undefined): WidgetSpec['layout'] {
    const l = layoutJson ?? {};
    const nums = ['x', 'y', 'w', 'h'].map((k) => l[k]);
    if (nums.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      const [x, y, w, h] = nums as number[];
      return { x, y, w, h };
    }
    return undefined;
  }

  private restoreWidget(index: number, widget: { chart_config_json?: Record<string, unknown>; database_config_json?: Record<string, unknown>; hydrated_data?: Record<string, unknown>[]; widget_name?: string; layout_json?: Record<string, unknown>; }): WidgetSpec | null {
    const chart = widget.chart_config_json ?? {};
    const style = (chart['style'] as Record<string, unknown> | undefined) ?? {};
    const viz = String(chart['viz'] ?? 'table');
    const base: WidgetSpec = {
      id: index + 1,
      viz,
      title: String(chart['title'] ?? widget.widget_name ?? 'Widget'),
      chartType: this.parseChartType(chart['chartType']) ?? (this.isChartViz(viz) ? this.meta(viz).t : null),
      labels: [],
      datasets: [],
      primary: String(style['primary'] ?? this.palette[0]),
      fill: Boolean(style['fill'] ?? false),
      multiColor: Boolean(style['multiColor'] ?? false),
      radial: Boolean(style['radial'] ?? false),
      indexAxis: style['indexAxis'] === 'y' ? 'y' : 'x',
      showLegend: Boolean(style['showLegend'] ?? false),
      legendPosition: style['legendPosition'] === 'right' || style['legendPosition'] === 'top' ? style['legendPosition'] as 'bottom' | 'right' | 'top' : 'bottom',
      stacked: Boolean(style['stacked'] ?? false),
      kpiLabel: chart['kpiLabel'] ? String(chart['kpiLabel']) : undefined,
      tableColumns: [],
      tableRows: [],
      databaseConfig: widget.database_config_json,
      layout: this.parseLayout(widget.layout_json)
    };

    const dbConfig = (widget.database_config_json ?? {}) as Record<string, unknown>;
    const hydratedRows = Array.isArray(widget.hydrated_data) ? widget.hydrated_data : [];
    if (hydratedRows.length && dbConfig) {
      return this.hydrateWidgetFromRows(base, dbConfig, hydratedRows);
    }
    return base;
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
    const datasetToken = String(firstDbConfig['dataset'] ?? '');
    if (datasetToken) {
      const dataset = this.datasets.find((d) => d.id === datasetToken || d.table_name === datasetToken);
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
    this.syncDraft();
    this.refreshPreview();
  }

  private async refreshServerAgg(): Promise<void> {
    // Deprecated aggregate endpoint path: keep only local cache reset.
    this.aggRequestId++;
    this.serverAgg = null;
    this.serverLabels = null;
    this.serverKpi = null;
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

  /** A column is disabled when it can't be added to the current selection (already-selected columns stay
   *  clickable so they can be removed). Once a chart is chosen, columns that would break it grey out. */
  colDisabled(c: Column): boolean {
    if (this.isSelected(c)) return false;
    return !this.compat.canAddColumn(this.selectedViz, this.selectedCols, c, this.compat.columns);
  }

  /** Tooltip explaining why a column is disabled. */
  colDisabledReason(c: Column): string {
    if (this.selectedCols.length >= 4) return 'You can select up to 4 columns';
    const card = this.vizCards.find(v => v.key === this.selectedViz);
    return card ? `Doesn't fit ${card.label}` : '';
  }

  /** The recommended ("suggested") chart for the current columns, or null. */
  recommendedViz(): string | null { return this.compat.recommend(this.selectedCols); }
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
    if (!this.isSelected(c) && this.colDisabled(c)) return;   // can't add a disabled column
    if (this.isSelected(c)) {
      this.selectedCols = this.selectedCols.filter(s => s.name !== c.name);
    } else if (this.selectedCols.length < 4) {
      this.selectedCols = [...this.selectedCols, c];
    }
    // if the current chart is no longer valid for the new selection, clear it
    if (this.selectedViz && !this.allowed(this.selectedViz)) this.selectedViz = null;
    this.pruneDrillPath();
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

  private async refreshPreview() {
    this.destroyChart();
    this.queryError = '';
    if (!this.selectedViz || !this.allowed(this.selectedViz)) return;

    if (!this.compat.usingRealData) {
      this.previewSpec = null;
      this.previewKpi = 0;
      this.previewColumns = [];
      this.previewRows = [];
      this.queryError = 'Select at least one dataset. Preview only uses backend query results.';
      return;
    }

    let spec = this.specFor();
    const queryConfig = this.buildQueryBuilderConfig(this.selectedViz);
    spec.databaseConfig = queryConfig;
    try {
      spec = await this.hydrateWidgetData(spec, queryConfig);
    } catch {
      this.previewSpec = null;
      this.previewKpi = 0;
      this.previewColumns = [];
      this.previewRows = [];
      return;
    }

    this.previewSpec = spec;
    if (this.selectedViz === 'kpi') {
      this.previewKpi = spec.kpiTotal ?? 0;
      return;
    }
    if (this.selectedViz === 'table') {
      this.previewColumns = spec.tableColumns ?? [];
      this.previewRows = spec.tableRows ?? [];
      return;
    }
    if (this._canvas) setTimeout(() => this.renderChart(spec), 0);
  }

  startOver() {
    this.editingWidgetId = null;
    this.selectedCols = []; this.selectedViz = null;
    this.drillPathNames = [];
    this.previewKpi = 0; this.previewColumns = []; this.previewRows = [];
    this.filterKey = null; this.activeLabels = []; this.granularity = 'monthly'; this.topNOption = 'all';
    this.aggregation = 'sum'; this.rangeMin = null; this.rangeMax = null; this.chipSearch = ''; this.chipsExpanded = false;
    this.serverAgg = null; this.serverLabels = null; this.serverKpi = null;
    this.previewSpec = null;
    this.destroyChart();
  }

  async addWidget() {
    if (this.hasColumns() && this.selectedViz && this.allowed(this.selectedViz)) {
      let spec = this.specFor();
      const queryConfig = this.buildQueryBuilderConfig(this.selectedViz);
      spec.databaseConfig = queryConfig;
      try {
        spec = await this.hydrateWidgetData(spec, queryConfig);
      } catch {
        return;
      }
      spec.editState = this.captureEditState();
      const editId = this.editingWidgetId;
      if (editId != null && this.committedWidgets.some(w => w.id === editId)) {
        // update the existing widget in place (keeps its id + position/size on the canvas)
        const prev = this.committedWidgets.find(w => w.id === editId);
        spec.id = editId;
        spec.layout = prev?.layout ?? this.nextWidgetLayout();
        this.committedWidgets = this.committedWidgets.map(w => w.id === editId ? spec : w);
      } else {
        spec.id = ++this.widgetSeq;
        spec.layout = this.nextWidgetLayout();
        this.committedWidgets.push(spec);
      }
      this.syncDraft();
    }
    this.startOver();
  }

  /** Place a new widget in a free row at the bottom of the canvas so it never overlaps existing ones. */
  private nextWidgetLayout() {
    const bottom = this.committedWidgets.reduce((m, w) => w.layout ? Math.max(m, w.layout.y + w.layout.h) : m, 0);
    return { x: 0, y: bottom, w: 6, h: 3 };
  }

  /** Persist grid moves/resizes from the canvas and mirror them into the preview draft. */
  onLayoutChange(): void { this.syncDraft(); }

  /** Push the current canvas (widgets + layout + name) into the shared draft the Preview page renders. */
  private syncDraft(): void {
    this.draft.set(this.committedWidgets, this.loadedDashboardName || 'Untitled dashboard');
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

    const ds = this.datasets.find(d => d.id === cfg.dataset || d.table_name === cfg.dataset);
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
      legendPos: this.legendPos,
      drillPath: Array.isArray(cfg.drillPath) ? cfg.drillPath.map(String) : []
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
      legendPos: this.legendPos,
      drillPath: [...this.validDrillNames()]
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
      const datasetToken = String((widget.databaseConfig as any)?.dataset ?? '');
      const byToken = datasetToken ? this.datasets.find(d => d.id === datasetToken || d.table_name === datasetToken) : undefined;
      if (byToken) datasetIds = [byToken.id];
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
    // Restore the drill path. Accept either display names (from a snapshot) or db field names
    // (from a config-reconstructed state), mapping each back to a real column display name.
    const validDrill = new Set(this.compat.columns.map(c => c.name));
    this.drillPathNames = (es.drillPath ?? [])
      .map(n => validDrill.has(n) ? n : (this.compat.columns.find(c => this.toDbField(c.name) === n)?.name ?? n))
      .filter(n => validDrill.has(n));
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

  private buildQueryBuilderConfig(viz: string | null = this.selectedViz): Record<string, unknown> {
    const selectedCols = this.selectedCols.map((c) => c.name);
    const dimensions = viz === 'scatter' || viz === 'table'
      ? selectedCols.map((c) => this.toDbField(c))
      : this.dimCols().map((d) => this.toDbField(d.name));
    const measures = viz === 'scatter' || viz === 'table'
      ? []
      : this.measureCols().map((m) => ({
      field: this.toDbField(m.name),
      aggregation: this.aggregation.toUpperCase(),
      alias: `${this.aggregation}_${this.toAlias(this.toDbField(m.name))}`
    }));

    const rules: Array<Record<string, unknown>> = [];
    const dimName = this.currentDimName();
    if (dimName) {
      const allLabels = this.allLabelsForFilter();
      if (this.activeLabels.length > 0 && this.activeLabels.length < allLabels.length) {
        rules.push({
          field: this.toDbField(dimName),
          operator: 'IN',
          values: this.activeLabels
        });
      }
    }

    const primaryMeasure = viz === 'scatter' || viz === 'table' ? null : this.measureCols()[0]?.name;
    if (primaryMeasure && this.rangeMin != null) {
      rules.push({ field: this.toDbField(primaryMeasure), operator: '>=', value: this.rangeMin });
    }
    if (primaryMeasure && this.rangeMax != null) {
      rules.push({ field: this.toDbField(primaryMeasure), operator: '<=', value: this.rangeMax });
    }

    let sorting: Array<Record<string, unknown>> = [];
    let pagination: Record<string, unknown> = { top: 100, offset: 0 };
    if (primaryMeasure && this.topNOption !== 'all') {
      const alias = `${this.aggregation}_${this.toAlias(this.toDbField(primaryMeasure))}`;
      const top = this.topNOption === 'top5' ? 5 : 3;
      const direction = this.topNOption === 'bottom3' ? 'ASC' : 'DESC';
      sorting = [{ field: alias, direction }];
      pagination = { top, offset: 0 };
    }

    const dataset = this.selectedDatasetId || this.datasets.find((d) => d.id === this.selectedDatasetId)?.table_name || '';

    // Drill path: extra dimension columns to descend into (db field names, in order).
    // Supported for charts (drill from the plotted dimension), KPIs (drill from the total),
    // and tables (drill from the first dimension column). Scatter plots don't drill.
    const plottedDim = this.currentDimName();
    const drillPathFields = this.validDrillNames().map((n) => this.toDbField(n));
    let drillPath: string[] = [];
    let drillBase: string | undefined;         // table only: db field of the row-level drill key
    let drillBaseDisplay: string | undefined;  // table only: display name of that column
    let drillMeasures: Array<Record<string, unknown>> | undefined; // table only: measures to aggregate while drilling

    if (viz === 'scatter') {
      // no drill-down
    } else if (viz === 'kpi') {
      // A KPI drills straight from its single total into the extra dimensions, in order.
      drillPath = drillPathFields;
    } else if (viz === 'table') {
      // A table drills from its first dimension column into the extra dimensions, aggregating measures.
      const baseDim = this.dimCols()[0];
      if (baseDim && drillPathFields.length && this.measureCols().length) {
        drillBase = this.toDbField(baseDim.name);
        drillBaseDisplay = baseDim.name;
        drillPath = drillPathFields;
        drillMeasures = this.measureCols().map((m) => ({
          field: this.toDbField(m.name),
          aggregation: this.aggregation.toUpperCase(),
          alias: `${this.aggregation}_${this.toAlias(this.toDbField(m.name))}`
        }));
      }
    } else if (this.isChartViz(viz) && plottedDim) {
      drillPath = drillPathFields;
    }

    return {
      dataset,
      compareDataset: this.compareVersionId || undefined,
      dimensions,
      measures,
      filters: { condition: 'AND', rules },
      having: [],
      sorting,
      pagination,
      drillPath,
      drillBase,
      drillBaseDisplay,
      drillMeasures
    };
  }

  /**
   * Opens the "save to dashboard" picker. The current widget (or all canvas widgets) can be added to
   * one or more existing dashboards and/or saved into a brand-new dashboard the user names here.
   */
  async saveDashboard() {
    if (this.saveBusy || !this.hasSomethingToSave()) {
      return;
    }
    this.saveMessage = '';
    this.saveTargetIds = [];
    this.createNewChecked = false;
    this.newDashboardName = `Dashboard ${new Date().toLocaleString()}`;
    this.showSaveModal = true;
    this.loadingExisting = true;
    this.dashboardService.listDashboardRecords('anonymous').subscribe({
      next: (records) => {
        // Only offer dashboards that belong to the currently-active dataset family, so a
        // sales widget can't be appended to a multiple_tables dashboard and vice versa.
        this.existingDashboards = (records ?? []).filter((r) => this.active.dashboardMatchesActive(r));
        this.loadingExisting = false;
        // Nothing to append to for this dataset: default to "create new".
        if (!this.existingDashboards.length) this.createNewChecked = true;
      },
      error: () => {
        this.existingDashboards = [];
        this.loadingExisting = false;
        this.createNewChecked = true;
      }
    });
  }

  closeSaveModal(): void {
    if (this.saveBusy) return;
    this.showSaveModal = false;
  }

  isSaveTargetSelected(id: string): boolean { return this.saveTargetIds.includes(id); }

  toggleSaveTarget(id: string): void {
    this.saveTargetIds = this.isSaveTargetSelected(id)
      ? this.saveTargetIds.filter(t => t !== id)
      : [...this.saveTargetIds, id];
  }

  /** At least one target (an existing dashboard checkbox, or a new named dashboard) must be chosen. */
  canConfirmSave(): boolean {
    return this.saveTargetIds.length > 0 || (this.createNewChecked && this.newDashboardName.trim().length > 0);
  }

  /** Builds the widget payload from the canvas (or hydrates the single current widget if none committed). */
  private async buildWidgetsPayload(): Promise<DashboardWidgetRecord[]> {
    let widgetsToSave: WidgetSpec[];
    if (this.committedWidgets.length) {
      widgetsToSave = this.committedWidgets;
    } else {
      let spec = this.specFor();
      spec.id = ++this.widgetSeq;
      spec.layout = defaultGridLayout(0);
      const queryConfig = this.buildQueryBuilderConfig(this.selectedViz);
      spec.databaseConfig = queryConfig;
      try {
        spec = await this.hydrateWidgetData(spec, queryConfig);
      } catch {
        this.saveMessage = 'Cannot save: backend query failed for current widget.';
        return [];
      }
      widgetsToSave = [spec];
    }

    return widgetsToSave.map((widget) => ({
      widget_name: widget.title || widget.viz,
      layout_json: widget.layout
        ? { widget_id: widget.id, x: widget.layout.x, y: widget.layout.y, w: widget.layout.w, h: widget.layout.h }
        : { widget_id: widget.id },
      chart_config_json: {
        viz: widget.viz,
        chartType: widget.chartType,
        title: widget.title,
        kpiLabel: widget.kpiLabel,
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
    }));
  }

  /** Normalizes an existing dashboard's widgets (as returned by the API) back to the save payload shape. */
  private mapExistingWidgets(widgets?: DashboardWidgetRecord[]): DashboardWidgetRecord[] {
    return (widgets ?? []).map((w) => ({
      widget_name: (w as any).widget_name ?? 'widget',
      layout_json: (w as any).layout_json ?? {},
      chart_config_json: (w as any).chart_config_json ?? {},
      database_config_json: (w as any).database_config_json ?? {}
    }));
  }

  /** Persists the current widget(s) to the chosen existing dashboards and/or a new one. */
  async confirmSave(): Promise<void> {
    if (this.saveBusy || !this.canConfirmSave()) {
      return;
    }

    this.saveBusy = true;
    this.saveMessage = 'Saving...';

    const widgets = await this.buildWidgetsPayload();
    if (!widgets.length) {
      this.saveBusy = false;
      return;
    }

    const description = this.compat.usingRealData
      ? `Built from ${this.compat.datasetLabel ?? 'dataset'}`
      : 'Built in demo mode';

    const ops: Promise<unknown>[] = [];

    // Add to each selected existing dashboard (backend replaces widgets, so merge old + new).
    for (const id of this.saveTargetIds) {
      const target = this.existingDashboards.find(d => d.dashboard_id === id);
      if (!target) continue;
      const payload: SaveDashboardRequest = {
        user_id: target.user_id || 'anonymous',
        name: target.name,
        description: target.description ?? description,
        schema_id: this.activeSchemaId,
        widgets: [...this.mapExistingWidgets(target.widgets), ...widgets]
      };
      ops.push(firstValueFrom(this.dashboardService.updateDashboardRecord(id, payload)));
    }

    // Optionally create a brand-new dashboard with the current widget(s).
    if (this.createNewChecked && this.newDashboardName.trim()) {
      const payload: SaveDashboardRequest = {
        user_id: 'anonymous',
        name: this.newDashboardName.trim(),
        description,
        schema_id: this.activeSchemaId,
        widgets
      };
      ops.push(firstValueFrom(this.dashboardService.createDashboardRecord(payload)));
    }

    try {
      await Promise.all(ops);
      this.saveBusy = false;
      this.showSaveModal = false;
      this.saveMessage = 'Dashboard saved to database.';
      // Saved widgets now live in "My Dashboards" — clear the canvas (and the preview draft) so the
      // builder starts fresh and only ever shows the current (unsaved) work.
      this.committedWidgets = [];
      this.widgetSeq = 0;
      this.syncDraft();
      this.startOver();
      this.router.navigate(['/dashboards']);
    } catch {
      this.saveBusy = false;
      this.saveMessage = 'Could not save dashboard. Please check the backend connection.';
    }
  }

  removeWidget(id: number) { this.committedWidgets = this.committedWidgets.filter(w => w.id !== id); this.syncDraft(); }

  /** View-mode header: switch the currently-previewed dashboard into the editable builder. */
  editThisDashboard(): void {
    this.viewMode = false;
    this.saveMessage = '';
    // Keep the URL honest without re-instantiating the component (widgets are already loaded).
    this.router.navigate([], { relativeTo: this.route, queryParams: { mode: null }, queryParamsHandling: 'merge' });
  }

  /** View-mode header: go back to the dashboards list. */
  backToDashboards(): void {
    this.router.navigate(['/dashboards']);
  }

  setPalette(i: number) { this.selPalette = i; this.refreshPreview(); }
  setLegend(p: string) { this.legendPos = p; this.refreshPreview(); }

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

  // ---- drill-down path picker (extra dimension columns to drill into, below the plotted one) ----

  /** Dimension columns in the dataset that could be drilled into: any non-numeric column that isn't
   *  the plotted dimension (charts) or the table's first dimension column (tables). */
  drillCandidates(): Column[] {
    const plotted = this.currentDimName();
    const tableBase = this.selectedViz === 'table' ? this.dimCols()[0]?.name ?? null : null;
    return this.compat.columns.filter(c => c.type !== 'number' && c.name !== plotted && c.name !== tableBase);
  }

  /** Show the drill picker for charts, KPIs and tables that have a base level and something to drill into.
   *  Charts drill from their single plotted dimension; KPIs from the total; tables from their first
   *  dimension column (which also needs a measure to aggregate on the way down). Scatter can't drill. */
  showDrillPicker(): boolean {
    if (!this.hasColumns() || this.selectedViz === 'scatter') return false;
    if (this.selectedViz === 'kpi') {
      return this.measureCols().length >= 1 && this.drillCandidates().length > 0;
    }
    if (this.selectedViz === 'table') {
      return this.dimCols().length >= 1 && this.measureCols().length >= 1 && this.drillCandidates().length > 0;
    }
    return this.isChartViz(this.selectedViz) && this.currentDimName() !== null && this.drillCandidates().length > 0;
  }

  /** Human label for where a drill starts, shown in the picker hint (chart dimension / KPI total / table column). */
  drillFromLabel(): string {
    if (this.selectedViz === 'kpi') return 'the total';
    if (this.selectedViz === 'table') return this.dimCols()[0]?.name ?? 'the first column';
    return this.currentDimName() ?? 'the dimension';
  }

  isDrillSelected(c: Column): boolean { return this.drillPathNames.includes(c.name); }
  /** 1-based position of a column in the drill order, or null if not selected. */
  drillOrder(c: Column): number | null {
    const i = this.drillPathNames.indexOf(c.name);
    return i < 0 ? null : i + 1;
  }

  toggleDrill(c: Column) {
    this.drillPathNames = this.isDrillSelected(c)
      ? this.drillPathNames.filter(n => n !== c.name)
      : [...this.drillPathNames, c.name];
    this.refreshPreview();
  }

  /** Drop drill entries that are no longer valid candidates (removed column, or now the plotted dimension). */
  private pruneDrillPath() {
    const valid = new Set(this.drillCandidates().map(c => c.name));
    this.drillPathNames = this.drillPathNames.filter(n => valid.has(n));
  }

  /** Drill names still valid for the current selection, in order — what actually gets saved. */
  private validDrillNames(): string[] {
    const valid = new Set(this.drillCandidates().map(c => c.name));
    return this.drillPathNames.filter(n => valid.has(n));
  }

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
    return [];
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
    this.topNOption = 'all';
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
      return { ...base, title: 'Total ' + m.name, kpiTotal: 0, kpiLabel: m.name };
    }

    if (viz === 'table') {
      return { ...base, title: 'Data table', tableColumns: this.selectedCols.map(c => c.name), tableRows: [] };
    }

    const mt = this.meta(viz);

    if (viz === 'scatter') {
      return { ...base, chartType: 'scatter', title: `${meas[1].name} vs ${meas[0].name}`, points: [], datasets: [{ label: `${meas[1].name} vs ${meas[0].name}`, data: [] }] };
    }

    const dim = dims[0];
    const datasets: Series[] = (mt.multi ? [meas[0]] : meas).map(m => ({ label: m.name, data: [] }));
    return {
      ...base, chartType: mt.t, title: `${meas.map(m => m.name).join(', ')} by ${dim.name}`,
      labels: [], datasets, fill: mt.fill, multiColor: mt.multi, radial: mt.radial, indexAxis: mt.axis,
      stacked: viz === 'stacked',
      showLegend: mt.multi || datasets.length > 1
    };
  }

  private destroyChart() { if (this.chart) { this.chart.destroy(); this.chart = undefined; } }

  private renderChart(specOverride?: WidgetSpec) {
    if (!this._canvas || !this.isChartViz(this.selectedViz) || !this.allowed(this.selectedViz!)) return;
    this.destroyChart();
    const spec = specOverride ?? this.previewSpec ?? this.specFor();
    const cfg = buildChartConfig(spec, false);
    this.chart = new Chart(this._canvas.getContext('2d')!, cfg);
  }
}
