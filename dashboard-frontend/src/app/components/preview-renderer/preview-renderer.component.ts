import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  DashboardComponentConfig,
  Dataset,
  PreviewPayload,
  ValidationResult
} from '../../models/dashboard.models';
import { ChartRendererComponent } from '../renderers/chart-renderer/chart-renderer.component';
import { DataTableRendererComponent } from '../renderers/data-table-renderer/data-table-renderer.component';
import { KpiCardRendererComponent } from '../renderers/kpi-card-renderer/kpi-card-renderer.component';

@Component({
  selector: 'app-preview-renderer',
  standalone: true,
  imports: [CommonModule, ChartRendererComponent, DataTableRendererComponent, KpiCardRendererComponent],
  templateUrl: './preview-renderer.component.html',
  styleUrl: './preview-renderer.component.css'
})
export class PreviewRendererComponent {
  @Input() selectedDataset: Dataset | null = null;
  @Input() selectedComponent: DashboardComponentConfig | null = null;
  @Input() validationResult: ValidationResult = { isValid: false, messages: [] };
  @Input() payload: PreviewPayload | null = null;
}
