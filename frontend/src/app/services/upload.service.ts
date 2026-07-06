import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as XLSX from 'xlsx';
import { DataTable } from '../models';
import { environment } from '../../environments/environment';

type Cell = string | number;

/**
 * Reads an uploaded file (JSON / CSV / Excel) and turns it into one or more
 * DataTable objects that the Data Explorer and Builder can consume.
 * Parsed results are held here so other pages can read them.
 */
@Injectable({ providedIn: 'root' })
export class UploadService {
  tables: DataTable[] = [];
  fileName = '';

  constructor(private http: HttpClient) {}

  get hasData(): boolean { return this.tables.length > 0; }

  /** Send the file to the backend upload endpoint. */
  async uploadToBackend(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.http.post<any>(`${environment.apiUrl}/upload`, formData).toPromise();
    return response;
  }

  /** Entry point: send to backend AND detect the format by extension to parse locally. */
  async parse(file: File): Promise<DataTable[]> {
    try {
      await this.uploadToBackend(file);
    } catch (error) {
      console.error('Failed to upload to backend:', error);
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    let tables: DataTable[];

    if (ext === 'json') {
      tables = this.parseJson(await file.text());
    } else if (ext === 'csv') {
      tables = [this.parseDelimited(this.baseName(file.name), await file.text())];
    } else if (ext === 'xlsx' || ext === 'xls') {
      tables = this.parseExcel(await file.arrayBuffer());
    } else {
      throw new Error(`Unsupported file type ".${ext}". Please upload JSON, CSV, or Excel.`);
    }

    if (!tables.length) throw new Error('No tabular data found in the file.');
    this.tables = tables;
    this.fileName = file.name;
    return tables;
  }

  reset(): void { this.tables = []; this.fileName = ''; }

  // ---------- JSON ----------
  private parseJson(text: string): DataTable[] {
    let data: unknown;
    try { data = JSON.parse(text); }
    catch { throw new Error('Invalid JSON — could not parse the file.'); }

    const tables: DataTable[] = [];

    if (Array.isArray(data)) {
      tables.push(this.tableFromArray('data', data));
    } else if (data && typeof data === 'object') {
      const scalars: [string, Cell][] = [];
      for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
        if (Array.isArray(val)) {
          tables.push(this.tableFromArray(key, val));
        } else if (val && typeof val === 'object') {
          tables.push(this.tableFromObject(key, val as Record<string, unknown>));
        } else {
          scalars.push([key, this.toCell(val)]);
        }
      }
      if (scalars.length) {
        tables.unshift({ name: 'summary', columns: ['key', 'value'], types: ['text', 'text'], rows: scalars });
      }
    }
    return tables;
  }

  private tableFromArray(name: string, arr: unknown[]): DataTable {
    if (arr.length && typeof arr[0] === 'object' && arr[0] !== null && !Array.isArray(arr[0])) {
      const columns = Array.from(
        arr.reduce((set: Set<string>, row) => {
          Object.keys(row as object).forEach(k => set.add(k));
          return set;
        }, new Set<string>())
      );
      const rows = arr.map(row => columns.map(c => this.toCell((row as Record<string, unknown>)[c])));
      return { name, columns, types: this.inferTypes(columns, rows), rows };
    }
    // array of primitives
    const rows = arr.map(v => [this.toCell(v)]);
    return { name, columns: ['value'], types: this.inferTypes(['value'], rows), rows };
  }

  private tableFromObject(name: string, obj: Record<string, unknown>): DataTable {
    const columns = Object.keys(obj);
    const rows = [columns.map(c => this.toCell(obj[c]))];
    return { name, columns, types: this.inferTypes(columns, rows), rows };
  }

  // ---------- CSV ----------
  private parseDelimited(name: string, text: string): DataTable {
    const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim().length);
    if (!lines.length) throw new Error('The CSV file is empty.');
    const columns = this.splitCsvLine(lines[0]);
    const rows = lines.slice(1).map(l => {
      const cells = this.splitCsvLine(l);
      return columns.map((_, i) => this.coerce(cells[i] ?? ''));
    });
    return { name, columns, types: this.inferTypes(columns, rows), rows };
  }

  /** Split a CSV line respecting double-quoted fields that contain commas. */
  private splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  // ---------- Excel ----------
  private parseExcel(buffer: ArrayBuffer): DataTable[] {
    const wb = XLSX.read(buffer, { type: 'array' });
    const tables: DataTable[] = [];
    for (const sheetName of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[sheetName], { header: 1, defval: '', blankrows: false });
      if (!aoa.length) continue;
      const columns = (aoa[0] as unknown[]).map((c, i) => String(c || `col${i + 1}`));
      const rows = aoa.slice(1).map(r => columns.map((_, i) => this.coerce((r as unknown[])[i])));
      tables.push({ name: sheetName, columns, types: this.inferTypes(columns, rows), rows });
    }
    return tables;
  }

  // ---------- helpers ----------
  private toCell(v: unknown): Cell {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return v;
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  /** Turn a raw string cell into a number when it clearly is one. */
  private coerce(v: unknown): Cell {
    const s = String(v ?? '').trim();
    if (s === '') return '';
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return s;
  }

  private inferTypes(columns: string[], rows: Cell[][]): DataTable['types'] {
    return columns.map((col, i) => {
      const values = rows.map(r => r[i]).filter(v => v !== '' && v !== null && v !== undefined);
      if (!values.length) return 'text';
      const name = col.toLowerCase();
      if (values.every(v => typeof v === 'number')) {
        return /cost|amount|price|usd|revenue|\$/.test(name) ? 'money' : 'num';
      }
      if (values.every(v => typeof v === 'string' && String(v).startsWith('$'))) return 'money';
      if (/date|time|day|month|year/.test(name) && values.every(v => !isNaN(Date.parse(String(v))))) return 'date';
      return 'text';
    });
  }

  private baseName(fileName: string): string {
    return fileName.replace(/\.[^.]+$/, '');
  }
}
