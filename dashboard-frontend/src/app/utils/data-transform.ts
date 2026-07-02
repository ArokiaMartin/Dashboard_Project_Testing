import type { EChartsOption } from 'echarts';
import {
  DashboardComponentConfig,
  FilterState,
  KpiAggregation,
  KpiPreviewPayload,
  PreviewPayload,
  SelectedMappings,
  TablePreviewPayload
} from '../models/dashboard.models';
import { groupAndAggregateByKey, toFiniteNumber } from './aggregation';
import { applyFilters } from './filters';

const PALETTE = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#0ea5e9', '#a855f7', '#22c55e', '#ef4444'];

function buildBarOption(
  rows: Record<string, unknown>[],
  xField: string,
  yField: string,
  aggregation: KpiAggregation
): EChartsOption {
  const grouped = groupAndAggregateByKey(rows, xField, yField, aggregation);

  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 12, right: 16, bottom: 8, top: 24, containLabel: true },
    xAxis: {
      type: 'category',
      data: grouped.keys
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        type: 'bar',
        data: grouped.values,
        itemStyle: {
          color: '#6366f1',
          borderRadius: [8, 8, 0, 0]
        }
      }
    ]
  };
}

function buildStackedBarOption(
  rows: Record<string, unknown>[],
  xField: string,
  groupField: string,
  yField: string,
  aggregation: KpiAggregation
): EChartsOption {
  const categories = Array.from(new Set(rows.map((row) => String(row[xField] ?? 'Unknown'))));
  const groups = Array.from(new Set(rows.map((row) => String(row[groupField] ?? 'Unknown'))));

  const series = groups.map((group, index) => {
    const groupRows = rows.filter((row) => String(row[groupField] ?? 'Unknown') === group);
    const grouped = groupAndAggregateByKey(groupRows, xField, yField, aggregation);
    const lookup = new Map(grouped.keys.map((key, i) => [key, grouped.values[i]]));

    return {
      name: group,
      type: 'bar' as const,
      stack: 'total',
      emphasis: { focus: 'series' as const },
      data: categories.map((category) => lookup.get(category) ?? 0),
      itemStyle: { color: PALETTE[index % PALETTE.length] }
    };
  });

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0 },
    grid: { left: 12, right: 16, bottom: 32, top: 24, containLabel: true },
    xAxis: { type: 'category', data: categories },
    yAxis: { type: 'value' },
    series
  };
}

function buildLineOption(
  rows: Record<string, unknown>[],
  xField: string,
  yField: string,
  aggregation: KpiAggregation
): EChartsOption {
  const grouped = groupAndAggregateByKey(rows, xField, yField, aggregation);

  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 12, right: 16, bottom: 8, top: 24, containLabel: true },
    xAxis: {
      type: 'category',
      data: grouped.keys
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        type: 'line',
        smooth: true,
        data: grouped.values,
        lineStyle: {
          width: 3,
          color: '#14b8a6'
        },
        itemStyle: {
          color: '#14b8a6'
        }
      }
    ]
  };
}

function buildAreaOption(
  rows: Record<string, unknown>[],
  xField: string,
  yField: string,
  aggregation: KpiAggregation
): EChartsOption {
  const grouped = groupAndAggregateByKey(rows, xField, yField, aggregation);

  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 12, right: 16, bottom: 8, top: 24, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: grouped.keys
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        type: 'line',
        smooth: true,
        data: grouped.values,
        lineStyle: { width: 3, color: '#6366f1' },
        itemStyle: { color: '#6366f1' },
        areaStyle: { opacity: 0.28, color: '#6366f1' }
      }
    ]
  };
}

function buildPieOption(
  rows: Record<string, unknown>[],
  labelField: string,
  valueField: string,
  aggregation: KpiAggregation,
  donut = false
): EChartsOption {
  const grouped = groupAndAggregateByKey(rows, labelField, valueField, aggregation);

  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    color: PALETTE,
    series: [
      {
        type: 'pie',
        radius: donut ? ['45%', '72%'] : ['0%', '70%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: donut ? 8 : 0, borderColor: '#fff', borderWidth: 2 },
        data: grouped.keys.map((key, index) => ({
          name: key,
          value: grouped.values[index]
        })),
        label: {
          formatter: '{b}: {d}%'
        }
      }
    ]
  };
}

function buildScatterOption(rows: Record<string, unknown>[], xField: string, yField: string): EChartsOption {
  const points: number[][] = [];

  for (const row of rows) {
    const xValue = toFiniteNumber(row[xField]);
    const yValue = toFiniteNumber(row[yField]);
    if (xValue === null || yValue === null) {
      continue;
    }
    points.push([xValue, yValue]);
  }

  return {
    tooltip: {
      trigger: 'item'
    },
    grid: { left: 12, right: 16, bottom: 8, top: 24, containLabel: true },
    xAxis: {
      type: 'value'
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        type: 'scatter',
        symbolSize: 12,
        data: points,
        itemStyle: {
          color: '#6366f1'
        }
      }
    ]
  };
}

function buildTablePayload(rows: Record<string, unknown>[], columns: string[]): TablePreviewPayload {
  return {
    kind: 'table',
    columns,
    rows
  };
}

function calculateKpiValue(rows: Record<string, unknown>[], aggregation: KpiAggregation, metricField?: string): number {
  if (aggregation === 'COUNT') {
    return rows.length;
  }

  if (!metricField) {
    return 0;
  }

  const values = rows
    .map((row) => toFiniteNumber(row[metricField]))
    .filter((value): value is number => value !== null);

  if (aggregation === 'SUM') {
    return values.reduce((acc, value) => acc + value, 0);
  }

  if (aggregation === 'AVG') {
    return values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : 0;
  }

  if (aggregation === 'MIN') {
    return values.length ? Math.min(...values) : 0;
  }

  if (aggregation === 'MAX') {
    return values.length ? Math.max(...values) : 0;
  }

  return 0;
}

export function buildPreviewPayload(
  component: DashboardComponentConfig,
  mappings: SelectedMappings,
  rows: Record<string, unknown>[],
  aggregation: KpiAggregation,
  filters: FilterState = {}
): PreviewPayload | null {
  const filteredRows = applyFilters(rows, filters);
  const chartAggregation: KpiAggregation = component.supportsAggregation ? aggregation : 'SUM';

  if (component.type === 'chart') {
    if (component.chartType === 'bar') {
      const xField = mappings['xAxis'] as string;
      const yField = mappings['yAxis'] as string;
      return { kind: 'chart', option: buildBarOption(filteredRows, xField, yField, chartAggregation) };
    }

    if (component.chartType === 'stackedBar') {
      const xField = mappings['xAxis'] as string;
      const groupField = mappings['groupBy'] as string;
      const yField = mappings['yAxis'] as string;
      return { kind: 'chart', option: buildStackedBarOption(filteredRows, xField, groupField, yField, chartAggregation) };
    }

    if (component.chartType === 'line') {
      const xField = mappings['xAxis'] as string;
      const yField = mappings['yAxis'] as string;
      return { kind: 'chart', option: buildLineOption(filteredRows, xField, yField, chartAggregation) };
    }

    if (component.chartType === 'area') {
      const xField = mappings['xAxis'] as string;
      const yField = mappings['yAxis'] as string;
      return { kind: 'chart', option: buildAreaOption(filteredRows, xField, yField, chartAggregation) };
    }

    if (component.chartType === 'pie') {
      const labelField = mappings['label'] as string;
      const valueField = mappings['value'] as string;
      return { kind: 'chart', option: buildPieOption(filteredRows, labelField, valueField, chartAggregation) };
    }

    if (component.chartType === 'donut') {
      const labelField = mappings['label'] as string;
      const valueField = mappings['value'] as string;
      return { kind: 'chart', option: buildPieOption(filteredRows, labelField, valueField, chartAggregation, true) };
    }

    if (component.chartType === 'scatter') {
      const xField = mappings['xAxis'] as string;
      const yField = mappings['yAxis'] as string;
      return { kind: 'chart', option: buildScatterOption(filteredRows, xField, yField) };
    }
  }

  if (component.type === 'table') {
    const columns = (mappings['columns'] as string[]) ?? [];
    return buildTablePayload(filteredRows, columns);
  }

  if (component.type === 'kpi') {
    const metricField = mappings['metricField'] as string | null;
    const value = calculateKpiValue(filteredRows, aggregation, metricField ?? undefined);
    const payload: KpiPreviewPayload = {
      kind: 'kpi',
      value,
      aggregation,
      metricLabel: aggregation === 'COUNT' ? 'Rows' : metricField ?? 'Metric'
    };
    return payload;
  }

  return null;
}
