import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchemaManagementService, SchemaResponse, SchemaUploadRequest, SchemaField } from '@core/services/schema-management.service';

@Component({
  selector: 'app-schema-management',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="schema-management-container">
      <div class="schema-header">
        <h1>Schema Management</h1>
        <p class="subtitle">Define data schemas before ingesting large datasets. Schemas enable validation and type safety.</p>
      </div>

      <div class="schema-tabs">
        <button
          class="tab-button"
          [class.active]="activeTab === 'list'"
          (click)="activeTab = 'list'">
          📋 My Schemas
        </button>
        <button
          class="tab-button"
          [class.active]="activeTab === 'create'"
          (click)="activeTab = 'create'">
          ➕ Create Schema
        </button>
      </div>

      <!-- Schemas List Tab -->
      <div *ngIf="activeTab === 'list'" class="tab-content">
        <div class="loading-overlay" *ngIf="isLoading$ | async">
          <div class="spinner"></div>
          <p>Loading schemas...</p>
        </div>

        <div *ngIf="(schemas$ | async) as schemas" class="schemas-list">
          <div *ngIf="schemas.length === 0" class="empty-state">
            <p>No schemas found. Create one to get started!</p>
          </div>

          <div *ngFor="let schema of schemas" class="schema-card">
            <div class="schema-card-header">
              <div class="schema-info">
                <h3>{{ schema.schemaName }}</h3>
                <span class="version">v{{ schema.schemaVersion }}</span>
                <span class="status" [ngClass]="schema.status.toLowerCase()">{{ schema.status }}</span>
              </div>
              <div class="schema-actions">
                <button class="btn-small btn-primary" (click)="selectSchemaForIngest(schema)">Use for Data</button>
                <button class="btn-small btn-danger" (click)="deleteSchema(schema.id)">Delete</button>
              </div>
            </div>
            <p class="schema-description">{{ schema.description || 'No description' }}</p>
            <div class="schema-fields">
              <strong>Fields ({{ schema.fields.length }}):</strong>
              <div class="field-tags">
                <span *ngFor="let field of schema.fields" class="field-tag">
                  {{ field.fieldName }}: {{ field.fieldType }}
                  <span *ngIf="field.isRequired" class="required">*</span>
                </span>
              </div>
            </div>
            <div class="schema-meta">
              <small>Created: {{ schema.createdAt | date:'short' }}</small>
              <small>By: {{ schema.createdBy }}</small>
            </div>
          </div>
        </div>
      </div>

      <!-- Create Schema Tab -->
      <div *ngIf="activeTab === 'create'" class="tab-content">
        <form [formGroup]="schemaForm" (ngSubmit)="onCreateSchema()" class="schema-form">
          <div class="form-section">
            <h2>Schema Details</h2>
            <div class="form-group">
              <label>Schema Name *</label>
              <input
                type="text"
                formControlName="schemaName"
                placeholder="e.g., customer_transactions"
                class="form-control">
              <small class="error" *ngIf="schemaForm.get('schemaName')?.hasError('required') && schemaForm.get('schemaName')?.touched">
                Schema name is required
              </small>
            </div>

            <div class="form-group">
              <label>Description</label>
              <textarea
                formControlName="description"
                placeholder="Describe the purpose of this schema"
                class="form-control textarea">
              </textarea>
            </div>
          </div>

          <div class="form-section">
            <h2>Field Definitions</h2>
            <div formArrayName="fields">
              <div *ngFor="let field of getFieldsFormArray().controls; let i = index" class="field-group" [formGroupName]="i">
                <div class="field-inputs">
                  <div class="form-group">
                    <label>Field Name *</label>
                    <input
                      type="text"
                      formControlName="fieldName"
                      placeholder="e.g., transaction_id"
                      class="form-control">
                  </div>

                  <div class="form-group">
                    <label>Field Type *</label>
                    <select formControlName="fieldType" class="form-control">
                      <option value="">Select type</option>
                      <option value="STRING">String (Text)</option>
                      <option value="INTEGER">Integer (Whole Number)</option>
                      <option value="NUMERIC">Numeric (Decimal)</option>
                      <option value="BOOLEAN">Boolean (True/False)</option>
                      <option value="DATE">Date</option>
                      <option value="TIMESTAMP">Timestamp</option>
                    </select>
                  </div>

                  <div class="form-group checkbox-group">
                    <label class="checkbox">
                      <input type="checkbox" formControlName="isRequired">
                      Required
                    </label>
                    <label class="checkbox">
                      <input type="checkbox" formControlName="isDimension">
                      Dimension
                    </label>
                    <label class="checkbox">
                      <input type="checkbox" formControlName="isMeasure">
                      Measure
                    </label>
                    <label class="checkbox">
                      <input type="checkbox" formControlName="isPrimaryKey">
                      Primary Key
                    </label>
                  </div>

                  <button type="button" class="btn-small btn-danger" (click)="removeField(i)">Remove</button>
                </div>

                <div class="form-group">
                  <label>Description</label>
                  <input
                    type="text"
                    formControlName="description"
                    placeholder="Field description"
                    class="form-control">
                </div>
              </div>
            </div>

            <button type="button" class="btn-secondary" (click)="addField()">+ Add Field</button>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn-primary" [disabled]="!schemaForm.valid || (isLoading$ | async)">
              Create Schema
            </button>
            <button type="button" class="btn-secondary" (click)="resetForm()">Reset</button>
          </div>
        </form>
      </div>

      <!-- Schema Usage Modal -->
      <div *ngIf="selectedSchemaForIngest" class="modal-overlay" (click)="selectedSchemaForIngest = null">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <h3>Use Schema: {{ selectedSchemaForIngest.schemaName }}</h3>
          <p>Ready to ingest data using this schema. You can now upload a JSON/CSV file for validation and ingestion.</p>
          <div class="modal-actions">
            <button class="btn-primary" (click)="goToDataIngestion(selectedSchemaForIngest)">Go to Data Ingestion</button>
            <button class="btn-secondary" (click)="selectedSchemaForIngest = null">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .schema-management-container {
      padding: 2rem;
      background: var(--bg-primary, #f5f5f5);
      min-height: 100vh;
    }

    .schema-header {
      margin-bottom: 2rem;
    }

    .schema-header h1 {
      font-size: 2rem;
      margin: 0 0 0.5rem 0;
      color: var(--text-primary, #333);
    }

    .subtitle {
      color: var(--text-secondary, #666);
      margin: 0;
    }

    .schema-tabs {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
      border-bottom: 2px solid var(--border-color, #ddd);
    }

    .tab-button {
      padding: 0.75rem 1.5rem;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-secondary, #666);
      font-size: 1rem;
      border-bottom: 3px solid transparent;
      transition: all 0.3s;
    }

    .tab-button.active {
      color: var(--primary, #007bff);
      border-bottom-color: var(--primary, #007bff);
    }

    .tab-content {
      background: white;
      border-radius: 8px;
      padding: 2rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }

    .schemas-list {
      display: grid;
      gap: 1.5rem;
    }

    .empty-state {
      text-align: center;
      padding: 2rem;
      color: var(--text-secondary, #666);
    }

    .schema-card {
      border: 1px solid var(--border-color, #ddd);
      border-radius: 8px;
      padding: 1.5rem;
      transition: all 0.3s;
    }

    .schema-card:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      border-color: var(--primary, #007bff);
    }

    .schema-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }

    .schema-info {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .schema-info h3 {
      margin: 0;
      color: var(--text-primary, #333);
    }

    .version {
      background: var(--bg-secondary, #f0f0f0);
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.85rem;
      color: var(--text-secondary, #666);
    }

    .status {
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.85rem;
      font-weight: 500;
    }

    .status.active {
      background: #d4edda;
      color: #155724;
    }

    .status.inactive {
      background: #f8d7da;
      color: #721c24;
    }

    .schema-actions {
      display: flex;
      gap: 0.5rem;
    }

    .btn-small {
      padding: 0.5rem 1rem;
      font-size: 0.85rem;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.3s;
    }

    .btn-primary {
      background: var(--primary, #007bff);
      color: white;
    }

    .btn-primary:hover {
      background: var(--primary-dark, #0056b3);
    }

    .btn-secondary {
      background: var(--border-color, #ddd);
      color: var(--text-primary, #333);
    }

    .btn-secondary:hover {
      background: var(--bg-secondary, #f0f0f0);
    }

    .btn-danger {
      background: #dc3545;
      color: white;
    }

    .btn-danger:hover {
      background: #c82333;
    }

    .schema-description {
      margin: 0.5rem 0;
      color: var(--text-secondary, #666);
    }

    .schema-fields {
      margin: 1rem 0;
    }

    .field-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .field-tag {
      background: var(--bg-secondary, #f0f0f0);
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-size: 0.85rem;
    }

    .required {
      color: #dc3545;
      font-weight: bold;
    }

    .schema-meta {
      display: flex;
      gap: 1rem;
      margin-top: 1rem;
      font-size: 0.85rem;
      color: var(--text-secondary, #666);
      border-top: 1px solid var(--border-color, #ddd);
      padding-top: 1rem;
    }

    .schema-form {
      max-width: 800px;
    }

    .form-section {
      margin-bottom: 2rem;
    }

    .form-section h2 {
      font-size: 1.25rem;
      margin: 0 0 1rem 0;
      color: var(--text-primary, #333);
      border-bottom: 2px solid var(--border-color, #ddd);
      padding-bottom: 0.5rem;
    }

    .form-group {
      margin-bottom: 1rem;
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

    .textarea {
      resize: vertical;
      min-height: 80px;
    }

    .error {
      color: #dc3545;
      display: block;
      margin-top: 0.25rem;
    }

    .field-group {
      border: 1px solid var(--border-color, #ddd);
      border-radius: 4px;
      padding: 1rem;
      margin-bottom: 1rem;
      background: var(--bg-secondary, #f9f9f9);
    }

    .field-inputs {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 1rem;
      margin-bottom: 1rem;
      align-items: flex-end;
    }

    .checkbox-group {
      display: flex;
      gap: 1rem;
      flex-direction: column;
    }

    .checkbox {
      display: flex;
      align-items: center;
      cursor: pointer;
      margin: 0;
    }

    .checkbox input {
      margin-right: 0.5rem;
    }

    .form-actions {
      display: flex;
      gap: 1rem;
      margin-top: 2rem;
      justify-content: flex-start;
    }

    .btn-primary, .btn-secondary {
      padding: 0.75rem 1.5rem;
      font-size: 1rem;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.3s;
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.3);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-content {
      background: white;
      padding: 2rem;
      border-radius: 8px;
      max-width: 500px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }

    .modal-content h3 {
      margin: 0 0 1rem 0;
    }

    .modal-actions {
      display: flex;
      gap: 1rem;
      margin-top: 2rem;
      justify-content: flex-end;
    }
  `]
})
export class SchemaManagementComponent implements OnInit, OnDestroy {
  activeTab: 'list' | 'create' = 'list';
  schemaForm: FormGroup;
  schemas$ = this.schemaManagementService.getSchemas$();
  isLoading$ = this.schemaManagementService.isLoading$();
  selectedSchemaForIngest: SchemaResponse | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private schemaManagementService: SchemaManagementService
  ) {
    this.schemaForm = this.fb.group({
      schemaName: ['', [Validators.required]],
      description: [''],
      fields: this.fb.array([this.createFieldGroup()])
    });
  }

  ngOnInit(): void {
    this.schemaManagementService.listSchemas().pipe(
      takeUntil(this.destroy$)
    ).subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getFieldsFormArray() {
    return this.schemaForm.get('fields') as any;
  }

  createFieldGroup() {
    return this.fb.group({
      fieldName: ['', Validators.required],
      fieldType: ['', Validators.required],
      isRequired: [false],
      isDimension: [false],
      isMeasure: [false],
      isPrimaryKey: [false],
      description: [''],
      validationRules: [null]
    });
  }

  addField(): void {
    this.getFieldsFormArray().push(this.createFieldGroup());
  }

  removeField(index: number): void {
    this.getFieldsFormArray().removeAt(index);
  }

  onCreateSchema(): void {
    if (!this.schemaForm.valid) return;

    const request: SchemaUploadRequest = {
      schemaName: this.schemaForm.value.schemaName,
      description: this.schemaForm.value.description,
      schemaDefinition: {},
      fields: this.schemaForm.value.fields
    };

    this.schemaManagementService.uploadSchema(request).pipe(
      takeUntil(this.destroy$)
    ).subscribe(
      () => {
        this.resetForm();
        this.activeTab = 'list';
      },
      (error) => {
        alert('Error creating schema: ' + (error.error?.message || 'Unknown error'));
      }
    );
  }

  resetForm(): void {
    this.schemaForm.reset();
    const fieldsArray = this.getFieldsFormArray();
    while (fieldsArray.length > 1) {
      fieldsArray.removeAt(0);
    }
  }

  deleteSchema(schemaId: string): void {
    if (!confirm('Are you sure you want to delete this schema?')) return;

    this.schemaManagementService.deleteSchema(schemaId).pipe(
      takeUntil(this.destroy$)
    ).subscribe(
      () => {
        alert('Schema deleted successfully');
      },
      (error) => {
        alert('Error deleting schema: ' + (error.error?.message || 'Unknown error'));
      }
    );
  }

  selectSchemaForIngest(schema: SchemaResponse): void {
    this.selectedSchemaForIngest = schema;
  }

  goToDataIngestion(schema: SchemaResponse): void {
    // This will navigate to data ingestion component
    // For now, just close the modal
    this.selectedSchemaForIngest = null;
    alert(`Navigate to data ingestion with schema: ${schema.schemaName}`);
  }
}
