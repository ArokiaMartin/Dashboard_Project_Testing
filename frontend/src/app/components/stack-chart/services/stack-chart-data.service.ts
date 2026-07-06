import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import {
  StackChartConfig,
  StackChartData,
  StackChartDataRow,
  MeasureConfig
} from '../models/stack-chart.model';
import {
  RAW_SALES_FACTS,
  RAW_EMPLOYEE_FACTS
} from '../constants/stack-chart-dummy-data';

@Injectable({
  providedIn: 'root'
})
export class StackChartDataService {

  // Dummy API endpoint (replace with real endpoint when backend is ready)
  private API_ENDPOINT = '/api/chart/data';

  constructor() { }

  // Fetch chart data based on config
  // This mimics a real backend: filter raw rows -> GROUP BY dimensions -> aggregate
  // measures -> sort -> paginate. Swap the final `of(...)` for an HTTP call once
  // the real API is ready; the config contract stays identical.
  fetchChartData(config: StackChartConfig): Observable<StackChartData> {
    const rawRows = this.getRawFacts(config.dataset);

    // WHERE
    const filteredRows = this.applyFilters(rawRows, config);

    // GROUP BY dimensions + aggregate measures (SUM/AVG/COUNT/MAX/MIN)
    const groupedRows = this.groupAndAggregate(filteredRows, config.dimensions, config.measures);

    // ORDER BY
    const sortedRows = this.applySorting(groupedRows, config);

    // TOP/OFFSET
    const paginatedRows = this.applyPagination(sortedRows, config);

    const response: StackChartData = {
      data: paginatedRows,
      metadata: {
        totalRecords: sortedRows.length,
        lastUpdated: new Date().toISOString()
      }
    };

    // Simulate API delay
    return of(response).pipe(delay(500));

    // TODO: Replace with actual HTTP call when backend is ready
    // return this.http.post<StackChartData>(this.API_ENDPOINT, config);
  }

  // Get raw (un-aggregated) fact rows for a dataset - stands in for a DB table
  private getRawFacts(dataset: string): StackChartDataRow[] {
    switch (dataset) {
      case 'employee':
        return RAW_EMPLOYEE_FACTS;
      case 'sales':
      default:
        return RAW_SALES_FACTS;
    }
  }

  // GROUP BY the requested dimensions, aggregating each measure per group.
  // This is what turns 48 raw transaction rows into e.g. 4 rows when grouping
  // by Region alone, or 12 rows when grouping by Region + Product.
  private groupAndAggregate(
    rows: StackChartDataRow[],
    dimensions: string[],
    measures: MeasureConfig[]
  ): StackChartDataRow[] {
    if (!dimensions.length) {
      return rows;
    }

    const groups = new Map<string, StackChartDataRow[]>();
    rows.forEach(row => {
      const key = dimensions.map(dim => row[dim]).join('||');
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(row);
    });

    const result: StackChartDataRow[] = [];
    groups.forEach(groupRows => {
      const outRow: StackChartDataRow = {};
      dimensions.forEach(dim => {
        outRow[dim] = groupRows[0][dim];
      });
      measures.forEach(measure => {
        const values = groupRows.map(r => Number(r[measure.field]) || 0);
        outRow[measure.alias || measure.field] = this.aggregate(values, measure.aggregation);
      });
      result.push(outRow);
    });

    return result;
  }

  // SUM / AVG / COUNT / MAX / MIN
  private aggregate(values: number[], aggregation: string): number {
    switch (aggregation) {
      case 'AVG':
        return values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : 0;
      case 'COUNT':
        return values.length;
      case 'MAX':
        return values.length ? Math.max(...values) : 0;
      case 'MIN':
        return values.length ? Math.min(...values) : 0;
      case 'SUM':
      default:
        return +values.reduce((a, b) => a + b, 0).toFixed(2);
    }
  }

  // Apply filters to data
  private applyFilters(data: StackChartDataRow[], config: StackChartConfig): StackChartDataRow[] {
    if (!config.filters || !config.filters.rules || config.filters.rules.length === 0) {
      return data;
    }

    return data.filter(row => {
      if (config.filters.condition === 'AND') {
        return config.filters.rules.every(rule => this.matchesRule(row, rule));
      } else {
        return config.filters.rules.some(rule => this.matchesRule(row, rule));
      }
    });
  }

  // Check if a row matches a filter rule
  private matchesRule(row: StackChartDataRow, rule: any): boolean {
    const fieldValue = row[rule.field];

    switch (rule.operator) {
      case '=':
        return fieldValue === rule.value;
      case '!=':
        return fieldValue !== rule.value;
      case '>':
        return fieldValue > rule.value;
      case '<':
        return fieldValue < rule.value;
      case 'IN':
        return Array.isArray(rule.value) && rule.value.includes(fieldValue);
      case 'BETWEEN':
        return fieldValue >= rule.value[0] && fieldValue <= rule.value[1];
      default:
        return true;
    }
  }

  // Apply sorting to data
  private applySorting(data: StackChartDataRow[], config: StackChartConfig): StackChartDataRow[] {
    if (!config.sorting || config.sorting.length === 0) {
      return data;
    }

    const sortConfig = config.sorting[0];
    const sorted = [...data].sort((a, b) => {
      const aVal = a[sortConfig.field];
      const bVal = b[sortConfig.field];

      if (aVal < bVal) {
        return sortConfig.direction === 'ASC' ? -1 : 1;
      }
      if (aVal > bVal) {
        return sortConfig.direction === 'ASC' ? 1 : -1;
      }
      return 0;
    });

    return sorted;
  }

  // Apply pagination to data
  private applyPagination(data: StackChartDataRow[], config: StackChartConfig): StackChartDataRow[] {
    const { offset, top } = config.pagination;
    return data.slice(offset, offset + top);
  }

  // Get available datasets (for dropdown)
  getAvailableDatasets(): Observable<string[]> {
    return of(['sales', 'employee']);
  }
}
