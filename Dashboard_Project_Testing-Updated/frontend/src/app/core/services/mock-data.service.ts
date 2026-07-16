import { Injectable } from '@angular/core';
import { Field, Slot, VizType, ChartMeta, DataTable } from '@shared/models';

/**
 * Central source of demo data and visualization configuration.
 *
 * NOTE: This currently returns deterministic sample data so the UI can be
 * built and demoed without a backend. When the Spring Boot API is wired up,
 * only this service needs to change — components consume it unchanged.
 */
@Injectable({ providedIn: 'root' })
export class MockDataService {
  /** Selectable palette for chart primary colour. */
  readonly palette = ['#2563eb', '#64748b', '#cbd5e1', '#1e293b', '#93c5fd'];
  /** Colours used for multi-segment charts (pie / donut / polar). */
  readonly multiColors = ['#2563eb', '#60a5fa', '#93c5fd', '#1e40af', '#64748b', '#cbd5e1'];

  readonly dimensions: Field[] = [
    { name: 'Department', role: 'dimension', icon: 'A' },
    { name: 'Region', role: 'dimension', icon: 'A' },
    { name: 'Month', role: 'dimension', icon: 'A' },
    { name: 'Priority', role: 'dimension', icon: 'A' },
    { name: 'Status', role: 'dimension', icon: 'A' }
  ];

  readonly measures: Field[] = [
    { name: 'blockers', role: 'measure', icon: '#' },
    { name: 'severe', role: 'measure', icon: '#' },
    { name: 'major', role: 'measure', icon: '#' },
    { name: 'costUsd', role: 'measure', icon: '$' },
    { name: 'tickets', role: 'measure', icon: '#' }
  ];

  readonly vizTypes: VizType[] = [
    { key: 'kpi', label: 'KPI', desc: 'A single headline metric', icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 16a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/><path d="M12 16l5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16" r="1.8" fill="currentColor"/></svg>` },
    { key: 'table', label: 'TABLE', desc: 'Rows & columns of data', icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2.5" fill="currentColor" opacity="0.15"/><rect x="3.9" y="4.9" width="16.2" height="14.2" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M4 9.5h16" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 9.5V20M15 9.5V20" stroke="currentColor" stroke-width="1.6"/></svg>` },
    { key: 'bar', label: 'BAR CHART', desc: 'Compare across categories', icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="12" width="4.2" height="8" rx="1.3" fill="currentColor" opacity="0.4"/><rect x="9.9" y="6" width="4.2" height="14" rx="1.3" fill="currentColor"/><rect x="15.8" y="9" width="4.2" height="11" rx="1.3" fill="currentColor" opacity="0.4"/></svg>` },
    { key: 'hbar', label: 'HORIZONTAL BAR', desc: 'Ranked categories', icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4.5" width="15" height="4.2" rx="1.3" fill="currentColor"/><rect x="4" y="10.9" width="9" height="4.2" rx="1.3" fill="currentColor" opacity="0.4"/><rect x="4" y="17.3" width="12.5" height="4.2" rx="1.3" fill="currentColor" opacity="0.7"/></svg>` },
    { key: 'line', label: 'LINE CHART', desc: 'Trends over a dimension', icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 16l5-5 4 3 7-8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="11" r="1.7" fill="currentColor"/><circle cx="20" cy="6" r="1.7" fill="currentColor"/></svg>` },
    { key: 'area', label: 'AREA', desc: 'Trend with filled volume', icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M3 20V13l5-5 4 3 6-6 3 3v12H3z" fill="currentColor" opacity="0.2"/><path d="M3 13l5-5 4 3 6-6 3 3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
    { key: 'pie', label: 'PIE CHART', desc: 'Part-to-whole share', icon: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" fill="currentColor" opacity="0.18"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5H12V3.5z" fill="currentColor"/><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6"/></svg>` },
    { key: 'donut', label: 'DONUT', desc: 'Proportions with total', icon: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7.5" stroke="currentColor" stroke-width="3.4" opacity="0.22"/><path d="M12 4.5a7.5 7.5 0 0 1 7.5 7.5" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>` },
    { key: 'radar', label: 'RADAR', desc: 'Compare multiple metrics', icon: `<svg viewBox="0 0 24 24" fill="none"><polygon points="12 3 20 8.5 17 18.5 7 18.5 4 8.5" fill="currentColor" opacity="0.16"/><polygon points="12 7 16 10 14.5 15 9.5 15 8 10" fill="currentColor" opacity="0.5"/><polygon points="12 3 20 8.5 17 18.5 7 18.5 4 8.5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>` },
    { key: 'polar', label: 'POLAR AREA', desc: 'Proportional segments', icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 12V4a8 8 0 0 1 5.7 2.3L12 12z" fill="currentColor"/><path d="M12 12l5.7-5.7A8 8 0 0 1 20 12h-8z" fill="currentColor" opacity="0.5"/><path d="M12 12h8a8 8 0 0 1-8 8v-8z" fill="currentColor" opacity="0.28"/><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.4" opacity="0.45"/></svg>` }
  ];

  /** Which input slots each visualization requires. */
  readonly slotSpecs: Record<string, Slot[]> = {
    kpi: [{ key: 'metric', label: 'METRIC', role: 'measure' }],
    table: [{ key: 'group', label: 'GROUP BY', role: 'dimension' }],
    bar: [{ key: 'x', label: 'X-AXIS', role: 'dimension' }, { key: 'y', label: 'Y-AXIS', role: 'measure' }],
    hbar: [{ key: 'x', label: 'CATEGORY', role: 'dimension' }, { key: 'y', label: 'VALUE', role: 'measure' }],
    line: [{ key: 'x', label: 'X-AXIS', role: 'dimension' }, { key: 'y', label: 'Y-AXIS', role: 'measure' }],
    area: [{ key: 'x', label: 'X-AXIS', role: 'dimension' }, { key: 'y', label: 'Y-AXIS', role: 'measure' }],
    pie: [{ key: 'cat', label: 'CATEGORY', role: 'dimension' }, { key: 'val', label: 'VALUE', role: 'measure' }],
    donut: [{ key: 'cat', label: 'CATEGORY', role: 'dimension' }, { key: 'val', label: 'VALUE', role: 'measure' }],
    radar: [{ key: 'x', label: 'AXES', role: 'dimension' }, { key: 'y', label: 'VALUE', role: 'measure' }],
    polar: [{ key: 'cat', label: 'CATEGORY', role: 'dimension' }, { key: 'val', label: 'VALUE', role: 'measure' }]
  };

  private readonly chartMetaMap: Record<string, ChartMeta> = {
    bar: { type: 'bar', indexAxis: 'x', fill: false, multiColor: false, radial: false, legend: false },
    hbar: { type: 'bar', indexAxis: 'y', fill: false, multiColor: false, radial: false, legend: false },
    line: { type: 'line', indexAxis: 'x', fill: false, multiColor: false, radial: false, legend: false },
    area: { type: 'line', indexAxis: 'x', fill: true, multiColor: false, radial: false, legend: false },
    pie: { type: 'pie', indexAxis: 'x', fill: false, multiColor: true, radial: false, legend: true },
    donut: { type: 'doughnut', indexAxis: 'x', fill: false, multiColor: true, radial: false, legend: true },
    radar: { type: 'radar', indexAxis: 'x', fill: true, multiColor: false, radial: true, legend: false },
    polar: { type: 'polarArea', indexAxis: 'x', fill: false, multiColor: true, radial: true, legend: true }
  };

  private readonly dimLabels: Record<string, string[]> = {
    Department: ['Engineering', 'Sales', 'Operations', 'Finance', 'HR', 'IT'],
    Region: ['North America', 'EMEA', 'APAC', 'LATAM'],
    Month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
    Priority: ['Critical', 'High', 'Medium', 'Low'],
    Status: ['Active', 'Pending', 'Resolved', 'Closed']
  };

  /** Parsed tables shown in the Data Explorer. */
  readonly uploadedTables: DataTable[] = [
    { name: 'summary', columns: ['blockers', 'severe', 'major', 'costUsd', 'generatedAt'], types: ['num', 'num', 'num', 'money', 'date'], rows: [[12, 34, 56, '$125,000', '2023-10-24']] },
    {
      name: 'findings', columns: ['id', 'title', 'severity', 'department', 'status'], types: ['text', 'text', 'text', 'text', 'text'],
      rows: [
        ['F-001', 'Login timeout under load', 'Critical', 'Engineering', 'Open'],
        ['F-002', 'Missing alt text on charts', 'Major', 'Design', 'Open'],
        ['F-003', 'Slow query on reports', 'Severe', 'Engineering', 'In Review'],
        ['F-004', 'Expired TLS certificate', 'Critical', 'IT', 'Resolved'],
        ['F-005', 'Incorrect tax rounding', 'Major', 'Finance', 'Open'],
        ['F-006', 'Broken export to CSV', 'Severe', 'Engineering', 'Open'],
        ['F-007', 'Session not invalidated', 'Critical', 'Security', 'In Review'],
        ['F-008', 'Chart legend overlap', 'Minor', 'Design', 'Resolved']
      ]
    },
    {
      name: 'plan', columns: ['phase', 'owner', 'dueDate', 'progress'], types: ['text', 'text', 'date', 'text'],
      rows: [
        ['Discovery', 'A. Sterling', '2023-11-01', '100%'],
        ['Remediation', 'J. Lee', '2023-11-20', '60%'],
        ['Verification', 'M. Ortiz', '2023-12-05', '10%'],
        ['Sign-off', 'A. Sterling', '2023-12-15', '0%']
      ]
    },
    {
      name: 'cost', columns: ['item', 'category', 'amountUsd'], types: ['text', 'text', 'money'],
      rows: [
        ['External audit', 'Services', '$45,000'],
        ['Tooling licenses', 'Software', '$28,500'],
        ['Engineering hours', 'Labor', '$51,500'],
        ['Training', 'Services', '$8,200'],
        ['Contingency', 'Reserve', '$12,000']
      ]
    },
    {
      name: 'metadata', columns: ['key', 'value'], types: ['text', 'text'],
      rows: [
        ['reportVersion', '2.4.1'],
        ['source', 'Hyland Compliance Scan'],
        ['region', 'EMEA'],
        ['recordCount', '1,284'],
        ['scanDurationMs', '48,210'],
        ['analyst', 'Alexander S.']
      ]
    }
  ];

  chartMeta(viz: string): ChartMeta {
    return this.chartMetaMap[viz];
  }

  fieldsForRole(role: 'dimension' | 'measure'): Field[] {
    return role === 'dimension' ? this.dimensions : this.measures;
  }

  /** Category labels for a dimension. */
  labelsFor(dim: string): string[] {
    return this.dimLabels[dim] ?? ['A', 'B', 'C', 'D'];
  }

  /** Deterministic numeric series for a measure (seeded by name so values are stable). */
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
