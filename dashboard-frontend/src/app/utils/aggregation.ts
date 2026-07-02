import { KpiAggregation } from '../models/dashboard.models';

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function sumNumbers(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

export function averageNumbers(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return sumNumbers(values) / values.length;
}

export function applyAggregation(values: number[], aggregation: KpiAggregation): number {
  switch (aggregation) {
    case 'SUM':
      return sumNumbers(values);
    case 'AVG':
      return averageNumbers(values);
    case 'MIN':
      return values.length ? Math.min(...values) : 0;
    case 'MAX':
      return values.length ? Math.max(...values) : 0;
    case 'COUNT':
      return values.length;
    default:
      return 0;
  }
}

export function groupAndSumByKey(rows: Record<string, unknown>[], keyField: string, valueField: string): { keys: string[]; values: number[] } {
  const grouped = new Map<string, number>();

  for (const row of rows) {
    const key = String(row[keyField] ?? 'Unknown');
    const numericValue = toFiniteNumber(row[valueField]);
    if (numericValue === null) {
      continue;
    }

    grouped.set(key, (grouped.get(key) ?? 0) + numericValue);
  }

  return {
    keys: Array.from(grouped.keys()),
    values: Array.from(grouped.values())
  };
}

/**
 * Groups rows by a key field and reduces the value field using the supplied
 * aggregation. Unlike {@link groupAndSumByKey}, this respects SUM/AVG/MIN/MAX/COUNT.
 */
export function groupAndAggregateByKey(
  rows: Record<string, unknown>[],
  keyField: string,
  valueField: string,
  aggregation: KpiAggregation
): { keys: string[]; values: number[] } {
  const buckets = new Map<string, number[]>();

  for (const row of rows) {
    const key = String(row[keyField] ?? 'Unknown');
    const numericValue = toFiniteNumber(row[valueField]);
    const bucket = buckets.get(key) ?? [];
    if (numericValue !== null) {
      bucket.push(numericValue);
    }
    buckets.set(key, bucket);
  }

  const keys = Array.from(buckets.keys());
  const values = keys.map((key) => {
    const bucket = buckets.get(key) ?? [];
    return aggregation === 'COUNT' ? bucket.length : applyAggregation(bucket, aggregation);
  });

  return { keys, values };
}
