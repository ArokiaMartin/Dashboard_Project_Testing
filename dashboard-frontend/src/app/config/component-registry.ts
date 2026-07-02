import { DashboardComponentConfig } from '../models/dashboard.models';

export const COMPONENT_REGISTRY: DashboardComponentConfig[] = [
  {
    id: 'barChart',
    label: 'Bar Chart',
    description: 'Compare numeric values across categories.',
    icon: '▥',
    type: 'chart',
    chartType: 'bar',
    supportsAggregation: true,
    requiredMappings: [
      {
        key: 'xAxis',
        label: 'X Axis',
        acceptedTypes: ['string'],
        required: true
      },
      {
        key: 'yAxis',
        label: 'Y Axis',
        acceptedTypes: ['number'],
        required: true
      }
    ]
  },
  {
    id: 'stackedBarChart',
    label: 'Stacked Bar Chart',
    description: 'Break each category down by a grouping dimension.',
    icon: '▤',
    type: 'chart',
    chartType: 'stackedBar',
    supportsAggregation: true,
    requiredMappings: [
      {
        key: 'xAxis',
        label: 'X Axis (Category)',
        acceptedTypes: ['string'],
        required: true
      },
      {
        key: 'groupBy',
        label: 'Stack / Series',
        acceptedTypes: ['string'],
        required: true
      },
      {
        key: 'yAxis',
        label: 'Value',
        acceptedTypes: ['number'],
        required: true
      }
    ]
  },
  {
    id: 'lineChart',
    label: 'Line Chart',
    description: 'Show trends across ordered values.',
    icon: '⟍',
    type: 'chart',
    chartType: 'line',
    supportsAggregation: true,
    requiredMappings: [
      {
        key: 'xAxis',
        label: 'X Axis',
        acceptedTypes: ['string', 'number'],
        required: true
      },
      {
        key: 'yAxis',
        label: 'Y Axis',
        acceptedTypes: ['number'],
        required: true
      }
    ]
  },
  {
    id: 'areaChart',
    label: 'Area Chart',
    description: 'Emphasise volume of a trend over a dimension.',
    icon: '◹',
    type: 'chart',
    chartType: 'area',
    supportsAggregation: true,
    requiredMappings: [
      {
        key: 'xAxis',
        label: 'X Axis',
        acceptedTypes: ['string', 'number'],
        required: true
      },
      {
        key: 'yAxis',
        label: 'Y Axis',
        acceptedTypes: ['number'],
        required: true
      }
    ]
  },
  {
    id: 'pieChart',
    label: 'Pie Chart',
    description: 'Display part-to-whole contribution by category.',
    icon: '◔',
    type: 'chart',
    chartType: 'pie',
    supportsAggregation: true,
    requiredMappings: [
      {
        key: 'label',
        label: 'Label',
        acceptedTypes: ['string'],
        required: true
      },
      {
        key: 'value',
        label: 'Value',
        acceptedTypes: ['number'],
        required: true
      }
    ]
  },
  {
    id: 'donutChart',
    label: 'Donut Chart',
    description: 'A modern part-to-whole ring by category.',
    icon: '◍',
    type: 'chart',
    chartType: 'donut',
    supportsAggregation: true,
    requiredMappings: [
      {
        key: 'label',
        label: 'Label',
        acceptedTypes: ['string'],
        required: true
      },
      {
        key: 'value',
        label: 'Value',
        acceptedTypes: ['number'],
        required: true
      }
    ]
  },
  {
    id: 'scatterPlot',
    label: 'Scatter Plot',
    description: 'Discover relationships between two numeric fields.',
    icon: '⋯',
    type: 'chart',
    chartType: 'scatter',
    requiredMappings: [
      {
        key: 'xAxis',
        label: 'X Axis',
        acceptedTypes: ['number'],
        required: true
      },
      {
        key: 'yAxis',
        label: 'Y Axis',
        acceptedTypes: ['number'],
        required: true
      }
    ]
  },
  {
    id: 'dataTable',
    label: 'Data Table',
    description: 'Render dataset records with selected columns.',
    icon: '▦',
    type: 'table',
    requiredMappings: [
      {
        key: 'columns',
        label: 'Columns',
        acceptedTypes: ['any'],
        multiple: true,
        required: true
      }
    ]
  },
  {
    id: 'kpiCard',
    label: 'KPI Card',
    description: 'Compute aggregated KPI from selected metric field.',
    icon: '◉',
    type: 'kpi',
    requiredMappings: [
      {
        key: 'metricField',
        label: 'Metric Field',
        acceptedTypes: ['number'],
        required: false
      }
    ]
  }
];

export const COMPONENT_REGISTRY_MAP = COMPONENT_REGISTRY.reduce<Record<string, DashboardComponentConfig>>((acc, config) => {
  acc[config.id] = config;
  return acc;
}, {});
