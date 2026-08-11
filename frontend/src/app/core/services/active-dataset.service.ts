import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { BackendIntegrationService, DatasetSummary, SchemaSummary } from './backend-integration.service';
import { DashboardRecord } from './dashboard.service';

/** Sentinel active value meaning "nothing selected yet" (clean slate until upload or explicit pick). */
export const NO_ACTIVE_DATASET = '__none__';

/**
 * A dataset "family": all uploads/versions that share the same logical name, regardless of whether
 * they went through the schema flow or a plain upload. Matching is done on the normalized family
 * key so that re-uploads (which may create a new schema_id) and legacy uploads still line up.
 */
export interface DatasetFamily {
  /** Normalized identity key used for matching (schema name or normalized table/file name). */
  key: string;
  /** Human-friendly display label. */
  label: string;
  /** Latest data version number in the family (null when unknown). */
  latestVersion: number | null;
  /** How many dataset uploads belong to this family. */
  datasetCount: number;
}

/**
 * Holds the single "active dataset" (scoped by dataset family) shared across every page:
 * Uploaded Data, Dashboard Builder and My Dashboards all react to it.
 * The selection is session-scoped: it is kept in sessionStorage so it survives reloads and
 * navigation within the current browser session, but every NEW session starts with a clean
 * slate (nothing selected) so pages stay empty until the user uploads or picks a dataset.
 */
@Injectable({ providedIn: 'root' })
export class ActiveDatasetService {
  // Session-scoped key: sessionStorage is per-tab/session, so a brand-new session begins with a
  // clean slate while reloads within the session keep the just-uploaded/selected dataset.
  private readonly STORAGE_KEY = 'activeDatasetKey_v3';

  private datasets: DatasetSummary[] = [];
  private schemaNames = new Map<string, string>();
  private loaded = false;

  private readonly activeKeySubject = new BehaviorSubject<string>(this.readStored());
  /** Emits the active dataset-family key (NO_ACTIVE_DATASET = nothing selected yet). */
  readonly activeKey$ = this.activeKeySubject.asObservable();

  private readonly familiesSubject = new BehaviorSubject<DatasetFamily[]>([]);
  /** Emits the list of selectable dataset families (newest first). */
  readonly families$ = this.familiesSubject.asObservable();

  constructor(private backend: BackendIntegrationService) {}

  get activeKey(): string {
    return this.activeKeySubject.value;
  }

  /** Loads the dataset list once (does not auto-select anything). */
  async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    await this.reload();
    this.loaded = true;
  }

  /** Reloads datasets and keeps the current selection if it still exists, else clears it (no auto-pick). */
  async reload(): Promise<void> {
    await this.loadSchemaNames();
    this.datasets = await this.backend.listDatasets();
    this.recomputeFamilies();
    const current = this.activeKey;
    if (current === NO_ACTIVE_DATASET) {
      return; // nothing chosen yet — keep the clean slate until the user uploads or picks a dataset
    }
    const stillValid = this.familiesSubject.value.some((f) => f.key === current);
    if (!stillValid) {
      // A previously-selected dataset no longer exists → fall back to no selection.
      this.setActiveKey(NO_ACTIVE_DATASET);
    }
  }

  /**
   * Call right after an upload so the just-uploaded dataset becomes active everywhere.
   * Pass the schema/family name that was uploaded so we activate THAT family — this is important
   * when the upload was unchanged/deduped and produced no new (newest) dataset row.
   */
  async refreshAfterUpload(uploadedFamilyName?: string): Promise<void> {
    await this.loadSchemaNames();
    this.datasets = await this.backend.listDatasets();
    this.recomputeFamilies();
    const hinted = uploadedFamilyName ? this.normalize(uploadedFamilyName) : '';
    const target = hinted && this.datasets.some((d) => this.familyKeyOf(d) === hinted)
      ? hinted
      : this.newestFamilyKey();
    this.setActiveKey(target);
    this.loaded = true;
  }

  private async loadSchemaNames(): Promise<void> {
    try {
      const schemas: SchemaSummary[] = await this.backend.listSchemas();
      this.schemaNames = new Map(schemas.map((s) => [s.id, s.schemaName]));
    } catch {
      // Non-fatal: fall back to file/table names for labels.
    }
  }

  /** Sets the active dataset family and persists it for the current session. */
  setActiveKey(key: string): void {
    const next = key || NO_ACTIVE_DATASET;
    this.writeStored(next);
    if (this.activeKeySubject.value !== next) {
      this.activeKeySubject.next(next);
    }
  }

  /** All datasets currently loaded (newest first). */
  getDatasets(): DatasetSummary[] {
    return this.datasets;
  }

  /** Normalized family key for a dataset upload (schema name, or normalized table/file name). */
  familyKeyOf(d: DatasetSummary): string {
    if (d.schema_id) {
      const name = this.schemaNames.get(d.schema_id);
      if (name && name.trim()) {
        return this.normalize(name);
      }
    }
    return this.normalize(d.table_name || d.original_filename || 'dataset');
  }

  /** True when a dataset belongs to the active family. */
  datasetMatchesActive(d: DatasetSummary): boolean {
    if (this.activeKey === NO_ACTIVE_DATASET) {
      return false;
    }
    return this.familyKeyOf(d) === this.activeKey;
  }

  /** Datasets belonging to the active family (newest first). */
  activeDatasets(): DatasetSummary[] {
    if (this.activeKey === NO_ACTIVE_DATASET) {
      return [];
    }
    return this.datasets.filter((d) => this.familyKeyOf(d) === this.activeKey);
  }

  /** True when a saved dashboard was built on the active dataset family. */
  dashboardMatchesActive(record: DashboardRecord): boolean {
    if (this.activeKey === NO_ACTIVE_DATASET) {
      return false;
    }
    const key = this.dashboardFamilyKey(record);
    return key !== null && key === this.activeKey;
  }

  /** Resolve the dataset family a dashboard belongs to (via its schema, else the upload its widgets use). */
  dashboardFamilyKey(record: DashboardRecord): string | null {
    if (record.schema_id) {
      const name = this.schemaNames.get(record.schema_id);
      if (name && name.trim()) {
        return this.normalize(name);
      }
      const byId = this.datasets.find((d) => d.schema_id === record.schema_id);
      if (byId) {
        return this.familyKeyOf(byId);
      }
    }
    // Schema-based resolution failed (e.g. the dashboard points at an older schema version whose id
    // is no longer returned by listSchemas). Fall back to the dataset the widgets were actually built on.
    const uploadId = this.dashboardUploadId(record);
    if (uploadId) {
      const d = this.datasets.find((x) => x.id === uploadId);
      if (d) {
        return this.familyKeyOf(d);
      }
    }
    // Last resort: group by the raw schema id so same-schema dashboards still cluster together.
    return record.schema_id ? this.normalize(record.schema_id) : null;
  }

  private dashboardUploadId(record: DashboardRecord): string | null {
    const widget = record.widgets?.find(
      (w) => w.database_config_json && typeof w.database_config_json['dataset'] === 'string'
    );
    const fromWidget = widget?.database_config_json?.['dataset'];
    if (typeof fromWidget === 'string' && fromWidget) {
      return fromWidget;
    }
    const match = /Built from ([0-9a-fA-F-]{36})/.exec(record.description || '');
    return match ? match[1] : null;
  }

  private newestFamilyKey(): string {
    // listDatasets returns newest-first.
    return this.datasets.length ? this.familyKeyOf(this.datasets[0]) : NO_ACTIVE_DATASET;
  }

  private recomputeFamilies(): void {
    const families: DatasetFamily[] = [];
    const index = new Map<string, DatasetFamily>();
    for (const d of this.datasets) {
      const key = this.familyKeyOf(d);
      const existing = index.get(key);
      if (existing) {
        existing.datasetCount++;
        continue;
      }
      // First occurrence is the newest version (list is newest-first).
      const family: DatasetFamily = {
        key,
        label: this.labelFor(d),
        latestVersion: d.version_number ?? null,
        datasetCount: 1
      };
      index.set(key, family);
      families.push(family);
    }
    this.familiesSubject.next(families);
  }

  labelFor(d: DatasetSummary): string {
    const key = this.familyKeyOf(d);
    const custom = this.getCustomName(key);
    if (custom) return custom;

    const schemaName = d.schema_id ? this.schemaNames.get(d.schema_id) : null;
    if (schemaName && schemaName.trim()) {
      return schemaName;
    }
    // The schema name may be unresolvable (e.g. an older/superseded schema version). Fall back to the
    // file/table name, but strip the internal _vN / date suffixes so the label stays the friendly family
    // name (e.g. "customer_data_v2" -> "customer_data") while preserving its original casing.
    const raw = this.stripExt(d.original_filename || d.table_name || 'Dataset');
    return raw
      .replace(/_v\d+$/i, '')
      .replace(/_\d{4}[_-]\d{2}[_-]\d{2}$/, '')
      .trim() || raw;
  }

  /** Collapse a schema/table/file name to a stable family key (drop extension, _vN and _YYYY_MM_DD suffixes). */
  private normalize(raw: string): string {
    return this.stripExt(raw)
      .replace(/_v\d+$/i, '')
      .replace(/_\d{4}[_-]\d{2}[_-]\d{2}$/, '')
      .trim()
      .toLowerCase();
  }

  private stripExt(raw: string): string {
    return raw.replace(/\.(json|csv|xlsx|xls)$/i, '');
  }

  private readStored(): string {
    try {
      return sessionStorage.getItem(this.STORAGE_KEY) || NO_ACTIVE_DATASET;
    } catch {
      return NO_ACTIVE_DATASET;
    }
  }

  private writeStored(value: string): void {
    try {
      if (value === NO_ACTIVE_DATASET) {
        sessionStorage.removeItem(this.STORAGE_KEY);
      } else {
        sessionStorage.setItem(this.STORAGE_KEY, value);
      }
    } catch {
      /* ignore storage failures (private mode, etc.) */
    }
  }

  public setCustomName(key: string, newName: string): void {
    const names = this.getAllCustomNames();
    names[key] = newName.trim();
    try {
      localStorage.setItem('customDatasetNames', JSON.stringify(names));
    } catch {
      // ignore
    }
    this.recomputeFamilies();
  }

  public getCustomName(key: string): string | null {
    const names = this.getAllCustomNames();
    return names[key] || null;
  }

  private getAllCustomNames(): Record<string, string> {
    try {
      const stored = localStorage.getItem('customDatasetNames');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }
}
