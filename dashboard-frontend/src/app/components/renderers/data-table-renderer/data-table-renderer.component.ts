import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-data-table-renderer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './data-table-renderer.component.html',
  styleUrl: './data-table-renderer.component.css'
})
export class DataTableRendererComponent {
  @Input() columns: string[] = [];
  @Input() rows: Record<string, unknown>[] = [];
}
