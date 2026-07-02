import { FilterState } from '../models/dashboard.models';
import { toFiniteNumber } from './aggregation';

/**
 * Applies the active field filters to a set of rows. String fields use an
 * include allow-list, numeric fields use inclusive min/max bounds. Filters with
 * no meaningful constraint are ignored so an empty filter state is a no-op.
 */
export function applyFilters(
  rows: Record<string, unknown>[],
  filters: FilterState
): Record<string, unknown>[] {
  const active = Object.values(filters).filter((filter) => {
    if (filter.type === 'string') {
      return Array.isArray(filter.include) && filter.include.length > 0;
    }
    return filter.min !== null && filter.min !== undefined
      ? true
      : filter.max !== null && filter.max !== undefined;
  });

  if (!active.length) {
    return rows;
  }

  return rows.filter((row) =>
    active.every((filter) => {
      const raw = row[filter.field];

      if (filter.type === 'string') {
        return (filter.include ?? []).includes(String(raw ?? 'Unknown'));
      }

      const value = toFiniteNumber(raw);
      if (value === null) {
        return false;
      }
      if (filter.min !== null && filter.min !== undefined && value < filter.min) {
        return false;
      }
      if (filter.max !== null && filter.max !== undefined && value > filter.max) {
        return false;
      }
      return true;
    })
  );
}

/** Returns the distinct string values for a field, useful for category filters. */
export function distinctValues(rows: Record<string, unknown>[], field: string): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    set.add(String(row[field] ?? 'Unknown'));
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Returns the numeric [min, max] range for a field, or null if none present. */
export function numericRange(rows: Record<string, unknown>[], field: string): { min: number; max: number } | null {
  const values = rows
    .map((row) => toFiniteNumber(row[field]))
    .filter((value): value is number => value !== null);

  if (!values.length) {
    return null;
  }

  return { min: Math.min(...values), max: Math.max(...values) };
}
