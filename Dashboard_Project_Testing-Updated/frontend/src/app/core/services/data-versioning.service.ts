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
   * Hash function for checksum. Uses the cyrb53 algorithm (~53-bit output) which has a
   * dramatically lower collision probability than a 32-bit hash, avoiding false "duplicate"
   * matches that would silently discard a genuinely new upload. Kept synchronous so existing
   * synchronous callers (registerVersion / checkDuplicate) remain unchanged.
   */
  private simpleHash(str: string): string {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hashNum = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return hashNum.toString(16);
  }
}
