import { SafeHtml } from '@angular/platform-browser';

/** A selectable field from the uploaded data set. */
export interface Field {
  name: string;
  role: 'dimension' | 'measure';
  icon: string;
}

/** A required input slot for a visualization (e.g. X-Axis, Value). */
export interface Slot {
  key: string;
  label: string;
  role: 'dimension' | 'measure';
}

/** A visualization type shown in the builder rail. */
export interface VizType {
  key: string;
  label: string;
  desc: string;
  icon: string;
  iconSafe?: SafeHtml;
}

/** Chart.js rendering metadata derived from a visualization key. */
export interface ChartMeta {
  type: 'bar' | 'line' | 'doughnut' | 'pie' | 'radar' | 'polarArea';
  indexAxis: 'x' | 'y';
  fill: boolean;
  multiColor: boolean;
  radial: boolean;
  legend: boolean;
}

/** A fully-configured widget placed on the builder canvas. */
export interface WidgetSpec {
  id: number;
  viz: string;
  title: string;
  chartType: ChartMeta['type'] | null;
  labels: string[];
  data: number[];
  primary: string;
  fill: boolean;
  multiColor: boolean;
  radial: boolean;
  indexAxis: 'x' | 'y';
  showLegend: boolean;
  kpiTotal?: number;
  kpiLabel?: string;
  tableColumns?: string[];
  tableRows?: (string | number)[][];
  drillState?: any;
}

/** A parsed table from an uploaded report (Data Explorer). */
export interface DataTable {
  name: string;
  columns: string[];
  types: ('num' | 'text' | 'money' | 'date')[];
  rows: (string | number)[][];
}
