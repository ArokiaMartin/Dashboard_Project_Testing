import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartType } from '@shared/types/dashboard.types';

interface ChartOption {
  type: ChartType;
  label: string;
  description: string;
  icon: string;
}

@Component({
  selector: 'app-chart-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chart-selector.component.html',
  styleUrls: ['./chart-selector.component.scss'],
})
export class ChartSelectorComponent {
  @Output() chartSelected = new EventEmitter<ChartType>();

  selectedChart: ChartType | null = null;

  chartOptions: ChartOption[] = [
    {
      type: 'bar',
      label: 'Bar Chart',
      description: 'Ideal for comparing values across categories',
      icon: 'bi-bar-chart',
    },
    {
      type: 'line',
      label: 'Line Chart',
      description: 'Perfect for showing trends over time',
      icon: 'bi-graph-up',
    },
    {
      type: 'pie',
      label: 'Pie Chart',
      description: 'Great for showing proportions and percentages',
      icon: 'bi-pie-chart',
    },
    {
      type: 'table',
      label: 'Table',
      description: 'Display detailed data in tabular format',
      icon: 'bi-table',
    },
    {
      type: 'kpi',
      label: 'KPI Card',
      description: 'Highlight key performance indicators',
      icon: 'bi-speedometer2',
    },
  ];

  selectChart(chartType: ChartType): void {
    this.selectedChart = chartType;
    this.chartSelected.emit(chartType);
  }

  isSelected(chartType: ChartType): boolean {
    return this.selectedChart === chartType;
  }
}
