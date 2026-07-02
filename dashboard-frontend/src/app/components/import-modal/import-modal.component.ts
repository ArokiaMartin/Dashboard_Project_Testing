import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Dataset } from '../../models/dashboard.models';

@Component({
  selector: 'app-import-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './import-modal.component.html',
  styleUrl: './import-modal.component.css'
})
export class ImportModalComponent {
  @Input() datasets: Dataset[] = [];
  @Input() open = false;

  @Output() imported = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  selectedId: string | null = null;

  select(id: string): void {
    this.selectedId = id;
  }

  confirm(): void {
    if (this.selectedId) {
      this.imported.emit(this.selectedId);
      this.selectedId = null;
    }
  }

  close(): void {
    this.selectedId = null;
    this.closed.emit();
  }

  fieldCount(dataset: Dataset): number {
    return dataset.rows.length ? Object.keys(dataset.rows[0]).length : 0;
  }
}
