import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchemaManagementService } from '@core/services/schema-management.service';
import { ActiveDatasetService } from '@core/services/active-dataset.service';
import { DataVersioningService, DataVersion } from '@core/services/data-versioning.service';
import { UploadService } from '@core/services/upload.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import * as XLSX from 'xlsx';

interface UploadStage {
  stage: 'schema' | 'data' | 'complete';
  schemaFile?: File;
  schemaName?: string;
  schemaId?: string;
  dataFile?: File;
  message?: string;
}

@Component({
  selector: 'app-schema-data-upload',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="upload-container">
      <!-- Stage 1: Upload Schema -->
      <div class="upload-stage" *ngIf="stage === 'schema'">
        <div class="upload-header">
          <h2>Step 1: Upload Schema Definition</h2>
          <p>Define your data structure. Upload a JSON schema file that describes your data fields.</p>
        </div>

        <div class="upload-card">
          <input #schemaInput type="file" accept=".json" hidden (change)="onSchemaSelect($event)" />
          <div class="drop" [class.over]="schemaOver" [class.busy]="schemaUploading"
               (click)="schemaInput.click()"
               (dragover)="onDragOver($event, 'schema')"
               (dragleave)="schemaOver=false"
               (drop)="onDrop($event, 'schema')">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.5">
              <path d="M12 3v12M12 15l-4-4m4 4l4-4"/>
              <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>
            </svg>
            <p class="drop-title" *ngIf="!schemaUploading">Upload Schema File</p>
            <p class="drop-title" *ngIf="schemaUploading">Analyzing {{ schemaFile?.name }}…</p>
            <p class="drop-sub">JSON schema file · Defines field names, types, and validation</p>
            <button class="btn-primary" type="button" (click)="$event.stopPropagation(); schemaInput.click()">
              Choose File
            </button>
          </div>

          <!-- Schema Preview -->
          <div *ngIf="schemaFile && !schemaUploading" class="file-preview">
            <div class="preview-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span>{{ schemaFile.name }}</span>
              <span class="file-size">({{ (schemaFile.size / 1024).toFixed(2) }} KB)</span>
            </div>

            <button class="btn-secondary" (click)="resetSchema()" type="button">
              Choose Different File
            </button>

            <button class="btn-primary" (click)="analyzeSchema()" type="button" [disabled]="schemaAnalyzing">
              {{ schemaAnalyzing ? 'Analyzing...' : 'Analyze Schema' }}
            </button>
          </div>

          <!-- Schema Analysis Error -->
          <div *ngIf="schemaError" class="error-message">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {{ schemaError }}
          </div>
        </div>
      </div>

      <!-- Stage 2: Upload Data -->
      <div class="upload-stage" *ngIf="stage === 'data'">
        <div class="upload-header">
          <div class="progress-indicator">
            <div class="progress-step completed">✓</div>
            <div class="progress-line"></div>
            <div class="progress-step active">2</div>
          </div>
          <h2>Step 2: Upload Data File</h2>
          <p>Upload your data file. It will be validated against the schema and inserted into the created table.</p>
          <div class="schema-info">
            <strong>Schema:</strong> {{ schemaName }}
          </div>
        </div>

        <div class="upload-card">
          <input #dataInput type="file" accept=".json,.csv,.xlsx,.xls" hidden (change)="onDataSelect($event)" />
          <div class="drop" [class.over]="dataOver" [class.busy]="dataUploading"
               (click)="dataInput.click()"
               (dragover)="onDragOver($event, 'data')"
               (dragleave)="dataOver=false"
               (drop)="onDrop($event, 'data')">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.5">
              <path d="M12 3v12M12 15l-4-4m4 4l4-4"/>
              <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>
            </svg>
            <p class="drop-title" *ngIf="!dataUploading">Upload Data File</p>
            <p class="drop-title" *ngIf="dataUploading">Ingesting {{ dataFile?.name }}…</p>
            <p class="drop-sub">JSON, CSV, or Excel (.xlsx) file · Must match the schema structure</p>
            <button class="btn-primary" type="button" (click)="$event.stopPropagation(); dataInput.click()">
              Choose File
            </button>
          </div>

          <!-- Data Preview -->
          <div *ngIf="dataFile && !dataUploading" class="file-preview">
            <div class="preview-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span>{{ dataFile.name }}</span>
              <span class="file-size">({{ (dataFile.size / 1024).toFixed(2) }} KB)</span>
            </div>

            <button class="btn-secondary" (click)="resetData()" type="button">
              Choose Different File
            </button>

            <button class="btn-primary" (click)="uploadData()" type="button" [disabled]="dataAnalyzing">
              {{ dataAnalyzing ? 'Uploading...' : 'Upload & Ingest Data' }}
            </button>
          </div>

          <!-- Data Upload Error -->
          <div *ngIf="dataError" class="error-message">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {{ dataError }}
          </div>
        </div>

        <!-- Back Button -->
        <button class="btn-ghost" (click)="resetAll()" type="button">
          ← Start Over with Different Schema
        </button>
      </div>

      <!-- Stage 3: Complete -->
      <div class="upload-stage" *ngIf="stage === 'complete'">
        <div class="success-box">
          <div class="success-icon">✓</div>
          <h2>{{ alreadyExisted ? 'This Data Already Exists' : 'Data Upload Complete!' }}</h2>
          <p class="success-message">{{ alreadyExisted ? (duplicateMessage || 'This data is already stored — every page now shows the existing version.') : message }}</p>

          <div class="success-stats" *ngIf="!alreadyExisted">
            <div class="stat">
              <div class="stat-label">Schema</div>
              <div class="stat-value">{{ schemaName }}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Rows Ingested</div>
              <div class="stat-value">{{ ingestionResult?.rowsInserted || 0 }}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Table Name</div>
              <div class="stat-value">{{ ingestionResult?.tableName }}</div>
            </div>
          </div>

          <div class="success-actions">
            <button class="btn-primary" (click)="goToUploadedData()">
              Next: Uploaded Data
            </button>
            <button class="btn-secondary" (click)="resetAll()">
              Upload Another Dataset
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .upload-container {
      max-width: 600px;
      margin: 0 auto;
      padding: 2rem;
    }

    .upload-stage {
      animation: fadeIn 0.3s ease-in;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .upload-header {
      margin-bottom: 2rem;
    }

    .progress-indicator {
      display: flex;
      align-items: center;
      margin-bottom: 1rem;
      gap: 0.5rem;
    }

    .progress-step {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.9rem;
    }

    .progress-step.completed {
      background: #10b981;
      color: white;
    }

    .progress-step.active {
      background: #2563eb;
      color: white;
    }

    .progress-line {
      flex: 1;
      height: 2px;
      background: #e5e7eb;
    }

    .upload-header h2 {
      margin: 0 0 0.5rem 0;
      font-size: 1.5rem;
      color: #1f2937;
    }

    .upload-header p {
      margin: 0 0 1rem 0;
      color: #6b7280;
      font-size: 0.95rem;
    }

    .schema-info {
      padding: 0.75rem 1rem;
      background: #f0f9ff;
      border-left: 3px solid #2563eb;
      border-radius: 4px;
      font-size: 0.9rem;
      color: #1e40af;
    }

    .upload-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 2rem;
      margin-bottom: 1.5rem;
    }

    .drop {
      border: 2px dashed #d1d5db;
      border-radius: 8px;
      padding: 2.5rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s;
      background: #f9fafb;
    }

    .drop.over {
      border-color: #2563eb;
      background: #eff6ff;
    }

    .drop.busy {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .drop svg {
      margin-bottom: 1rem;
      display: block;
    }

    .drop-title {
      margin: 1rem 0 0.5rem 0;
      font-size: 1rem;
      font-weight: 600;
      color: #1f2937;
    }

    .drop-sub {
      margin: 0 0 1.5rem 0;
      font-size: 0.85rem;
      color: #6b7280;
    }

    .file-preview {
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid #e5e7eb;
    }

    .preview-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      background: #f0fdf4;
      border-radius: 6px;
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }

    .preview-item svg {
      flex-shrink: 0;
    }

    .file-size {
      margin-left: auto;
      color: #6b7280;
      font-size: 0.85rem;
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      background: #fef2f2;
      border-left: 3px solid #dc2626;
      border-radius: 4px;
      color: #7f1d1d;
      font-size: 0.9rem;
      margin-top: 1rem;
    }

    .btn-primary, .btn-secondary, .btn-ghost {
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 6px;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: block;
      width: 100%;
      text-align: center;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
      margin-top: 1rem;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
      margin-bottom: 0.5rem;
    }

    .btn-secondary:hover {
      background: #e5e7eb;
    }

    .btn-ghost {
      background: none;
      color: #2563eb;
      margin-top: 1.5rem;
    }

    .btn-ghost:hover {
      color: #1d4ed8;
    }

    .success-box {
      text-align: center;
      padding: 3rem 2rem;
      background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
      border: 1px solid #86efac;
      border-radius: 12px;
    }

    .success-icon {
      width: 60px;
      height: 60px;
      margin: 0 auto 1.5rem;
      background: #10b981;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      font-weight: bold;
    }

    .success-box h2 {
      margin: 0 0 0.5rem 0;
      font-size: 1.5rem;
      color: #065f46;
    }

    .success-message {
      color: #047857;
      margin-bottom: 2rem;
    }

    .success-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin: 2rem 0;
    }

    .stat {
      background: white;
      padding: 1rem;
      border-radius: 8px;
      border: 1px solid #d1fae5;
    }

    .stat-label {
      font-size: 0.85rem;
      color: #6b7280;
      margin-bottom: 0.5rem;
    }

    .stat-value {
      font-size: 1.1rem;
      font-weight: 600;
      color: #065f46;
      word-break: break-all;
    }

    .success-actions {
      display: flex;
      gap: 1rem;
      margin-top: 2rem;
    }

    .success-actions button {
      flex: 1;
    }
  `]
})
export class SchemaDataUploadComponent implements OnInit, OnDestroy {
  // Stage control
  stage: 'schema' | 'data' | 'complete' = 'schema';

  // Schema upload
  schemaFile: File | null = null;
  schemaName: string = '';
  schemaId: string = '';
  schemaOver = false;
  // Busy-visual flag used by the template. Mirrors schemaAnalyzing (the flag actually toggled by the
  // analyze/upload flow) so the drop zone shows a busy state and can't be re-submitted mid-flight.
  get schemaUploading(): boolean { return this.schemaAnalyzing; }
  schemaAnalyzing = false;
  schemaError = '';

  // Data upload
  dataFile: File | null = null;
  dataOver = false;
  get dataUploading(): boolean { return this.dataAnalyzing; }
  dataAnalyzing = false;
  dataError = '';

  // Results
  message = '';
  ingestionResult: any = null;

  // Versioning
  versions: DataVersion[] = [];
  selectedVersionId: string = '';
  checkingDuplicate = false;
  isDuplicate = false;
  duplicateMessage = '';

  /**
   * True when this upload did not add any new data — either the data was detected as an exact
   * duplicate of an existing version, or the backend deduped every row (0 rows inserted). In that
   * case we show an honest "already exists" completion screen instead of a misleading "0 rows".
   */
  get alreadyExisted(): boolean {
    if (this.isDuplicate) return true;
    const r = this.ingestionResult;
    return !!r && (r.rowsInserted || 0) === 0;
  }

  private destroy$ = new Subject<void>();

  constructor(
    private schemaService: SchemaManagementService,
    private http: HttpClient,
    private router: Router,
    private active: ActiveDatasetService,
    private versioningService: DataVersioningService,
    private uploadService: UploadService
  ) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // === SCHEMA UPLOAD ===

  onDragOver(event: DragEvent, type: 'schema' | 'data'): void {
    event.preventDefault();
    event.stopPropagation();
    if (type === 'schema') this.schemaOver = true;
    else this.dataOver = true;
  }

  onDrop(event: DragEvent, type: 'schema' | 'data'): void {
    event.preventDefault();
    event.stopPropagation();
    if (type === 'schema') this.schemaOver = false;
    else this.dataOver = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      if (type === 'schema') this.schemaFile = files[0];
      else this.dataFile = files[0];
    }
  }

  onSchemaSelect(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      this.schemaFile = target.files[0];
    }
  }

  onDataSelect(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      this.dataFile = target.files[0];
    }
  }

  analyzeSchema(): void {
    if (!this.schemaFile) return;

    this.schemaAnalyzing = true;
    this.schemaError = '';

    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const schema = JSON.parse(e.target.result);

        // Validate schema structure
        if (!schema.schemaName || !schema.fields || !Array.isArray(schema.fields)) {
          throw new Error('Invalid schema: must have schemaName and fields array');
        }

        this.schemaName = schema.schemaName;

        // Create the schema via API
        this.schemaService.uploadSchema(schema).pipe(
          takeUntil(this.destroy$)
        ).subscribe(
          (result) => {
            this.schemaId = result.id;
            this.schemaAnalyzing = false;
            this.stage = 'data';
            this.message = `Schema "${schema.schemaName}" analyzed and tables created successfully!`;
            // Load existing versions for this schema
            this.loadVersionsForSchema(result.id);
          },
          (error) => {
            this.schemaError = error.error?.message || 'Failed to create schema';
            this.schemaAnalyzing = false;
          }
        );
      } catch (error: any) {
        this.schemaError = `Invalid JSON: ${error.message}`;
        this.schemaAnalyzing = false;
      }
    };

    reader.readAsText(this.schemaFile);
  }

  resetSchema(): void {
    this.schemaFile = null;
    this.schemaError = '';
  }

  // === DATA UPLOAD ===

  uploadData(): void {
    if (!this.dataFile || !this.schemaId) return;

    this.dataAnalyzing = true;
    this.dataError = '';
    this.isDuplicate = false;
    this.duplicateMessage = '';

    const fileName = this.dataFile.name.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        let data: any;

        if (isExcel) {
          data = this.parseExcel(e.target.result as ArrayBuffer);
        } else if (fileName.endsWith('.json')) {
          data = JSON.parse(e.target.result);
        } else if (fileName.endsWith('.csv')) {
          data = this.parseCSV(e.target.result);
        } else {
          throw new Error('Unsupported file format. Please upload a .json, .csv, or .xlsx file.');
        }

        this.checkAndIngestData(data);
      } catch (error: any) {
        this.dataError = `Error processing file: ${error.message}`;
        this.dataAnalyzing = false;
      }
    };
    reader.onerror = () => {
      this.dataError = 'Could not read the selected file.';
      this.dataAnalyzing = false;
    };

    // Excel is binary and must be read as an ArrayBuffer; JSON/CSV are read as text.
    if (isExcel) {
      reader.readAsArrayBuffer(this.dataFile);
    } else {
      reader.readAsText(this.dataFile);
    }
  }

  private checkAndIngestData(data: any): void {
    this.checkingDuplicate = true;
    const checksum = this.versioningService.calculateChecksum(data);

    this.versioningService.checkDuplicate(this.schemaId, checksum).pipe(
      takeUntil(this.destroy$)
    ).subscribe(
      (result) => {
        this.checkingDuplicate = false;
        if (result.isDuplicate && result.existingVersion) {
          // The data is byte-for-byte an existing version: reuse it instead of re-ingesting a
          // redundant copy (which would create a duplicate table/version).
          this.isDuplicate = true;
          this.duplicateMessage = `This data matches version ${result.existingVersion.versionNumber} (${result.existingVersion.uploadedAt.split('T')[0]}). Using the existing version — no re-ingestion needed.`;
          this.dataAnalyzing = false;
          this.stage = 'complete';
          // Even though nothing was re-ingested, switch every page to this schema's existing dataset so
          // the user still sees the data they just uploaded (instead of a stale/previous dataset).
          this.active.refreshAfterUpload(this.schemaName);
        } else {
          this.sendIngest(data, checksum);
        }
      },
      (error) => {
        this.checkingDuplicate = false;
        console.error('Error checking duplicate:', error);
        this.sendIngest(data, checksum);
      }
    );
  }

  private loadVersionsForSchema(schemaId: string): void {
    this.versioningService.getVersionsBySchema(schemaId).pipe(
      takeUntil(this.destroy$)
    ).subscribe(
      (versions) => {
        this.versions = versions.sort((a, b) => b.versionNumber - a.versionNumber);
      },
      (error) => {
        console.error('Error loading versions:', error);
      }
    );
  }

  /** Sends the parsed row array to the backend for schema-based ingestion (versioning is handled server-side). */
  private sendIngest(data: any, checksum?: string, originalVersionId?: string): void {
    const tableName = this.schemaName + '_' + new Date().toISOString().split('T')[0];
    const isDup = !!originalVersionId;

    this.schemaService.ingestWithSchema(
      this.schemaId,
      tableName,
      data,
      environment.defaultUserId,
      false
    ).pipe(
      takeUntil(this.destroy$)
    ).subscribe(
      (result) => {
        this.ingestionResult = result;
        this.dataAnalyzing = false;
        this.stage = 'complete';

        // Register the version
        if (checksum && this.dataFile) {
          const versionChecksum = checksum || this.versioningService.calculateChecksum(data);
          this.versioningService.registerVersion(
            this.schemaId,
            this.schemaName,
            result.tableName || tableName,
            versionChecksum,
            Array.isArray(data) ? data.length : (data.length || 0),
            this.dataFile.name,
            isDup,
            originalVersionId
          ).pipe(takeUntil(this.destroy$)).subscribe(
            () => {
              this.loadVersionsForSchema(this.schemaId);
            },
            (error) => {
              console.error('Error registering version:', error);
            }
          );
        }

        this.message = result.message && result.status !== 'SUCCESS'
          ? result.message
          : `Successfully ingested ${result.rowsInserted} rows into table "${result.tableName}"`;
        if (isDup) {
          this.message += ' (Using existing version due to matching data)';
        }
        // Pass the exact dataset id the backend resolved to (a new dataset, or the existing version a
        // deduped re-upload reused) so every page reliably switches to THIS data — even when no new row
        // was created (which would otherwise leave pages on a stale/previous dataset).
        this.active.refreshAfterUpload(this.schemaName, result?.uploadId);
      },
      (error) => {
        this.dataError = error.error?.message || 'Failed to ingest data';
        this.dataAnalyzing = false;
      }
    );
  }

  private parseCSV(csvContent: string): any[] {
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) throw new Error('CSV must have headers and data');

    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = values[index]?.trim() || null;
      });
      data.push(obj);
    }

    return data;
  }

  /** Parses the first sheet of an Excel workbook into an array of row objects keyed by the header row. */
  private parseExcel(buffer: ArrayBuffer): any[] {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) throw new Error('The Excel file has no sheets.');

    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(
      workbook.Sheets[firstSheet],
      { defval: null, blankrows: false }
    );
    if (!rows.length) throw new Error('The Excel sheet has no data rows.');

    return rows;
  }

  resetData(): void {
    this.dataFile = null;
    this.dataError = '';
  }

  resetAll(): void {
    this.stage = 'schema';
    this.schemaFile = null;
    this.schemaName = '';
    this.schemaId = '';
    this.schemaError = '';
    this.dataFile = null;
    this.dataError = '';
    this.message = '';
    this.ingestionResult = null;
    this.versions = [];
    this.selectedVersionId = '';
    this.isDuplicate = false;
    this.duplicateMessage = '';
    this.uploadService.reset();
  }

  goToUploadedData(): void {
    this.router.navigate(['/data']);
  }
}
