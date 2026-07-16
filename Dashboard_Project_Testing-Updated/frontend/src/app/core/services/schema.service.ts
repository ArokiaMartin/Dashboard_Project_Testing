import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { TableSchema, Column } from '@shared/types/dashboard.types';

@Injectable({
  providedIn: 'root'
})
export class SchemaService {
  private currentSchema$ = new BehaviorSubject<TableSchema | null>(null);
  private availableDimensions$ = new BehaviorSubject<Column[]>([]);
  private availableMeasures$ = new BehaviorSubject<Column[]>([]);
  private isSchemaLoaded$ = new BehaviorSubject<boolean>(false);

  /**
   * Return the current in-memory schema. Schema is populated via setSchema() from the ingestion flow;
   * there is no dedicated backend schema endpoint.
   */
  loadSchema(): Observable<TableSchema | null> {
    return this.currentSchema$.asObservable();
  }

  /**
   * Set schema and categorize columns
   */
  setSchema(schema: TableSchema): void {
    this.currentSchema$.next(schema);
    this.categorizeColumns(schema.columns);
    this.isSchemaLoaded$.next(true);
  }

  /**
   * Categorize columns into dimensions and measures
   * Dimensions: string, date, boolean
   * Measures: number
   */
  private categorizeColumns(columns: Column[]): void {
    const dimensions: Column[] = [];
    const measures: Column[] = [];

    columns.forEach((column) => {
      if (column.type === 'number') {
        measures.push(column);
      } else {
        dimensions.push(column);
      }
    });

    this.availableDimensions$.next(dimensions);
    this.availableMeasures$.next(measures);
  }

  /**
   * Get current schema
   */
  getSchema(): Observable<TableSchema | null> {
    return this.currentSchema$.asObservable();
  }

  /**
   * Get available dimensions
   */
  getDimensions(): Observable<Column[]> {
    return this.availableDimensions$.asObservable();
  }

  /**
   * Get available measures
   */
  getMeasures(): Observable<Column[]> {
    return this.availableMeasures$.asObservable();
  }

  /**
   * Get dimension columns as strings
   */
  getDimensionNames(): string[] {
    return this.availableDimensions$.value.map((col) => col.name);
  }

  /**
   * Get measure columns as strings
   */
  getMeasureNames(): string[] {
    return this.availableMeasures$.value.map((col) => col.name);
  }

  /**
   * Get column by name
   */
  getColumn(name: string): Column | undefined {
    const schema = this.currentSchema$.value;
    if (!schema) return undefined;
    return schema.columns.find((col) => col.name === name);
  }

  /**
   * Check if schema is loaded
   */
  isLoaded(): Observable<boolean> {
    return this.isSchemaLoaded$.asObservable();
  }

  /**
   * Clear schema
   */
  clearSchema(): void {
    this.currentSchema$.next(null);
    this.availableDimensions$.next([]);
    this.availableMeasures$.next([]);
    this.isSchemaLoaded$.next(false);
  }

  /**
   * Get all column names
   */
  getAllColumnNames(): string[] {
    const schema = this.currentSchema$.value;
    if (!schema) return [];
    return schema.columns.map((col) => col.name);
  }

  /**
   * Validate field exists in schema
   */
  fieldExists(fieldName: string): boolean {
    return this.getAllColumnNames().includes(fieldName);
  }

  /**
   * Get field type
   */
  getFieldType(fieldName: string): string | null {
    const column = this.getColumn(fieldName);
    return column ? column.type : null;
  }
}
