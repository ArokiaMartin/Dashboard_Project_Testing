import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SchemaService } from '@core/services/schema.service';
import { TableSchema, Column } from '@shared/types/dashboard.types';

@Component({
  selector: 'app-model-explorer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './model-explorer.component.html',
  styleUrls: ['./model-explorer.component.scss'],
})
export class ModelExplorerComponent implements OnInit {
  schema: TableSchema | null = null;
  dimensions: Column[] = [];
  measures: Column[] = [];
  selectedColumn: Column | null = null;
  isLoading = false;

  constructor(private schemaService: SchemaService) {}

  ngOnInit(): void {
    this.loadSchema();
  }

  loadSchema(): void {
    this.isLoading = true;
    this.schemaService.getSchema().subscribe({
      next: (schema) => {
        this.schema = schema;
        this.isLoading = false;
      },
    });

    this.schemaService.getDimensions().subscribe({
      next: (dimensions) => {
        this.dimensions = dimensions;
      },
    });

    this.schemaService.getMeasures().subscribe({
      next: (measures) => {
        this.measures = measures;
      },
    });
  }

  selectColumn(column: Column): void {
    this.selectedColumn = this.selectedColumn?.name === column.name ? null : column;
  }

  getColumnTypeIcon(type: string): string {
    switch (type) {
      case 'string':
        return 'bi-type';
      case 'number':
        return 'bi-graph-up';
      case 'date':
        return 'bi-calendar';
      case 'boolean':
        return 'bi-toggle-on';
      default:
        return 'bi-info-circle';
    }
  }

  getColumnTypeBadge(type: string): string {
    switch (type) {
      case 'string':
        return 'badge-info';
      case 'number':
        return 'badge-success';
      case 'date':
        return 'badge-warning';
      case 'boolean':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  }
}
