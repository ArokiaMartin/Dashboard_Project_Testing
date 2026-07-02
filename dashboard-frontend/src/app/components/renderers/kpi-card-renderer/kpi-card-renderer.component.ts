import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { KpiAggregation } from '../../../models/dashboard.models';

@Component({
  selector: 'app-kpi-card-renderer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kpi-card-renderer.component.html',
  styleUrl: './kpi-card-renderer.component.css'
})
export class KpiCardRendererComponent {
  @Input() value = 0;
  @Input() aggregation: KpiAggregation = 'COUNT';
  @Input() metricLabel = 'Metric';
}
