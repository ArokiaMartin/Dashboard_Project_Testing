import { Component, OnInit, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SchemaService } from '../services/schema.service';
import { Column, FieldSelection } from '../types/dashboard.types';

@Component({
  selector: 'app-field-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './field-picker.component.html',
  styleUrls: ['./field-picker.component.scss'],
})
export class FieldPickerComponent implements OnInit {
  @Input() chartType: string = 'bar';
  @Output() selectionChanged = new EventEmitter<FieldSelection>();

  dimensions: Column[] = [];
  measures: Column[] = [];

  selectedDimensions: string[] = [];
  selectedMeasures: string[] = [];

  constructor(private schemaService: SchemaService) {}

  ngOnInit(): void {
    this.loadFields();
  }

  loadFields(): void {
    this.schemaService.getDimensions().subscribe((dims) => {
      this.dimensions = dims;
    });

    this.schemaService.getMeasures().subscribe((meas) => {
      this.measures = meas;
    });
  }

  toggleDimension(dimensionName: string): void {
    const index = this.selectedDimensions.indexOf(dimensionName);
    if (index > -1) {
      this.selectedDimensions.splice(index, 1);
    } else {
      this.selectedDimensions.push(dimensionName);
    }
    this.emitSelection();
  }

  toggleMeasure(measureName: string): void {
    const index = this.selectedMeasures.indexOf(measureName);
    if (index > -1) {
      this.selectedMeasures.splice(index, 1);
    } else {
      this.selectedMeasures.push(measureName);
    }
    this.emitSelection();
  }

  clearSelection(): void {
    this.selectedDimensions = [];
    this.selectedMeasures = [];
    this.emitSelection();
  }

  private emitSelection(): void {
    this.selectionChanged.emit({
      dimensions: this.selectedDimensions,
      measures: this.selectedMeasures,
    });
  }

  getRequiredFields(): { dimensions: number; measures: number } {
    switch (this.chartType) {
      case 'bar':
        return { dimensions: 1, measures: 1 };
      case 'line':
        return { dimensions: 1, measures: 1 };
      case 'pie':
        return { dimensions: 1, measures: 1 };
      case 'table':
        return { dimensions: -1, measures: -1 }; // Any number
      default:
        return { dimensions: 1, measures: 1 };
    }
  }

  isValidSelection(): boolean {
    const required = this.getRequiredFields();
    if (required.dimensions > 0 && this.selectedDimensions.length < required.dimensions) {
      return false;
    }
    if (required.measures > 0 && this.selectedMeasures.length < required.measures) {
      return false;
    }
    return true;
  }
}
