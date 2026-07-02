export type FieldType = 'string' | 'number' | 'boolean' | 'unknown';

export interface Dataset {
  id: string;
  name: string;
  description: string;
  rows: Record<string, unknown>[];
}

export interface FieldMetadata {
  name: string;
  type: FieldType;
  sampleValues: unknown[];
}

export interface FieldMappingConfig {
  key: string;
  label: string;
  acceptedTypes: Array<FieldType | 'any'>;
  multiple?: boolean;
  required?: boolean;
}

export type DashboardComponentType = 'chart' | 'table' | 'kpi';
export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'stackedBar' | 'area' | 'donut';
export type KpiAggregation = 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT';

export interface DashboardComponentConfig {
  id: string;
  label: string;
  description: string;
  icon: string;
  type: DashboardComponentType;
  chartType?: ChartType;
  /** Whether this component supports a value aggregation selector (SUM/AVG/...). */
  supportsAggregation?: boolean;
  requiredMappings: FieldMappingConfig[];
}

export interface SelectedMappings {
  [key: string]: string | string[] | null;
}

/**
 * Per-field filter state applied before a component is rendered.
 * - `include`: allow-list of category values (string fields)
 * - `min`/`max`: numeric bounds (number fields)
 */
export interface FieldFilter {
  field: string;
  type: FieldType;
  include?: string[];
  min?: number | null;
  max?: number | null;
}

export interface FilterState {
  [field: string]: FieldFilter;
}

export interface SavedDashboard {
  id: string;
  name: string;
  datasetId: string;
  datasetName: string;
  componentId: string;
  componentLabel: string;
  mappings: SelectedMappings;
  kpiAggregation: KpiAggregation;
  filters: FilterState;
  createdAt: number;
}

export interface ValidationResult {
  isValid: boolean;
  messages: string[];
}

export interface ChartPreviewPayload {
  kind: 'chart';
  option: import('echarts').EChartsOption;
}

export interface TablePreviewPayload {
  kind: 'table';
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface KpiPreviewPayload {
  kind: 'kpi';
  value: number;
  aggregation: KpiAggregation;
  metricLabel: string;
}

export type PreviewPayload = ChartPreviewPayload | TablePreviewPayload | KpiPreviewPayload;
