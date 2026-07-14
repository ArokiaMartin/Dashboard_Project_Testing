import { Injectable } from '@angular/core';
import { VisualizationData, Dataset, ChartConfig, AggregatedData } from '@shared/types/dashboard.types';

@Injectable({
  providedIn: 'root'
})
export class VisualizationService {
  private readonly chartColors = [
    '#FF6384',
    '#36A2EB',
    '#FFCE56',
    '#4BC0C0',
    '#9966FF',
    '#FF9F40',
    '#FF6384',
    '#C9CBCF',
  ];

  constructor() {}

  /**
   * Prepare data for bar chart
   */
  prepareBarChartData(
    data: AggregatedData,
    xField: string,
    yField: string
  ): VisualizationData {
    const labels: string[] = [];
    const values: number[] = [];

    data.aggregations.forEach((row: any) => {
      labels.push(row[xField]?.toString() || '');
      values.push(row[yField] ?? 0);
    });

    return {
      labels,
      datasets: [
        {
          label: yField,
          data: values,
          backgroundColor: '#36A2EB',
          borderColor: '#36A2EB',
          borderWidth: 1,
        },
      ],
    };
  }

  /**
   * Prepare data for line chart
   */
  prepareLineChartData(
    data: AggregatedData,
    xField: string,
    yFields: string[]
  ): VisualizationData {
    const labels: string[] = [];
    const datasets: Dataset[] = [];

    // Extract labels from first data point
    if (data.aggregations.length > 0) {
      data.aggregations.forEach((row: any) => {
        labels.push(row[xField]?.toString() || '');
      });
    }

    // Create datasets for each Y field
    yFields.forEach((yField, index) => {
      const values: number[] = [];
      data.aggregations.forEach((row: any) => {
        values.push(row[yField] ?? 0);
      });

      datasets.push({
        label: yField,
        data: values,
        borderColor: this.chartColors[index % this.chartColors.length],
        backgroundColor: this.hexToRgba(
          this.chartColors[index % this.chartColors.length],
          0.1
        ),
        tension: 0.4,
        fill: true,
        borderWidth: 2,
      });
    });

    return { labels, datasets };
  }

  /**
   * Prepare data for pie chart
   */
  preparePieChartData(
    data: AggregatedData,
    labelField: string,
    valueField: string
  ): VisualizationData {
    const labels: string[] = [];
    const values: number[] = [];

    data.aggregations.forEach((row: any) => {
      labels.push(row[labelField]?.toString() || '');
      values.push(row[valueField] ?? 0);
    });

    return {
      labels,
      datasets: [
        {
          label: valueField,
          data: values,
          backgroundColor: this.chartColors.slice(0, labels.length),
          borderColor: '#fff',
          borderWidth: 2,
        },
      ],
    };
  }

  /**
   * Prepare data for multiple series chart
   */
  prepareGroupedChartData(
    data: AggregatedData,
    xField: string,
    yField: string,
    seriesField: string
  ): VisualizationData {
    const labels = new Set<string>();
    const seriesMap = new Map<string, Map<string, number>>();

    // Parse data into series structure
    data.aggregations.forEach((row: any) => {
      const xValue = row[xField]?.toString() || '';
      const seriesValue = row[seriesField]?.toString() || '';
      const yValue = row[yField] ?? 0;

      labels.add(xValue);

      if (!seriesMap.has(seriesValue)) {
        seriesMap.set(seriesValue, new Map());
      }
      seriesMap.get(seriesValue)!.set(xValue, yValue);
    });

    const labelArray = Array.from(labels).sort();
    const datasets: Dataset[] = [];

    let colorIndex = 0;
    seriesMap.forEach((valueMap, seriesName) => {
      const values = labelArray.map((label) => valueMap.get(label) ?? 0);
      datasets.push({
        label: seriesName,
        data: values,
        backgroundColor: this.chartColors[colorIndex % this.chartColors.length],
        borderColor: this.chartColors[colorIndex % this.chartColors.length],
        borderWidth: 1,
      });
      colorIndex++;
    });

    return {
      labels: labelArray,
      datasets,
    };
  }

  /**
   * Get chart options based on chart type
   */
  getChartOptions(
    chartType: string,
    config?: any
  ): any {
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
        },
        title: {
          display: true,
          text: config?.title || '',
        },
      },
    };

    switch (chartType) {
      case 'bar':
        return {
          ...baseOptions,
          indexAxis: 'x' as const,
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (value: any) => {
                  if (typeof value === 'number') {
                    return value.toLocaleString();
                  }
                  return value;
                },
              },
            },
          },
        };

      case 'line':
        return {
          ...baseOptions,
          interaction: {
            mode: 'index' as const,
            intersect: false,
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (value: any) => {
                  if (typeof value === 'number') {
                    return value.toLocaleString();
                  }
                  return value;
                },
              },
            },
          },
        };

      case 'pie':
        return {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              display: true,
              position: 'right' as const,
            },
            tooltip: {
              callbacks: {
                label: (context: any) => {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce(
                    (a: number, b: number) => a + b,
                    0
                  );
                  const percentage = ((value / total) * 100).toFixed(1);
                  return `${label}: ${value.toLocaleString()} (${percentage}%)`;
                },
              },
            },
          },
        };

      case 'doughnut':
        return {
          ...this.getChartOptions('pie', config),
          plugins: {
            ...baseOptions.plugins,
          },
        };

      default:
        return baseOptions;
    }
  }

  /**
   * Format number with locale
   */
  formatNumber(value: number, decimals: number = 2): string {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  /**
   * Format currency
   */
  formatCurrency(value: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(value);
  }

  /**
   * Format percentage
   */
  formatPercentage(value: number, decimals: number = 2): string {
    return `${(value * 100).toFixed(decimals)}%`;
  }

  /**
   * Convert hex color to RGBA
   */
  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Generate color for series
   */
  getSeriesColor(index: number): string {
    return this.chartColors[index % this.chartColors.length];
  }

  /**
   * Generate array of colors
   */
  generateColors(count: number): string[] {
    return Array.from({ length: count }, (_, i) =>
      this.chartColors[i % this.chartColors.length]
    );
  }

  /**
   * Sort data by field
   */
  sortData(data: AggregatedData, field: string, ascending: boolean = true): AggregatedData {
    const sorted = [...data.aggregations].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];

      if (typeof aVal === 'string') {
        return ascending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      return ascending ? aVal - bVal : bVal - aVal;
    });

    return {
      ...data,
      aggregations: sorted,
    };
  }

  /**
   * Filter data by threshold
   */
  filterDataByThreshold(
    data: AggregatedData,
    field: string,
    threshold: number,
    operator: '>' | '<' | '>=' | '<=' = '>'
  ): AggregatedData {
    const filtered = data.aggregations.filter((row: any) => {
      const value = row[field];
      switch (operator) {
        case '>':
          return value > threshold;
        case '<':
          return value < threshold;
        case '>=':
          return value >= threshold;
        case '<=':
          return value <= threshold;
        default:
          return true;
      }
    });

    return {
      ...data,
      aggregations: filtered,
    };
  }

  /**
   * Limit data to top N rows
   */
  limitData(data: AggregatedData, limit: number, orderBy?: string): AggregatedData {
    let limited = [...data.aggregations];

    if (orderBy) {
      limited.sort((a, b) => b[orderBy] - a[orderBy]);
    }

    return {
      ...data,
      aggregations: limited.slice(0, limit),
    };
  }
}
