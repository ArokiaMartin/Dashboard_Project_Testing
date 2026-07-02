import { FieldMetadata, FieldType } from '../models/dashboard.models';

const SAMPLE_LIMIT = 4;

function classifyValue(value: unknown): FieldType {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return 'number';
  }

  if (typeof value === 'string') {
    return 'string';
  }

  if (typeof value === 'boolean') {
    return 'boolean';
  }

  return 'unknown';
}

export function detectFieldType(values: unknown[]): FieldType {
  const nonNullValues = values.filter((value) => value !== null && value !== undefined);
  if (nonNullValues.length === 0) {
    return 'unknown';
  }

  const counts: Record<FieldType, number> = {
    number: 0,
    string: 0,
    boolean: 0,
    unknown: 0
  };

  for (const value of nonNullValues) {
    counts[classifyValue(value)] += 1;
  }

  let bestType: FieldType = 'unknown';
  let bestCount = 0;

  (Object.keys(counts) as FieldType[]).forEach((key) => {
    if (counts[key] > bestCount) {
      bestType = key;
      bestCount = counts[key];
    }
  });

  return bestType;
}

export function detectFieldMetadata(rows: Record<string, unknown>[]): FieldMetadata[] {
  if (!rows.length) {
    return [];
  }

  const allKeys = Array.from(
    rows.reduce((acc, row) => {
      Object.keys(row).forEach((key) => acc.add(key));
      return acc;
    }, new Set<string>())
  );

  return allKeys.map((key) => {
    const values = rows.map((row) => row[key]);
    return {
      name: key,
      type: detectFieldType(values),
      sampleValues: values.filter((value) => value !== null && value !== undefined).slice(0, SAMPLE_LIMIT)
    };
  });
}
