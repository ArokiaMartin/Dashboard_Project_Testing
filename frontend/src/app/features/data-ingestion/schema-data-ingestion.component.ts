import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchemaManagementService, SchemaResponse, ValidationResult } from '@core/services/schema-management.service';
import { HttpClient } from '@angular/common/http';
import { FileSizePipe } from '@shared/pipes/file-size.pipe';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-schema-data-ingestion',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FileSizePipe],
  template: `
    <div class="data-ingestion-container">
      <div class="ingestion-header">
        <h1>Data Ingestion</h1>
        <p class="subtitle">Upload and ingest data using predefined schemas</p>
      </div>

      <div class="ingestion-steps">
        <!-- Step 1: Select Schema -->
        <div class="step" [class.active]="currentStep === 1" [class.completed]="currentStep > 1">
          <h2>1. Select Schema</h2>
          <div *ngIf="currentStep >= 1" class="step-content">
            <div class="form-group">
              <label>Choose a Schema *</label>
              <select
                [(ngModel)]="selectedSchemaId"
                (change)="onSchemaSelected()"
                class="form-control">
                <option value="">-- Select a schema --</option>
                <option *ngFor="let schema of (schemas$ | async)" [value]="schema.id">
                  {{ schema.schemaName }} (v{{ schema.schemaVersion }})
                </option>
              </select>
              <small *ngIf="selectedSchema$ | async as schema" class="schema-info">
                Fields: {{ schema.fields.length }} | Created: {{ schema.createdAt | date:'short' }}
              </small>
            </div>

            <div *ngIf="selectedSchema$ | async as schema" class="schema-preview">
              <h3>Schema Fields</h3>
              <div class="fields-grid">
                <div *ngFor="let field of schema.fields" class="field-info">
                  <strong>{{ field.fieldName }}</strong>
                  <span class="field-type">{{ field.fieldType }}</span>
                  <span *ngIf="field.isRequired" class="required">Required</span>
                </div>
              </div>
            </div>

            <div class="step-actions">
              <button
                class="btn-primary"
                (click)="moveToNextStep()"
                [disabled]="!selectedSchemaId">
                Next: Upload Data
              </button>
            </div>
          </div>
        </div>

        <!-- Step 2: Upload Data -->
        <div class="step" [class.active]="currentStep === 2" [class.completed]="currentStep > 2">
          <h2>2. Upload Data</h2>
          <div *ngIf="currentStep >= 2" class="step-content">
            <div class="file-upload-area"
              [class.dragover]="isDragOver"
              (drop)="onFileDrop($event)"
              (dragover)="onDragOver($event)"
              (dragleave)="isDragOver = false">
              <div class="upload-content">
                <p>📁 Drag and drop JSON/CSV file or click to browse</p>
                <input
                  type="file"
                  #fileInput
                  (change)="onFileSelected($event)"
                  accept=".json,.csv"
                  style="display: none">
                <button type="button" class="btn-secondary" (click)="fileInput.click()">
                  Choose File
                </button>
              </div>
            </div>

            <div *ngIf="uploadedFile" class="file-info">
              <p>✓ File selected: <strong>{{ uploadedFile.name }}</strong> ({{ uploadedFile.size | fileSize }})</p>
            </div>

            <div class="form-group">
              <label>Table Name (optional)</label>
              <input
                type="text"
                [(ngModel)]="tableName"
                placeholder="e.g., customer_data"
                class="form-control"
                [disabled]="!uploadedFile">
              <small>If not provided, will be auto-generated</small>
            </div>

            <div class="step-actions">
              <button
                class="btn-secondary"
                (click)="previousStep()">
                Back
              </button>
              <button
                class="btn-primary"
                (click)="moveToNextStep()"
                [disabled]="!uploadedFile">
                Next: Validate & Ingest
              </button>
            </div>
          </div>
        </div>

        <!-- Step 3: Validate & Ingest -->
        <div class="step" [class.active]="currentStep === 3">
          <h2>3. Validate & Ingest Data</h2>
          <div *ngIf="currentStep >= 3" class="step-content">
            <div class="validation-section">
              <h3>Validation Results</h3>

              <div *ngIf="isValidating" class="validating">
                <div class="spinner"></div>
                <p>Validating data against schema...</p>
              </div>

              <div *ngIf="validationResult && !isValidating">
                <div [class.validation-box]="true" [class.success]="validationResult.isValid" [class.error]="!validationResult.isValid">
                  <h4>{{ validationResult.isValid ? '✓ Validation Passed' : '✗ Validation Failed' }}</h4>
                  <p>{{ validationResult.errorCount }} errors, {{ validationResult.warningCount }} warnings</p>

                  <div *ngIf="validationResult.errors.length > 0" class="error-list">
                    <strong>Errors:</strong>
                    <ul>
                      <li *ngFor="let error of validationResult.errors | slice:0:5">{{ error }}</li>
                      <li *ngIf="validationResult.errors.length > 5" class="more">
                        ... and {{ validationResult.errors.length - 5 }} more errors
                      </li>
                    </ul>
                  </div>

                  <div *ngIf="validationResult.warnings.length > 0" class="warning-list">
                    <strong>Warnings:</strong>
                    <ul>
                      <li *ngFor="let warning of validationResult.warnings | slice:0:5">{{ warning }}</li>
                      <li *ngIf="validationResult.warnings.length > 5" class="more">
                        ... and {{ validationResult.warnings.length - 5 }} more warnings
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div class="validation-actions">
                <button
                  class="btn-secondary"
                  (click)="validateData()">
                  {{ validationResult ? 'Re-validate' : 'Validate Data' }}
                </button>
              </div>
            </div>

            <div *ngIf="validationResult?.isValid" class="ingest-section">
              <h3>Ready to Ingest</h3>
              <p>Data passed validation. Click below to ingest into the database.</p>

              <div class="form-group">
                <label>
                  <input type="checkbox" [(ngModel)]="skipValidation">
                  Skip validation on ingest (validation already passed)
                </label>
              </div>

              <div class="ingest-actions">
                <button
                  class="btn-primary"
                  (click)="ingestData()"
                  [disabled]="isIngesting">
                  {{ isIngesting ? 'Ingesting...' : 'Ingest Data' }}
                </button>
              </div>
            </div>

            <div *ngIf="ingestResult" class="ingest-result" [class.success]="ingestResult.status === 'complete'">
              <h4>{{ ingestResult.status === 'complete' ? '✓ Ingestion Complete' : '⚠ Ingestion Result' }}</h4>
              <p>Table: <strong>{{ ingestResult.tableName }}</strong></p>
              <p>Rows Inserted: <strong>{{ ingestResult.rowsInserted }}</strong></p>
              <p>{{ ingestResult.message }}</p>

              <div class="result-actions">
                <button class="btn-primary" (click)="goToDashboard()">Go to Dashboards</button>
                <button class="btn-secondary" (click)="startOver()">Ingest Another Dataset</button>
              </div>
            </div>

            <div class="step-actions">
              <button
                class="btn-secondary"
                (click)="previousStep()"
                [disabled]="isValidating || isIngesting">
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .data-ingestion-container {
      padding: 2rem;
      background: var(--bg-primary, #f5f5f5);
      min-height: 100vh;
    }

    .ingestion-header {
      margin-bottom: 2rem;
    }

    .ingestion-header h1 {
      font-size: 2rem;
      margin: 0 0 0.5rem 0;
      color: var(--text-primary, #333);
    }

    .subtitle {
      color: var(--text-secondary, #666);
      margin: 0;
    }

    .ingestion-steps {
      max-width: 900px;
    }

    .step {
      background: white;
      border-radius: 8px;
      margin-bottom: 1.5rem;
      overflow: hidden;
      border: 2px solid var(--border-color, #ddd);
      transition: all 0.3s;
    }

    .step.completed {
      background: var(--bg-secondary, #f9f9f9);
      border-color: #28a745;
    }

    .step.active {
      border-color: var(--primary, #007bff);
      box-shadow: 0 4px 12px rgba(0,123,255,0.1);
    }

    .step h2 {
      margin: 0;
      padding: 1rem;
      background: var(--bg-secondary, #f9f9f9);
      color: var(--text-primary, #333);
      border-bottom: 1px solid var(--border-color, #ddd);
      cursor: pointer;
    }

    .step-content {
      padding: 2rem;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: var(--text-primary, #333);
    }

    .form-control {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid var(--border-color, #ddd);
      border-radius: 4px;
      font-size: 1rem;
      font-family: inherit;
    }

    .form-control:focus {
      outline: none;
      border-color: var(--primary, #007bff);
      box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
    }

    .schema-info {
      display: block;
      margin-top: 0.5rem;
      color: var(--text-secondary, #666);
    }

    .schema-preview {
      background: var(--bg-secondary, #f9f9f9);
      padding: 1.5rem;
      border-radius: 4px;
      margin: 1.5rem 0;
    }

    .schema-preview h3 {
      margin: 0 0 1rem 0;
      color: var(--text-primary, #333);
    }

    .fields-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
    }

    .field-info {
      background: white;
      padding: 1rem;
      border-radius: 4px;
      border: 1px solid var(--border-color, #ddd);
    }

    .field-info strong {
      display: block;
      margin-bottom: 0.5rem;
      color: var(--text-primary, #333);
    }

    .field-type {
      display: inline-block;
      background: var(--primary, #007bff);
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 3px;
      font-size: 0.85rem;
      margin-right: 0.5rem;
    }

    .required {
      display: inline-block;
      background: #dc3545;
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 3px;
      font-size: 0.75rem;
    }

    .file-upload-area {
      border: 2px dashed var(--border-color, #ddd);
      border-radius: 8px;
      padding: 2rem;
      text-align: center;
      transition: all 0.3s;
      cursor: pointer;
      background: var(--bg-secondary, #f9f9f9);
    }

    .file-upload-area.dragover {
      border-color: var(--primary, #007bff);
      background: rgba(0,123,255,0.05);
    }

    .upload-content p {
      margin: 0 0 1rem 0;
      color: var(--text-secondary, #666);
    }

    .file-info {
      background: #d4edda;
      color: #155724;
      padding: 1rem;
      border-radius: 4px;
      margin: 1rem 0;
    }

    .validation-section, .ingest-section {
      margin-bottom: 2rem;
    }

    .validation-section h3, .ingest-section h3 {
      margin: 0 0 1rem 0;
      color: var(--text-primary, #333);
    }

    .validating {
      text-align: center;
      padding: 2rem;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid rgba(0,0,0,0.1);
      border-top-color: var(--primary, #007bff);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .validation-box {
      padding: 1.5rem;
      border-radius: 4px;
      border-left: 4px solid;
      margin-bottom: 1rem;
    }

    .validation-box.success {
      background: #d4edda;
      border-color: #28a745;
      color: #155724;
    }

    .validation-box.error {
      background: #f8d7da;
      border-color: #dc3545;
      color: #721c24;
    }

    .validation-box h4 {
      margin: 0 0 0.5rem 0;
    }

    .error-list, .warning-list {
      margin: 1rem 0 0 0;
    }

    .error-list ul, .warning-list ul {
      margin: 0.5rem 0 0 1.5rem;
      padding: 0;
    }

    .error-list li, .warning-list li {
      margin: 0.25rem 0;
    }

    .more {
      font-style: italic;
      opacity: 0.8;
    }

    .validation-actions {
      margin: 1rem 0 0 0;
    }

    .ingest-result {
      padding: 1.5rem;
      border-radius: 4px;
      border-left: 4px solid;
      margin: 1rem 0;
    }

    .ingest-result.success {
      background: #d4edda;
      border-color: #28a745;
      color: #155724;
    }

    .ingest-result h4 {
      margin: 0 0 0.5rem 0;
    }

    .ingest-result p {
      margin: 0.5rem 0;
    }

    .result-actions {
      display: flex;
      gap: 1rem;
      margin-top: 1rem;
    }

    .step-actions {
      display: flex;
      gap: 1rem;
      justify-content: flex-start;
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border-color, #ddd);
    }

    .btn-primary, .btn-secondary {
      padding: 0.75rem 1.5rem;
      font-size: 1rem;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.3s;
    }

    .btn-primary {
      background: var(--primary, #007bff);
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: var(--primary-dark, #0056b3);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: var(--border-color, #ddd);
      color: var(--text-primary, #333);
    }

    .btn-secondary:hover:not(:disabled) {
      background: var(--bg-secondary, #f0f0f0);
    }

    .btn-secondary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `]
})
export class SchemaDataIngestionComponent implements OnInit, OnDestroy {
  currentStep = 1;
  schemas$ = this.schemaManagementService.getSchemas$();
  selectedSchema$ = this.schemaManagementService.getCurrentSchema$();

  selectedSchemaId = '';
  uploadedFile: File | null = null;
  tableName = '';
  isDragOver = false;
  isValidating = false;
  isIngesting = false;
  skipValidation = false;
  validationResult: ValidationResult | null = null;
  ingestResult: any | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private schemaManagementService: SchemaManagementService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.schemaManagementService.listSchemas().pipe(
      takeUntil(this.destroy$)
    ).subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSchemaSelected(): void {
    if (this.selectedSchemaId) {
      this.schemaManagementService.getSchema(this.selectedSchemaId).pipe(
        takeUntil(this.destroy$)
      ).subscribe();
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.uploadedFile = files[0];
    }
  }

  onFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const files = target.files;
    if (files && files.length > 0) {
      this.uploadedFile = files[0];
    }
  }

  validateData(): void {
    if (!this.uploadedFile || !this.selectedSchemaId) return;

    this.isValidating = true;
    const reader = new FileReader();

    reader.onload = (e: any) => {
      try {
        const content = e.target.result;
        const data = this.uploadedFile?.name.endsWith('.json')
          ? JSON.parse(content)
          : this.parseCsvToJson(content);

        this.schemaManagementService.validateData(this.selectedSchemaId, data).pipe(
          takeUntil(this.destroy$)
        ).subscribe(
          (result) => {
            this.validationResult = result;
            this.isValidating = false;
          },
          (error) => {
            alert('Validation error: ' + (error.error?.message || 'Unknown error'));
            this.isValidating = false;
          }
        );
      } catch (error) {
        alert('Error reading file: ' + error);
        this.isValidating = false;
      }
    };

    reader.readAsText(this.uploadedFile);
  }

  ingestData(): void {
    if (!this.uploadedFile || !this.selectedSchemaId) return;

    this.isIngesting = true;
    const reader = new FileReader();

    reader.onload = (e: any) => {
      try {
        const content = e.target.result;
        const data = this.uploadedFile?.name.endsWith('.json')
          ? JSON.parse(content)
          : this.parseCsvToJson(content);

        this.schemaManagementService.ingestWithSchema(
          this.selectedSchemaId,
          this.tableName || '',
          data,
          environment.defaultUserId,
          false
        ).pipe(
          takeUntil(this.destroy$)
        ).subscribe(
          (result) => {
            this.ingestResult = result;
            this.isIngesting = false;
          },
          (error) => {
            alert('Ingestion error: ' + (error.error?.message || 'Unknown error'));
            this.isIngesting = false;
          }
        );
      } catch (error) {
        alert('Error reading file: ' + error);
        this.isIngesting = false;
      }
    };

    reader.readAsText(this.uploadedFile);
  }

  private parseCsvToJson(csvContent: string): any {
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = lines[i].split(',');
        const obj: any = {};
        headers.forEach((header, index) => {
          obj[header] = values[index]?.trim() || null;
        });
        data.push(obj);
      }
    }

    return data;
  }

  moveToNextStep(): void {
    if (this.currentStep === 1 && !this.selectedSchemaId) return;
    if (this.currentStep === 2 && !this.uploadedFile) return;

    if (this.currentStep === 2) {
      this.validateData();
    }

    this.currentStep++;
  }

  previousStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  startOver(): void {
    this.currentStep = 1;
    this.selectedSchemaId = '';
    this.uploadedFile = null;
    this.tableName = '';
    this.validationResult = null;
    this.ingestResult = null;
  }

  goToDashboard(): void {
    alert('Navigating to dashboards...');
  }
}
