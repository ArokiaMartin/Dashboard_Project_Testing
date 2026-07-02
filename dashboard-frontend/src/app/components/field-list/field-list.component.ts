import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DashboardComponentConfig, FieldMetadata, FieldType } from '../../models/dashboard.models';

@Component({
  selector: 'app-field-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './field-list.component.html',
  styleUrl: './field-list.component.css'
})
export class FieldListComponent {
  @Input() fields: FieldMetadata[] = [];
  @Input() selectedComponent: DashboardComponentConfig | null = null;
  @Input() isFieldCompatible: (field: FieldMetadata) => boolean = () => true;

  getTypeClass(type: FieldType): string {
    return `type-badge type-${type}`;
  }
}
