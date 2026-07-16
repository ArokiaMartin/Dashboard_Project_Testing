import { Injectable } from '@angular/core';

export type ColType = 'string' | 'number' | 'date';

export interface Column { name: string; type: ColType; }

export interface VizDef {
  key: string;
  label: string;
  desc: string;
  requirement: string;   // human-readable rule, shown on the card
  icon: string;
}

/** counts of each column category in a selection */
interface Signature { str: number; num: number; date: number; dim: number; total: number; }

/**
 * Frontend "constraint validator + compatibility engine".
 *
 * Given a set of selected columns (each typed string / number / date), it decides
 * which chart types are valid — using a fixed rule per chart. All rules live in
 * `isAllowed()` so they're easy to read and change. Dummy data helpers let the UI
 * render a real preview without a backend.
 */
@Injectable({ providedIn: 'root' })
export class ChartCompatibilityService {
  private readonly demoColumns: Column[] = [
    { name: 'Department', type: 'string' },
    { name: 'Region', type: 'string' },
    { name: 'Status', type: 'string' },
    { name: 'Priority', type: 'string' },
    { name: 'Month', type: 'date' },
    { name: 'blockers', type: 'number' },
    { name: 'severe', type: 'number' },
    { name: 'major', type: 'number' },
    { name: 'costUsd', type: 'number' },
    { name: 'tickets', type: 'number' }
  ];

  /** The columns a user can pick from — demo dataset until a real uploaded table replaces it. */
  columns: Column[] = [...this.demoColumns];

  /** True once a real dataset (from the database) is active. */
  usingRealData = false;
  /** The active dataset's display name, shown in the UI. */
  datasetLabel: string | null = null;

  /** Replaces the demo columns with a real dataset's columns (backend types: text/numeric/boolean/date). */
  useRealColumns(datasetLabel: string, columns: { name: string; type: string }[]): void {
    this.columns = columns.map(c => ({ name: c.name, type: this.mapType(c.type) }));
    this.usingRealData = true;
    this.datasetLabel = datasetLabel;
  }

  /** Reverts to the built-in demo dataset. */
  useDemoColumns(): void {
    this.columns = [...this.demoColumns];
    this.usingRealData = false;
    this.datasetLabel = null;
  }

  private mapType(t: string): ColType {
    if (t === 'numeric' || t === 'number') return 'number';
    if (t === 'date') return 'date';
    return 'string';
  }

  readonly vizTypes: VizDef[] = [
    { key: 'kpi', label: 'KPI', desc: 'A single headline metric', requirement: 'Exactly 1 number', icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 16a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/><path d="M12 16l5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16" r="1.8" fill="currentColor"/></svg>` },
    { key: 'bar', label: 'BAR CHART', desc: 'Compare across categories', requirement: '1 category + 1 or more numbers', icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="12" width="4.2" height="8" rx="1.3" fill="currentColor" opacity="0.4"/><rect x="9.9" y="6" width="4.2" height="14" rx="1.3" fill="currentColor"/><rect x="15.8" y="9" width="4.2" height="11" rx="1.3" fill="currentColor" opacity="0.4"/></svg>` },
    { key: 'hbar', label: 'HORIZONTAL BAR', desc: 'Ranked categories', requirement: '1 category + 1 or more numbers', icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4.5" width="15" height="4.2" rx="1.3" fill="currentColor"/><rect x="4" y="10.9" width="9" height="4.2" rx="1.3" fill="currentColor" opacity="0.4"/><rect x="4" y="17.3" width="12.5" height="4.2" rx="1.3" fill="currentColor" opacity="0.7"/></svg>` },
    { key: 'stacked', label: 'STACKED BAR', desc: 'Stacked series per category', requirement: '1 category + 2 or more numbers', icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="13" width="5" height="7" rx="1.2" fill="currentColor"/><rect x="5" y="7" width="5" height="5" rx="1.2" fill="currentColor" opacity="0.45"/><rect x="14" y="10" width="5" height="10" rx="1.2" fill="currentColor"/><rect x="14" y="4.5" width="5" height="4.5" rx="1.2" fill="currentColor" opacity="0.45"/></svg>` },
    { key: 'line', label: 'LINE CHART', desc: 'Trends over a dimension', requirement: '1 category + 1 or more numbers', icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 16l5-5 4 3 7-8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="11" r="1.7" fill="currentColor"/><circle cx="20" cy="6" r="1.7" fill="currentColor"/></svg>` },
    { key: 'area', label: 'AREA', desc: 'Trend with filled volume', requirement: '1 category + 1 or more numbers', icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M3 20V13l5-5 4 3 6-6 3 3v12H3z" fill="currentColor" opacity="0.2"/><path d="M3 13l5-5 4 3 6-6 3 3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
    { key: 'pie', label: 'PIE CHART', desc: 'Part-to-whole share', requirement: '1 category + exactly 1 number', icon: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" fill="currentColor" opacity="0.18"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5H12V3.5z" fill="currentColor"/><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6"/></svg>` },
    { key: 'donut', label: 'DONUT', desc: 'Proportions with total', requirement: '1 category + exactly 1 number', icon: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7.5" stroke="currentColor" stroke-width="3.4" opacity="0.22"/><path d="M12 4.5a7.5 7.5 0 0 1 7.5 7.5" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>` },
    { key: 'polar', label: 'POLAR AREA', desc: 'Proportional segments', requirement: '1 category + exactly 1 number', icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 12V4a8 8 0 0 1 5.7 2.3L12 12z" fill="currentColor"/><path d="M12 12l5.7-5.7A8 8 0 0 1 20 12h-8z" fill="currentColor" opacity="0.5"/><path d="M12 12h8a8 8 0 0 1-8 8v-8z" fill="currentColor" opacity="0.28"/><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.4" opacity="0.45"/></svg>` },
    { key: 'radar', label: 'RADAR', desc: 'Compare multiple metrics', requirement: '1 category + 2 or more numbers', icon: `<svg viewBox="0 0 24 24" fill="none"><polygon points="12 3 20 8.5 17 18.5 7 18.5 4 8.5" fill="currentColor" opacity="0.16"/><polygon points="12 7 16 10 14.5 15 9.5 15 8 10" fill="currentColor" opacity="0.5"/><polygon points="12 3 20 8.5 17 18.5 7 18.5 4 8.5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>` },
    { key: 'scatter', label: 'SCATTER', desc: 'Correlate two numbers', requirement: 'Exactly 2 numbers', icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 4v16h16" stroke="currentColor" stroke-width="1.6" opacity="0.4"/><circle cx="8" cy="15" r="1.6" fill="currentColor"/><circle cx="11" cy="10" r="1.6" fill="currentColor"/><circle cx="15" cy="13" r="1.6" fill="currentColor"/><circle cx="18" cy="7" r="1.6" fill="currentColor"/><circle cx="14" cy="17" r="1.6" fill="currentColor" opacity="0.5"/></svg>` },
    { key: 'table', label: 'TABLE', desc: 'Rows & columns of data', requirement: 'Any columns', icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2.5" fill="currentColor" opacity="0.15"/><rect x="3.9" y="4.9" width="16.2" height="14.2" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M4 9.5h16" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 9.5V20M15 9.5V20" stroke="currentColor" stroke-width="1.6"/></svg>` }
  ];

  signature(cols: Column[]): Signature {
    const str = cols.filter(c => c.type === 'string').length;
    const num = cols.filter(c => c.type === 'number').length;
    const date = cols.filter(c => c.type === 'date').length;
    return { str, num, date, dim: str + date, total: cols.length };
  }

  /** THE RULE SET — which column combinations each chart accepts. */
  isAllowed(key: string, cols: Column[]): boolean {
    const s = this.signature(cols);
    return this.isAllowedCounts(key, s.dim, s.num);
  }

  /** The rules expressed on raw counts, so hypothetical selections can be tested without real columns. */
  private isAllowedCounts(key: string, dim: number, num: number): boolean {
    const total = dim + num;
    if (total < 1) return false;
    switch (key) {
      case 'kpi': return num === 1 && dim === 0;
      case 'bar':
      case 'hbar':
      case 'line':
      case 'area': return dim === 1 && num >= 1;
      case 'pie':
      case 'donut':
      case 'polar': return dim === 1 && num === 1;
      case 'stacked':
      case 'radar': return dim === 1 && num >= 2;
      case 'scatter': return num === 2 && dim === 0;
      case 'table': return total >= 1;
      default: return false;
    }
  }

  /**
   * Would adding `candidate` to `selected` still let the chosen chart be satisfied — possibly after
   * adding more columns, up to the 4-column limit? Drives enabling/disabling of columns in the picker.
   * With no chart chosen yet, the column is kept enabled only if adding it can still lead to at least
   * one real chart (any non-table visualization) — so combinations that can never be charted grey out
   * immediately, before a chart is picked.
   */
  canAddColumn(vizKey: string | null, selected: Column[], candidate: Column, all: Column[]): boolean {
    if (selected.length >= 4) return false;                      // the existing 4-column cap
    if (!vizKey) {
      // No chart chosen yet: enable the column only if some real (non-table) chart stays reachable.
      return this.chartableKeys.some(k => this.canAddColumnForViz(k, selected, candidate, all));
    }
    return this.canAddColumnForViz(vizKey, selected, candidate, all);
  }

  /** Chart types that count as "a chart can still be made" — excludes the catch-all table. */
  private readonly chartableKeys = ['kpi', 'bar', 'hbar', 'stacked', 'line', 'area', 'pie', 'donut', 'polar', 'radar', 'scatter'];

  /** Per-chart feasibility: can `candidate` be added to `selected` and still satisfy `vizKey`, now or after further additions (within the 4-column cap)? */
  private canAddColumnForViz(vizKey: string, selected: Column[], candidate: Column, all: Column[]): boolean {
    const s = this.signature(selected);
    const addDim = candidate.type !== 'number' ? 1 : 0;
    const dim = s.dim + addDim;
    const num = s.num + (addDim ? 0 : 1);
    const budget = 4 - (selected.length + 1);                   // columns still addable after this one
    const isSel = (c: Column) => selected.some(x => x.name === c.name);
    const pool = all.filter(c => !isSel(c) && c.name !== candidate.name);
    const availDim = pool.filter(c => c.type !== 'number').length;
    const availNum = pool.filter(c => c.type === 'number').length;
    for (let da = 0; da <= Math.min(budget, availDim); da++) {
      for (let na = 0; na <= Math.min(budget - da, availNum); na++) {
        if (this.isAllowedCounts(vizKey, dim + da, num + na)) return true;
      }
    }
    return false;
  }

  /** Best-fit chart for the current columns (Power BI-style "suggested"), or null when only a table fits. */
  recommend(cols: Column[]): string | null {
    if (!cols.length) return null;
    const hasDate = cols.some(c => c.type === 'date');
    const order = hasDate
      ? ['line', 'area', 'bar', 'stacked', 'radar', 'pie', 'donut', 'polar', 'scatter', 'kpi']
      : ['bar', 'hbar', 'line', 'pie', 'donut', 'stacked', 'radar', 'polar', 'area', 'scatter', 'kpi'];
    return order.find(k => this.isAllowed(k, cols)) ?? null;
  }

  // ---------- dummy data ----------
  private readonly dimLabels: Record<string, string[]> = {
    Department: ['Engineering', 'Sales', 'Operations', 'Finance', 'HR', 'IT'],
    Region: ['North America', 'EMEA', 'APAC', 'LATAM'],
    Status: ['Active', 'Pending', 'Resolved', 'Closed'],
    Priority: ['Critical', 'High', 'Medium', 'Low'],
    Month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug']
  };

  labelsFor(name: string): string[] {
    return this.dimLabels[name] ?? ['A', 'B', 'C', 'D'];
  }

  valuesFor(measure: string, count: number): number[] {
    let seed = this.hash(measure);
    const base = measure === 'costUsd' ? 4000 : measure === 'tickets' ? 600 : 25;
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      out.push(Math.round(base * (0.35 + seed / 4294967296)));
    }
    return out;
  }

  private hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
}
