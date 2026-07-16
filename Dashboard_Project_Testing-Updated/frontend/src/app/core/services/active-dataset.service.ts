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
 * The selection is persisted in localStorage so it survives navigation and reloads.
 */
@Injectable({ providedIn: 'root' })
export class ActiveDatasetService {
  // Legacy localStorage key from when the active selection was persisted across reloads. We now keep
  // the selection in memory only (see below), so on startup we proactively clear any stale value.
  private readonly LEGACY_STORAGE_KEY = 'activeDatasetKey_v3';

  private datasets: DatasetSummary[] = [];
  private schemaNames = new Map<string, string>();
  private loaded = false;

  // The active dataset is intentionally NOT persisted across full page loads: every fresh open of the
  // app starts as a clean slate (NO_ACTIVE_DATASET) so no data is shown until the user uploads (or
  // explicitly picks) a dataset. In-app (SPA) navigation still preserves the selection in memory.
  private readonly activeKeySubject = new BehaviorSubject<string>(NO_ACTIVE_DATASET);
  /** Emits the active dataset-family key (NO_ACTIVE_DATASET = nothing selected yet). */
  readonly activeKey$ = this.activeKeySubject.asObservable();

  private readonly familiesSubject = new BehaviorSubject<DatasetFamily[]>([]);
  /** Emits the list of selectable dataset families (newest first). */
  readonly families$ = this.familiesSubject.asObservable();

  constructor(private backend: BackendIntegrationService) {
    // Drop any selection persisted by older versions so reopening the app never restores stale data.
    try {
      localStorage.removeItem(this.LEGACY_STORAGE_KEY);
    } catch {
      /* ignore storage failures (private mode, etc.) */
    }
  }

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
  async refreshAfterUpload(uploadedFamilyName?: string, knownUploadId?: string): Promise<void> {
    // Remember what was newest BEFORE the upload so we can tell whether this upload created a brand
    // new dataset row (the normal case) versus a deduped/unchanged re-upload (no new row).
    const prevNewestId = this.datasets.length ? this.datasets[0].id : null;
    await this.loadSchemaNames();
    this.datasets = await this.backend.listDatasets();
    this.recomputeFamilies();
    const newestId = this.datasets.length ? this.datasets[0].id : null;
    const createdNewRow = newestId !== null && newestId !== prevNewestId;

    let target: string;
    const known = knownUploadId
      ? this.datasets.find((d) => d.id === knownUploadId)
      : undefined;
    if (known) {
      // The caller told us exactly which dataset the upload resolved to (works for both a brand new
      // dataset AND a deduped re-upload that reused an existing version) → activate that family.
      target = this.familyKeyOf(known);
    } else if (createdNewRow) {
      // A fresh dataset row was created by this upload (list is newest-first) → activate exactly that
      // dataset's family so every page jumps to the data the user just uploaded. This is deterministic
      // and never resolves back to a previously-active family by name coincidence.
      target = this.familyKeyOf(this.datasets[0]);
    } else {
      // No new row appeared (unchanged/deduped re-upload) → activate the family named by the upload so
      // the user still lands on it; fall back to whatever is newest when no usable name was passed.
      const hinted = uploadedFamilyName ? this.normalize(uploadedFamilyName) : '';
      target = hinted && this.datasets.some((d) => this.familyKeyOf(d) === hinted)
        ? hinted
        : this.newestFamilyKey();
    }

    // Force a re-emit even when the family key is unchanged (e.g. uploading a newer VERSION of the
    // already-active dataset) so every subscribed page re-runs its scope/data refresh.
    this.forceSetActiveKey(target);
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

  /** Sets the active dataset family (in memory only — not persisted across full page reloads). */
  setActiveKey(key: string): void {
    const next = key || NO_ACTIVE_DATASET;
    if (this.activeKeySubject.value !== next) {
      this.activeKeySubject.next(next);
    }
  }

  /**
   * Sets the active family and ALWAYS emits, even if the key is unchanged. Used right after an upload
   * so that re-uploading a newer version of the currently-active dataset still forces every page to
   * refresh its data (a plain setActiveKey would be a no-op and leave pages showing stale rows).
   */
  private forceSetActiveKey(key: string): void {
    this.activeKeySubject.next(key || NO_ACTIVE_DATASET);
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

  private labelFor(d: DatasetSummary): string {
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
}
