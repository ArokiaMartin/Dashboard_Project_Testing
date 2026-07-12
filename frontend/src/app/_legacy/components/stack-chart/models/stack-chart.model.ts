// Interface definitions for Stack Chart component

export interface StackChartConfig {
  dataset: string;
  dimensions: string[];
  measures: MeasureConfig[];
  filters: FilterConfig;
  sorting: SortingConfig[];
  pagination: PaginationConfig;
}

export interface MeasureConfig {
  field: string;
  aggregation: 'SUM' | 'AVG' | 'COUNT' | 'MAX' | 'MIN';
  alias: string;
}

export interface FilterConfig {
  condition: 'AND' | 'OR';
  rules: FilterRule[];
}

export interface FilterRule {
  field: string;
  operator: '=' | '!=' | '>' | '<' | 'IN' | 'BETWEEN';
  value: any;
}

export interface SortingConfig {
  field: string;
  direction: 'ASC' | 'DESC';
}

export interface PaginationConfig {
  top: number;
  offset: number;
}

export interface StackChartDataRow {
  [key: string]: any;
}

export interface StackChartData {
  data: StackChartDataRow[];
  metadata: {
    totalRecords: number;
    lastUpdated: string;
  };
}

export interface AvailableField {
  name: string;
  displayName: string;
  type: string;
  dataType: string;
}

export interface UserStackChartInput {
  selectedDataset: string;
  selectedDimension: string;
  selectedBreakdownDimension?: string;
  selectedMeasures: string[];
  selectedFilters: FilterRule[];
  stackMode: 'normal' | 'percent' | 'grouped';
  stackOrientation: 'vertical' | 'horizontal';
}
