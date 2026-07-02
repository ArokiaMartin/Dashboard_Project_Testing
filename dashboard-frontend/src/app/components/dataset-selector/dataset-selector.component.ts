import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Dataset, FieldMetadata, FieldType } from '../../models/dashboard.models';

@Component({
  selector: 'app-dataset-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dataset-selector.component.html',
  styleUrl: './dataset-selector.component.css'
})
export class DatasetSelectorComponent {
  @Input({ required: true }) datasets: Dataset[] = [];
  @Input() selectedDataset: Dataset | null = null;
  @Input() fieldMetadata: FieldMetadata[] = [];
  @Output() datasetSelected = new EventEmitter<string>();

  selectDataset(datasetId: string): void {
    this.datasetSelected.emit(datasetId);
  }

  getTypeClass(type: FieldType): string {
    return `type-badge type-${type}`;
  }
}
