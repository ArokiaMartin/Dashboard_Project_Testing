import { Injectable } from '@angular/core';
import { DUMMY_DATASETS } from '../constants/stack-chart-dummy-data';
import { AvailableField } from '../models/stack-chart.model';

@Injectable({
  providedIn: 'root'
})
export class StackChartConfigService {

  constructor() { }

  // Get all available datasets
  getAvailableDatasets(): string[] {
    return Object.keys(DUMMY_DATASETS);
  }

  // Get available dimensions for a dataset
  getDimensionsByDataset(dataset: string): AvailableField[] {
    const datasetConfig = DUMMY_DATASETS[dataset as keyof typeof DUMMY_DATASETS];
    return datasetConfig ? datasetConfig.dimensions : [];
  }

  // Get available measures for a dataset
  getMeasuresByDataset(dataset: string): AvailableField[] {
    const datasetConfig = DUMMY_DATASETS[dataset as keyof typeof DUMMY_DATASETS];
    return datasetConfig ? datasetConfig.measures : [];
  }

  // Get all fields (dimensions + measures) for a dataset
  getAllFieldsByDataset(dataset: string): AvailableField[] {
    const dimensions = this.getDimensionsByDataset(dataset);
    const measures = this.getMeasuresByDataset(dataset);
    return [...dimensions, ...measures];
  }

  // Get field by name
  getFieldByName(dataset: string, fieldName: string): AvailableField | undefined {
    const allFields = this.getAllFieldsByDataset(dataset);
    return allFields.find(field => field.name === fieldName);
  }

  // Get aggregation options (for measures)
  getAggregationOptions(): string[] {
    return ['SUM', 'AVG', 'COUNT', 'MAX', 'MIN'];
  }

  // Get filter operators based on field type
  getFilterOperatorsByFieldType(fieldType: string): string[] {
    if (fieldType === 'string') {
      return ['=', '!=', 'IN'];
    } else if (fieldType === 'number') {
      return ['=', '!=', '>', '<', 'BETWEEN', 'IN'];
    } else if (fieldType === 'date') {
      return ['=', '!=', '>', '<', 'BETWEEN'];
    }
    return ['=', '!='];
  }

  // Get default aggregation for a field
  getDefaultAggregation(fieldName: string, dataset: string): string {
    const field = this.getFieldByName(dataset, fieldName);
    if (field && field.type === 'measure') {
      return 'SUM';
    }
    return 'COUNT';
  }
}
