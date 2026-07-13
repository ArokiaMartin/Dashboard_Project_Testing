import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SchemaField {
  fieldName: string;
  fieldType: 'STRING' | 'INTEGER' | 'NUMERIC' | 'BOOLEAN' | 'DATE' | 'TIMESTAMP';
  isRequired: boolean;
  isDimension?: boolean;
  isMeasure?: boolean;
  isPrimaryKey?: boolean;
  description?: string;
  validationRules?: any;
}

export interface SchemaUploadRequest {
  schemaName: string;
  description: string;
  schemaDefinition: any;
  fields: SchemaField[];
}

export interface SchemaResponse {
  id: string;
  schemaName: string;
  schemaVersion: number;
  status: string;
  description: string;
  fields: any[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  message?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  errorCount: number;
  warningCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class SchemaManagementService {
  private apiUrl = `${environment.apiUrl}/schemas`;
  private ingestWithSchemaUrl = `${environment.apiUrl}/data/ingest-with-schema`;
  private schemas$ = new BehaviorSubject<SchemaResponse[]>([]);
  private currentSchema$ = new BehaviorSubject<SchemaResponse | null>(null);
  private loading$ = new BehaviorSubject(false);

  constructor(private http: HttpClient) {}

  /**
   * Upload a new schema
   */
  uploadSchema(request: SchemaUploadRequest, userId: string = environment.defaultUserId): Observable<SchemaResponse> {
    this.loading$.next(true);
    return this.http.post<SchemaResponse>(
      `${this.apiUrl}/upload?userId=${userId}`,
      request
    ).pipe(
      tap((schema) => {
        this.currentSchema$.next(schema);
        this.refreshSchemasList(userId);
      }),
      catchError((error) => {
        console.error('Error uploading schema:', error);
        this.loading$.next(false);
        throw error;
      }),
      tap(() => this.loading$.next(false))
    );
  }

  /**
   * Get schema by ID
   */
  getSchema(schemaId: string): Observable<SchemaResponse> {
    return this.http.get<SchemaResponse>(`${this.apiUrl}/${schemaId}`).pipe(
      tap((schema) => this.currentSchema$.next(schema)),
      catchError((error) => {
        console.error('Error fetching schema:', error);
        throw error;
      })
    );
  }

  /**
   * List all schemas for current user
   */
  listSchemas(userId: string = environment.defaultUserId): Observable<SchemaResponse[]> {
    this.loading$.next(true);
    return this.http.get<SchemaResponse[]>(
      `${this.apiUrl}?userId=${userId}`
    ).pipe(
      tap((schemas) => {
        this.schemas$.next(schemas);
        this.loading$.next(false);
      }),
      catchError((error) => {
        console.error('Error fetching schemas:', error);
        this.loading$.next(false);
        return of([]);
      })
    );
  }

  /**
   * Delete a schema
   */
  deleteSchema(schemaId: string, userId: string = environment.defaultUserId): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${schemaId}?userId=${userId}`).pipe(
      tap(() => this.refreshSchemasList(userId)),
      catchError((error) => {
        console.error('Error deleting schema:', error);
        throw error;
      })
    );
  }

  /**
   * Validate data against a schema
   */
  validateData(schemaId: string, data: any): Observable<ValidationResult> {
    return this.http.post<ValidationResult>(
      `${this.apiUrl}/${schemaId}/validate`,
      data
    ).pipe(
      catchError((error) => {
        console.error('Error validating data:', error);
        throw error;
      })
    );
  }

  /**
   * Validate data against schema by name
   */
  validateDataByName(schemaName: string, data: any, userId: string = environment.defaultUserId): Observable<ValidationResult> {
    return this.http.post<ValidationResult>(
      `${this.apiUrl}/${schemaName}/validate-by-name?userId=${userId}`,
      data
    ).pipe(
      catchError((error) => {
        console.error('Error validating data:', error);
        throw error;
      })
    );
  }

  /**
   * Ingest data with schema validation
   */
  ingestWithSchema(schemaId: string, tableName: string, data: any, userId: string = environment.defaultUserId, validateOnly: boolean = false): Observable<any> {
    const request = {
      schemaId,
      tableName,
      data,
      userId,
      validateOnly,
      skipValidation: false
    };

    return this.http.post(this.ingestWithSchemaUrl, request).pipe(
      catchError((error) => {
        console.error('Error ingesting data:', error);
        throw error;
      })
    );
  }

  /**
   * Get observables
   */
  getSchemas$(): Observable<SchemaResponse[]> {
    return this.schemas$.asObservable();
  }

  getCurrentSchema$(): Observable<SchemaResponse | null> {
    return this.currentSchema$.asObservable();
  }

  isLoading$(): Observable<boolean> {
    return this.loading$.asObservable();
  }

  /**
   * Refresh schemas list
   */
  private refreshSchemasList(userId: string): void {
    this.listSchemas(userId).subscribe();
  }
}
