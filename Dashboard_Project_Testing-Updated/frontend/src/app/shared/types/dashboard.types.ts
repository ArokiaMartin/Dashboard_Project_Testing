/**
 * Core Dashboard Type Definitions
 */

export interface TableSchema {
  name: string;
  columns: Column[];
}

export interface Column {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  description?: string;
}

export interface FieldSelection {
  dimensions: string[];
  measures: string[];
}

export interface ChartConfig {
  type: ChartType;
  title: string;
  xAxisField?: string;
  yAxisField?: string;
  seriesField?: string;
  dimensions?: string[];
  measures?: string[];
  options?: ChartOptions;
}

export type ChartType = 'bar' | 'line' | 'pie' | 'table' | 'kpi';

export interface ChartOptions {
  responsive?: boolean;
  maintainAspectRatio?: boolean;
  scales?: any;
  plugins?: any;
  [key: string]: any;
}

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  config: ChartConfig | KPIConfig | TableConfig;
  data?: any[];
  layout?: WidgetLayout;
}

export type WidgetType = 'chart' | 'kpi' | 'table';

export interface WidgetLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  schema: TableSchema;
  widgets: Widget[];
  createdAt: Date;
  updatedAt: Date;
}

export interface KPIConfig {
  type: 'kpi';
  title: string;
  metric: string;
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  filters?: FilterCondition[];
  comparison?: {
    enabled: boolean;
    period: 'previous' | 'yearago';
  };
}

export interface TableConfig {
  type: 'table';
  title: string;
  columns: string[];
  pageSize?: number;
  sortable?: boolean;
  filterable?: boolean;
}

export interface FilterCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin';
  value: any;
}

export interface DashboardResponse {
  success: boolean;
  data?: Dashboard;
  message?: string;
  error?: string;
}

export interface DataResponse {
  success: boolean;
  data?: any[];
  message?: string;
  error?: string;
}

export interface SchemaResponse {
  success: boolean;
  schema?: TableSchema;
  message?: string;
  error?: string;
}

export interface VisualizationData {
  labels: string[];
  datasets: Dataset[];
}

export interface Dataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string;
  borderWidth?: number;
  fill?: boolean;
  tension?: number;
}

export interface PaginatedData {
  items: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AggregatedData {
  groupBy: string[];
  aggregations: {
    [key: string]: any;
  }[];
}
