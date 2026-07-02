import {
  DashboardComponentConfig,
  FieldMetadata,
  KpiAggregation,
  SelectedMappings,
  ValidationResult
} from '../models/dashboard.models';

function hasAnySelection(value: string | string[] | null | undefined): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return typeof value === 'string' && value.length > 0;
}

function isTypeCompatible(fieldType: string, acceptedTypes: string[]): boolean {
  if (acceptedTypes.includes('any')) {
    return true;
  }

  return acceptedTypes.includes(fieldType);
}

export function validateMappings(
  component: DashboardComponentConfig | null,
  fields: FieldMetadata[],
  mappings: SelectedMappings,
  aggregation: KpiAggregation,
  rows: Record<string, unknown>[]
): ValidationResult {
  if (!component) {
    return { isValid: false, messages: ['Select a dashboard component to continue.'] };
  }

  const messages: string[] = [];
  const fieldMap = new Map(fields.map((field) => [field.name, field]));

  for (const mappingConfig of component.requiredMappings) {
    const selectedValue = mappings[mappingConfig.key];

    if (mappingConfig.required && !hasAnySelection(selectedValue)) {
      messages.push(`${mappingConfig.label} is required.`);
      continue;
    }

    if (!hasAnySelection(selectedValue)) {
      continue;
    }

    const values = Array.isArray(selectedValue) ? selectedValue : [selectedValue as string];

    for (const fieldName of values) {
      const field = fieldMap.get(fieldName);
      if (!field) {
        messages.push(`${mappingConfig.label} references a field that does not exist.`);
        continue;
      }

      if (!isTypeCompatible(field.type, mappingConfig.acceptedTypes)) {
        messages.push(`${field.name} is not compatible with ${mappingConfig.label}.`);
      }
    }
  }

  if (component.id === 'kpiCard') {
    const selectedMetric = mappings['metricField'] as string | null | undefined;
    if (aggregation === 'COUNT') {
      return {
        isValid: messages.length === 0,
        messages
      };
    }

    if (!selectedMetric) {
      messages.push('Metric Field is required for SUM, AVG, MIN, and MAX.');
    } else {
      const metricField = fieldMap.get(selectedMetric);
      if (!metricField) {
        messages.push('Metric Field does not exist in the selected dataset.');
      } else if (metricField.type !== 'number') {
        messages.push('Metric Field must be numeric for SUM, AVG, MIN, and MAX.');
      }
    }
  }

  if (!rows.length) {
    messages.push('Selected dataset does not contain rows to render.');
  }

  return {
    isValid: messages.length === 0,
    messages
  };
}
