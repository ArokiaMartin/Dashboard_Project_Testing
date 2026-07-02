import { Injectable } from '@angular/core';
import {
  StackChartConfig,
  MeasureConfig,
  FilterConfig,
  UserStackChartInput
} from '../models/stack-chart.model';
import { StackChartConfigService } from './stack-chart-config.service';

@Injectable({
  providedIn: 'root'
})
export class StackChartTransformService {

  constructor(private configService: StackChartConfigService) { }

  // Transform user input to backend config format
  transformUserInputToBackendConfig(userInput: UserStackChartInput): StackChartConfig {
    // Create measures configuration
    const measures: MeasureConfig[] = userInput.selectedMeasures.map(measureName => ({
      field: measureName,
      aggregation: this.configService.getDefaultAggregation(measureName, userInput.selectedDataset) as any,
      alias: measureName
    }));

    // Create filter configuration
    const filterConfig: FilterConfig = {
      condition: 'AND',
      rules: userInput.selectedFilters || []
    };

    // Build GROUP BY dimensions: primary dimension, plus an optional
    // breakdown dimension (e.g. Region + Product) for multi-dimension stacking
    const dimensions = [userInput.selectedDimension];
    if (userInput.selectedBreakdownDimension) {
      dimensions.push(userInput.selectedBreakdownDimension);
    }

    // Create backend config
    const backendConfig: StackChartConfig = {
      dataset: userInput.selectedDataset,
      dimensions: dimensions,
      measures: measures,
      filters: filterConfig,
      sorting: [
        {
          field: measures[0]?.field || 'id',
          direction: 'DESC'
        }
      ],
      pagination: {
        top: 100,
        offset: 0
      }
    };

    return backendConfig;
  }

  // Transform backend data to chart-ready format
  transformDataForChart(data: any[], dimension: string, measures: string[]): any {
    // Group data by dimension
    const groupedByDimension = this.groupByField(data, dimension);

    // Transform for chart library
    const chartData = {
      categories: Object.keys(groupedByDimension),
      series: measures.map(measure => ({
        name: measure,
        data: Object.values(groupedByDimension).map((item: any) => {
          return item[0]?.[measure] || 0;
        })
      }))
    };

    return chartData;
  }

  // Group array of objects by a field
  private groupByField(data: any[], fieldName: string): { [key: string]: any[] } {
    return data.reduce((acc, item) => {
      const key = item[fieldName];
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    }, {});
  }

  // Validate backend config
  validateBackendConfig(config: StackChartConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.dataset) {
      errors.push('Dataset is required');
    }

    if (!config.dimensions || config.dimensions.length === 0) {
      errors.push('At least one dimension is required');
    }

    if (!config.measures || config.measures.length === 0) {
      errors.push('At least one measure is required');
    }

    config.measures?.forEach((measure, index) => {
      if (!measure.field) {
        errors.push(`Measure ${index} is missing field name`);
      }
      if (!measure.aggregation) {
        errors.push(`Measure ${index} is missing aggregation`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Get chart options for ECharts/Chart.js
  getChartOptions(chartData: any, stackMode: string = 'normal'): any {
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        }
      },
      legend: {
        data: chartData.series.map((s: any) => s.name),
        top: 'bottom'
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: chartData.categories
      },
      yAxis: {
        type: 'value'
      },
      series: chartData.series.map((s: any) => ({
        name: s.name,
        type: 'bar',
        data: s.data,
        stack: stackMode === 'normal' ? 'total' : (stackMode === 'percent' ? 'total' : undefined),
        label: {
          show: false
        }
      }))
    };
  }
}
