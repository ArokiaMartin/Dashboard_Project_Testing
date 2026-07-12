import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from '@env/environment';

export interface DataVersion {
  versionId: string;
  schemaId: string;
  schemaName: string;
  tableName: string;
  checksum: string;
  rowCount: number;
  uploadedAt: string;
  fileName: string;
  versionNumber: number;
  isDuplicate: boolean;
  originalVersionId?: string;
}

export interface VersionCheckResult {
  isDuplicate: boolean;
  existingVersion?: DataVersion;
  newChecksum: string;
}

@Injectable({
  providedIn: 'root'
})
export class DataVersioningService {
  private apiUrl = `${environment.apiUrl}/data/versions`;
  private versions$ = new BehaviorSubject<DataVersion[]>([]);

  constructor(private http: HttpClient) {}

  /**
   * Calculate checksum for uploaded data
   */
  calculateChecksum(data: any[]): string {
    const dataStr = JSON.stringify(data);
    return this.simpleHash(dataStr);
  }

  /**
   * Check if data is a duplicate of an existing version
   */
  checkDuplicate(schemaId: string, checksum: string): Observable<VersionCheckResult> {
    return this.http.post<VersionCheckResult>(
      `${this.apiUrl}/check-duplicate`,
      { schemaId, checksum }
    ).pipe(
      catchError((error) => {
        console.error('Error checking duplicate:', error);
        return of({ isDuplicate: false, newChecksum: checksum });
      })
    );
  }

  /**
   * Register a new data version
   */
  registerVersion(
    schemaId: string,
    schemaName: string,
    tableName: string,
    checksum: string,
    rowCount: number,
    fileName: string,
    isDuplicate: boolean = false,
    originalVersionId?: string
  ): Observable<DataVersion> {
    return this.http.post<DataVersion>(
      `${this.apiUrl}/register`,
      {
        schemaId,
        schemaName,
        tableName,
        checksum,
        rowCount,
        fileName,
        isDuplicate,
        originalVersionId
      }
    ).pipe(
      tap((version) => {
        const current = this.versions$.value;
        this.versions$.next([...current, version]);
      }),
      catchError((error) => {
        console.error('Error registering version:', error);
        throw error;
      })
    );
  }

  /**
   * Get all versions for a schema
   */
  getVersionsBySchema(schemaId: string): Observable<DataVersion[]> {
    return this.http.get<DataVersion[]>(`${this.apiUrl}/schema/${schemaId}`).pipe(
      tap((versions) => this.versions$.next(versions)),
      catchError((error) => {
        console.error('Error fetching versions:', error);
        return of([]);
      })
    );
  }

  /**
   * Get specific version details
   */
  getVersion(versionId: string): Observable<DataVersion> {
    return this.http.get<DataVersion>(`${this.apiUrl}/${versionId}`).pipe(
      catchError((error) => {
        console.error('Error fetching version:', error);
        throw error;
      })
    );
  }

  /**
   * Get all versions observable
   */
  getVersions$(): Observable<DataVersion[]> {
    return this.versions$.asObservable();
  }

  /**
   * Simple hash function for checksum (can be replaced with crypto if needed)
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }
}
