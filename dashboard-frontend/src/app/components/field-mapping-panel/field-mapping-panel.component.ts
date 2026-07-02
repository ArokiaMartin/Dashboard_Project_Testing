import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DashboardComponentConfig,
  FieldMappingConfig,
  FieldMetadata,
  KpiAggregation,
  SelectedMappings
} from '../../models/dashboard.models';

@Component({
  selector: 'app-field-mapping-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './field-mapping-panel.component.html',
  styleUrl: './field-mapping-panel.component.css'
})
export class FieldMappingPanelComponent {
  @Input() selectedComponent: DashboardComponentConfig | null = null;
  @Input() fields: FieldMetadata[] = [];
  @Input() mappings: SelectedMappings = {};
  @Input() validationMessages: string[] = [];
  @Input() datasetSelected = false;
  @Input() kpiAggregation: KpiAggregation = 'COUNT';
  @Input() kpiAggregations: KpiAggregation[] = [];

  @Output() mappingChanged = new EventEmitter<{ key: string; value: string | string[] | null }>();
  @Output() aggregationChanged = new EventEmitter<KpiAggregation>();

  getFieldsForMapping(mappingConfig: FieldMappingConfig): FieldMetadata[] {
    if (mappingConfig.acceptedTypes.includes('any')) {
      return this.fields;
    }

    return this.fields.filter((field) => mappingConfig.acceptedTypes.includes(field.type));
  }

  isFieldCompatible(mappingConfig: FieldMappingConfig, field: FieldMetadata): boolean {
    if (mappingConfig.acceptedTypes.includes('any')) {
      return true;
    }

    return mappingConfig.acceptedTypes.includes(field.type);
  }

  getSingleMappingValue(mappingKey: string): string {
    const selected = this.mappings[mappingKey];
    return typeof selected === 'string' ? selected : '';
  }

  onSingleMappingChange(mappingKey: string, value: string): void {
    this.mappingChanged.emit({ key: mappingKey, value: value || null });
  }

  onToggleMultiField(mappingKey: string, fieldName: string, checked: boolean): void {
    const current = (this.mappings[mappingKey] as string[]) ?? [];
    const next = checked ? [...new Set([...current, fieldName])] : current.filter((item) => item !== fieldName);
    this.mappingChanged.emit({ key: mappingKey, value: next });
  }

  isFieldSelected(mappingKey: string, fieldName: string): boolean {
    const selected = this.mappings[mappingKey];
    return Array.isArray(selected) ? selected.includes(fieldName) : false;
  }

  onAggregationChange(value: string): void {
    this.aggregationChanged.emit(value as KpiAggregation);
  }
}
