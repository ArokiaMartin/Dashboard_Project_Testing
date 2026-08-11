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
        <div class="upload-header centered-header">
          <h2>Step 1: Upload Data Definition</h2>
          <p>Choose whether to upload a JSON schema or let us auto-detect columns from a CSV/Excel file.</p>
        </div>

        <div class="upload-split">
          <div class="upload-card split-side">
            <input #schemaInput type="file" accept=".json" hidden (change)="onSchemaSelect($event)" />
            <div class="drop" [class.over]="schemaOver" [class.busy]="schemaAnalyzing"
                 (click)="schemaInput.click()"
                 (dragover)="onDragOver($event, 'schema')"
                 (dragleave)="schemaOver=false"
                 (drop)="onDrop($event, 'schema')">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.5">
                <path d="M12 3v12M12 15l-4-4m4 4l4-4"/>
                <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>
              </svg>
              <p class="drop-title" *ngIf="!schemaAnalyzing">Upload JSON Schema</p>
              <p class="drop-title" *ngIf="schemaAnalyzing">Analyzing {{ schemaFile?.name }}…</p>
              <p class="drop-sub">Strict validation structure</p>
              <button class="btn-primary" type="button" (click)="$event.stopPropagation(); schemaInput.click()">
                Choose File
              </button>
            </div>
            <p class="schemaless-hint" style="text-align: center; margin-top: 1rem;">Upload a JSON file that explicitly defines your column names, exact data types, and relationships.</p>

            <!-- Schema Preview -->
            <div *ngIf="schemaFile && !schemaAnalyzing" class="file-preview">
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

          <div class="schemaless-divider-vert"><span>or</span></div>

          <div class="upload-card split-side">
            <div class="drop" (click)="startSchemaless()">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="8" y1="13" x2="16" y2="13"/>
                <line x1="8" y1="17" x2="16" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              <p class="drop-title">Skip JSON Schema</p>
              <p class="drop-sub">Auto-detect from CSV / Excel</p>
              <button class="btn-outline" type="button" (click)="$event.stopPropagation(); startSchemaless()">
                Skip this step →
              </button>
            </div>
            <p class="schemaless-hint" style="text-align: center; margin-top: 1rem;">For CSV or Excel files, columns and types are auto-detected. No JSON schema required.</p>
          </div>
        </div>
      </div>

      <!-- Stage 2: Upload Data -->
      <div class="upload-stage centered-stage" *ngIf="stage === 'data'">
        <div class="upload-header">
          <div class="progress-indicator">
            <div class="progress-step completed">✓</div>
            <div class="progress-line"></div>
            <div class="progress-step active">2</div>
          </div>
          <h2>Step 2: Upload Data File</h2>
          <p *ngIf="!schemaless">Upload your data file. It will be validated against the schema and inserted into the created table.</p>
          <p *ngIf="schemaless">Upload your CSV or Excel file. Columns and types are auto-detected — no schema needed.</p>
          <div class="schema-info" *ngIf="!schemaless">
            <strong>Schema:</strong> {{ schemaName }}
          </div>
        </div>

        <div class="upload-card">
          <input #dataInput type="file" accept=".json,.csv,.xlsx,.xls" hidden (change)="onDataSelect($event)" />
          <div class="drop" [class.over]="dataOver" [class.busy]="dataAnalyzing"
               (click)="dataInput.click()"
               (dragover)="onDragOver($event, 'data')"
               (dragleave)="dataOver=false"
               (drop)="onDrop($event, 'data')">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.5">
              <path d="M12 3v12M12 15l-4-4m4 4l4-4"/>
              <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>
            </svg>
            <p class="drop-title" *ngIf="!dataAnalyzing">Upload Data File</p>
            <p class="drop-title" *ngIf="dataAnalyzing">Ingesting {{ dataFile?.name }}…</p>
            <p class="drop-sub">JSON, CSV, or Excel (.xlsx) file · Must match the schema structure</p>
            <button class="btn-primary" type="button" (click)="$event.stopPropagation(); dataInput.click()">
              Choose File
            </button>
          </div>

          <!-- Data Preview -->
          <div *ngIf="dataFile && !dataAnalyzing" class="file-preview">
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
      <div class="upload-stage centered-stage" *ngIf="stage === 'complete'">
        <div class="success-box">
          <div class="success-icon">✓</div>
          <h2>Data Upload Complete!</h2>
          <p class="success-message">{{ message }}</p>

          <div class="success-stats">
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
      max-width: 960px;
      margin: 0 auto;
      padding: 2rem;
      min-height: 100%;
    }

    .centered-stage {
      max-width: 560px;
      margin: 0 auto;
    }

    .centered-header {
      text-align: center;
    }

    .upload-split {
      display: flex;
      gap: 1rem;
      align-items: stretch;
      margin-bottom: 1rem;
    }

    .split-side {
      flex: 1;
      margin-bottom: 0 !important;
      display: flex;
      flex-direction: column;
    }

    .schemaless-divider-vert {
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      color: var(--text-muted, #9ca3af);
      font-size: 0.8rem;
      font-weight: 500;
    }

    .schemaless-divider-vert::before {
      content: '';
      position: absolute;
      top: 10%;
      bottom: 10%;
      left: 50%;
      width: 1px;
      background: var(--border-color, #e5e7eb);
    }

    .schemaless-divider-vert span {
      position: relative;
      background: var(--bg-app, #f4f6fb);
      color: var(--text-secondary, #6b7280);
      padding: 0.75rem 0.5rem;
      border-radius: 4px;
    }

    @media (max-width: 768px) {
      .upload-split {
        flex-direction: column;
      }
      .schemaless-divider-vert::before {
        top: 50%; bottom: auto; left: 10%; right: 10%; width: auto; height: 1px;
      }
      .schemaless-divider-vert span {
        padding: 0 0.75rem;
      }
    }

    .upload-stage {
      animation: fadeIn 0.3s ease-in;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .upload-header {
      margin-bottom: 1.25rem;
    }

    .progress-indicator {
      display: flex;
      align-items: center;
      margin-bottom: 0.75rem;
      gap: 0.5rem;
    }

    .progress-step {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.85rem;
    }

    .progress-step.completed {
      background: #10b981;
      color: white;
    }

    .progress-step.active {
      background: var(--accent-primary, #2563eb);
      color: white;
    }

    .progress-line {
      flex: 1;
      height: 2px;
      background: var(--border-color, #e5e7eb);
    }

    .upload-header h2 {
      margin: 0 0 0.35rem 0;
      font-size: 1.35rem;
      color: var(--text-primary, #1f2937);
      font-weight: 800;
    }

    .upload-header p {
      margin: 0 0 0.75rem 0;
      color: var(--text-secondary, #6b7280);
      font-size: 0.9rem;
    }

    .schema-info {
      padding: 0.5rem 0.75rem;
      background: var(--accent-subtle, #f0f9ff);
      border-left: 3px solid var(--accent-primary, #2563eb);
      border-radius: 4px;
      font-size: 0.85rem;
      color: var(--accent-primary, #1e40af);
    }

    .upload-card {
      background: var(--bg-surface, white);
      border: 1px solid var(--border-color, #e5e7eb);
      border-radius: 12px;
      padding: 1.25rem;
      margin-bottom: 1rem;
      box-shadow: var(--card-shadow, none);
    }

    .drop {
      border: 2px dashed var(--border-color, #d1d5db);
      border-radius: 8px;
      padding: 2.25rem 1.5rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s;
      background: var(--bg-subtle, #f9fafb);
      min-height: 180px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }

    .drop.over {
      border-color: var(--accent-primary, #2563eb);
      background: var(--accent-subtle, #eff6ff);
    }

    .drop.busy {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .drop svg {
      width: 32px;
      height: 32px;
      margin: 0 auto 0.5rem;
      display: block;
    }

    .drop-title {
      margin: 0.75rem 0 0.25rem 0;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-primary, #1f2937);
    }

    .drop-sub {
      margin: 0 0 1rem 0;
      font-size: 0.8rem;
      color: var(--text-secondary, #6b7280);
    }

    .file-preview {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border-color, #e5e7eb);
    }

    .preview-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0.75rem;
      background: var(--accent-subtle, #f0fdf4);
      color: var(--text-primary, #1f2937);
      border-radius: 6px;
      margin-bottom: 0.75rem;
      font-size: 0.85rem;
    }

    .preview-item svg {
      flex-shrink: 0;
    }

    .file-size {
      margin-left: auto;
      color: var(--text-muted, #6b7280);
      font-size: 0.8rem;
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      background: rgba(239, 68, 68, 0.15);
      border-left: 3px solid #dc2626;
      border-radius: 4px;
      color: var(--text-primary, #7f1d1d);
      font-size: 0.85rem;
      margin-top: 0.75rem;
    }

    .btn-primary, .btn-secondary, .btn-ghost {
      padding: 0.5rem 1.25rem;
      border: none;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: block;
      width: 100%;
      text-align: center;
    }

    .btn-primary {
      background: var(--accent-primary, #2563eb);
      color: white;
      margin-top: 0.75rem;
    }

    .btn-primary:hover:not(:disabled) {
      background: var(--accent-hover, #1d4ed8);
    }

    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: var(--bg-subtle, #f3f4f6);
      color: var(--text-primary, #374151);
      border: 1px solid var(--border-color, #e5e7eb);
      margin-bottom: 0.4rem;
    }

    .btn-secondary:hover {
      background: var(--bg-hover, #e5e7eb);
    }

    .btn-ghost {
      background: none;
      color: var(--accent-primary, #2563eb);
      margin-top: 1rem;
    }

    .btn-ghost:hover {
      color: var(--accent-hover, #1d4ed8);
    }

    .btn-outline {
      padding: 0.5rem 1.25rem;
      border: 1.5px solid var(--accent-primary, #2563eb);
      border-radius: 6px;
      background: var(--bg-surface, white);
      color: var(--accent-primary, #2563eb);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      width: 100%;
    }

    .btn-outline:hover {
      background: var(--accent-subtle, #eff6ff);
    }

    .schemaless-hint {
      margin: 0.5rem 0 0;
      font-size: 0.75rem;
      color: var(--text-secondary, #6b7280);
    }

    .success-box {
      text-align: center;
      padding: 2rem 1.5rem;
      background: var(--bg-surface, #f0fdf4);
      border: 1px solid var(--border-color, #86efac);
      border-radius: 12px;
    }

    .success-icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 1rem;
      background: #10b981;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      font-weight: bold;
    }

    .success-box h2 {
      margin: 0 0 0.5rem 0;
      font-size: 1.35rem;
      color: var(--text-primary, #065f46);
    }

    .success-message {
      color: var(--text-secondary, #047857);
      margin-bottom: 1.25rem;
      font-size: 0.9rem;
    }

    .success-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
      margin: 1.25rem 0;
    }

    .stat {
      background: var(--bg-subtle, white);
      padding: 0.75rem;
      border-radius: 8px;
      border: 1px solid var(--border-color, #d1fae5);
    }

    .stat-label {
      font-size: 0.8rem;
      color: var(--text-secondary, #6b7280);
      margin-bottom: 0.35rem;
    }

    .stat-value {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary, #065f46);
      word-break: break-all;
    }

    .success-actions {
      display: flex;
      gap: 1rem;
      margin-top: 1.25rem;
    }

    .success-actions button {
      flex: 1;
    }
  `]
})
export class SchemaDataUploadComponent implements OnInit, OnDestroy {
  // Stage control
  stage: 'schema' | 'data' | 'complete' = 'schema';
  // Schemaless plugin mode: CSV/Excel auto-detect, no JSON schema required.
  schemaless = false;

  // Schema upload
  schemaFile: File | null = null;
  schemaName: string = '';
  schemaId: string = '';
  schemaOver = false;
  schemaAnalyzing = false;
  schemaError = '';

  // Data upload
  dataFile: File | null = null;
  dataOver = false;
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
      if (type === 'schema') this.handleSchemaFile(files[0]);
      else this.dataFile = files[0];
    }
  }

  onSchemaSelect(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      this.handleSchemaFile(target.files[0]);
    }
  }

  /**
   * Handles a file dropped/selected on the schema step. JSON files are analysed
   * automatically (no button click). CSV/Excel files need no schema — they go straight
   * to the data-upload step (schemaless mode).
   */
  private handleSchemaFile(file: File): void {
    const name = file.name.toLowerCase();
    const isTabular = name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls');
    if (isTabular) {
      this.startSchemaless();
      this.dataFile = file;
      return;
    }
    this.schemaFile = file;
    this.analyzeSchema();
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

  /** Skips the schema step for CSV/Excel and goes straight to data upload (schemaless mode). */
  startSchemaless(): void {
    this.schemaless = true;
    this.schemaName = 'Auto-detected (CSV/Excel)';
    this.schemaError = '';
    this.stage = 'data';
  }

  // === DATA UPLOAD ===

  uploadData(): void {
    if (!this.dataFile) return;
    if (this.schemaless) { this.uploadSchemaless(); return; }
    if (!this.schemaId) return;

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

  /**
   * Schemaless plugin path: for CSV/Excel we let the backend auto-detect columns and types
   * via the shared UploadService (POST /api/upload), so no JSON schema is required. This does
   * not touch the existing schema-based ingestion flow.
   */
  private async uploadSchemaless(): Promise<void> {
    if (!this.dataFile) return;
    this.dataAnalyzing = true;
    this.dataError = '';
    try {
      const tables = await this.uploadService.parse(this.dataFile);
      const localRows = tables.reduce((total, t) => total + (t.rows?.length || 0), 0);
      // Prefer the backend's authoritative count (handles quoted multi-line CSV cells).
      const rows = this.uploadService.lastRowCount || localRows;
      this.ingestionResult = {
        rowsInserted: rows,
        tableName: this.uploadService.fileName || this.dataFile.name
      };
      this.message = `Successfully ingested ${rows} row(s) from "${this.dataFile.name}" with auto-detected columns.`;
      this.active.refreshAfterUpload(this.dataFile.name);
      this.stage = 'complete';
    } catch (err: any) {
      this.dataError = err?.message || 'Failed to ingest data.';
    } finally {
      this.dataAnalyzing = false;
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
          // Identical data already exists — do NOT re-ingest it. Reuse the existing version,
          // record a lightweight duplicate marker, and complete the flow.
          const existing = result.existingVersion;
          this.isDuplicate = true;
          this.duplicateMessage = `This data matches version ${existing.versionNumber} (${existing.uploadedAt.split('T')[0]}). Reusing the existing version — data was not re-ingested.`;
          this.reuseExistingVersion(data, checksum, existing);
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

  /**
   * Handles a detected duplicate upload: reuses the existing version's table instead of
   * re-ingesting identical data, registers a duplicate marker version (metadata only), and
   * completes the flow.
   */
  private reuseExistingVersion(data: any, checksum: string, existing: DataVersion): void {
    this.dataAnalyzing = false;
    this.ingestionResult = {
      rowsInserted: existing.rowCount ?? (Array.isArray(data) ? data.length : 0),
      tableName: existing.tableName
    };
    this.message = this.duplicateMessage;
    this.stage = 'complete';

    if (this.dataFile) {
      this.versioningService.registerVersion(
        this.schemaId,
        this.schemaName,
        existing.tableName,
        checksum,
        Array.isArray(data) ? data.length : (data.length || 0),
        this.dataFile.name,
        true,
        existing.versionId
      ).pipe(takeUntil(this.destroy$)).subscribe(
        () => this.loadVersionsForSchema(this.schemaId),
        (error) => console.error('Error registering duplicate version:', error)
      );
    }

    this.active.refreshAfterUpload(this.dataFile?.name ?? this.schemaName);
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
        this.active.refreshAfterUpload(this.schemaName);
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
    this.schemaless = false;
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
