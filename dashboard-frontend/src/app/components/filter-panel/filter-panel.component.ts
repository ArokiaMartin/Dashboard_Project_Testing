import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FieldFilter, FieldMetadata, FilterState, KpiAggregation } from '../../models/dashboard.models';
import { distinctValues, numericRange } from '../../utils/filters';

@Component({
  selector: 'app-filter-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './filter-panel.component.html',
  styleUrl: './filter-panel.component.css'
})
export class FilterPanelComponent {
  @Input() fields: FieldMetadata[] = [];
  @Input() rows: Record<string, unknown>[] = [];
  @Input() filters: FilterState = {};
  @Input() supportsAggregation = false;
  @Input() aggregation: KpiAggregation = 'SUM';
  @Input() aggregations: KpiAggregation[] = [];

  @Output() filtersChanged = new EventEmitter<FilterState>();
  @Output() aggregationChanged = new EventEmitter<KpiAggregation>();

  get stringFields(): FieldMetadata[] {
    return this.fields.filter((field) => field.type === 'string');
  }

  get numberFields(): FieldMetadata[] {
    return this.fields.filter((field) => field.type === 'number');
  }

  get activeFilterCount(): number {
    return Object.values(this.filters).filter((filter) => this.isFilterActive(filter)).length;
  }

  getValues(field: string): string[] {
    return distinctValues(this.rows, field);
  }

  getRange(field: string): { min: number; max: number } | null {
    return numericRange(this.rows, field);
  }

  isValueSelected(field: string, value: string): boolean {
    const include = this.filters[field]?.include;
    // No selection means "all included".
    return !include || include.length === 0 || include.includes(value);
  }

  toggleValue(field: string, value: string): void {
    const all = this.getValues(field);
    const current = this.filters[field]?.include ?? [];
    const base = current.length ? current : [...all];
    const next = base.includes(value) ? base.filter((item) => item !== value) : [...base, value];

    const updated: FieldFilter = {
      field,
      type: 'string',
      include: next.length === all.length ? [] : next
    };
    this.emit(field, updated);
  }

  onRangeChange(field: string, bound: 'min' | 'max', raw: string): void {
    const parsed = raw === '' ? null : Number(raw);
    const existing = this.filters[field] ?? { field, type: 'number', min: null, max: null };
    const updated: FieldFilter = {
      field,
      type: 'number',
      min: bound === 'min' ? (Number.isFinite(parsed as number) ? parsed : null) : existing.min ?? null,
      max: bound === 'max' ? (Number.isFinite(parsed as number) ? parsed : null) : existing.max ?? null
    };
    this.emit(field, updated);
  }

  getBound(field: string, bound: 'min' | 'max'): number | null {
    const value = this.filters[field]?.[bound];
    return value ?? null;
  }

  clearAll(): void {
    this.filtersChanged.emit({});
  }

  onAggregationChange(value: string): void {
    this.aggregationChanged.emit(value as KpiAggregation);
  }

  private isFilterActive(filter: FieldFilter): boolean {
    if (filter.type === 'string') {
      return !!filter.include && filter.include.length > 0;
    }
    return (filter.min !== null && filter.min !== undefined) || (filter.max !== null && filter.max !== undefined);
  }

  private emit(field: string, updated: FieldFilter): void {
    const next: FilterState = { ...this.filters, [field]: updated };
    if (!this.isFilterActive(updated)) {
      delete next[field];
    }
    this.filtersChanged.emit(next);
  }
}
