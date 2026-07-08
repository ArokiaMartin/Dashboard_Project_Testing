import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Widget, KPIConfig } from '../types/dashboard.types';
import { VisualizationService } from '../services/visualization.service';

@Component({
  selector: 'app-kpi-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kpi-widget.component.html',
  styleUrls: ['./kpi-widget.component.scss'],
})
export class KPIWidgetComponent implements OnInit, OnChanges {
  @Input() widget!: Widget;
  @Input() data!: any;
  @Input() comparisonData?: any;

  value: number | null = null;
  comparisonValue: number | null = null;
  percentageChange: number | null = null;
  isLoading = false;
  isPositive = false;
  trend: 'up' | 'down' | 'neutral' = 'neutral';

  constructor(private visualizationService: VisualizationService) {}

  ngOnInit(): void {
    this.processData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] || changes['comparisonData'] || changes['widget']) {
      this.processData();
    }
  }

  processData(): void {
    if (!this.data) return;

    const config = this.widget?.config as KPIConfig;

    // Extract value
    if (Array.isArray(this.data) && this.data.length > 0) {
      const firstRow = this.data[0];
      this.value = firstRow[config.metric] ?? null;
    } else if (typeof this.data === 'object' && this.data[config.metric]) {
      this.value = this.data[config.metric];
    } else if (this.data.data && Array.isArray(this.data.data)) {
      const firstRow = this.data.data[0];
      this.value = firstRow[config.metric] ?? null;
    }

    // Calculate comparison if available
    if (this.comparisonData && config.comparison?.enabled) {
      if (Array.isArray(this.comparisonData) && this.comparisonData.length > 0) {
        this.comparisonValue = this.comparisonData[0][config.metric] ?? null;
      } else if (typeof this.comparisonData === 'object') {
        this.comparisonValue = this.comparisonData[config.metric] ?? null;
      }

      if (this.value !== null && this.comparisonValue !== null) {
        this.percentageChange =
          ((this.value - this.comparisonValue) / this.comparisonValue) * 100;
        this.isPositive = this.percentageChange >= 0;
        this.trend = this.percentageChange > 0 ? 'up' : this.percentageChange < 0 ? 'down' : 'neutral';
      }
    }
  }

  formatValue(value: number | null): string {
    if (value === null) return '-';
    // Try to format as currency or number based on widget config
    const config = this.widget?.config as any;
    if (config.format === 'currency') {
      return this.visualizationService.formatCurrency(value);
    } else if (config.format === 'percentage') {
      return this.visualizationService.formatPercentage(value);
    }
    return this.visualizationService.formatNumber(value);
  }

  formatPercentageChange(value: number | null): string {
    if (value === null) return '-';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }

  getTrendIcon(): string {
    switch (this.trend) {
      case 'up':
        return 'bi-arrow-up-right';
      case 'down':
        return 'bi-arrow-down-left';
      default:
        return 'bi-dash';
    }
  }

  getTrendClass(): string {
    switch (this.trend) {
      case 'up':
        return 'text-success';
      case 'down':
        return 'text-danger';
      default:
        return 'text-secondary';
    }
  }
}
