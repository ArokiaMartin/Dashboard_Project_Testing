import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { Widget, AggregatedData } from '@shared/types/dashboard.types';
import { VisualizationService } from '@core/services/visualization.service';

@Component({
  selector: 'app-pie-chart-widget',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './pie-chart-widget.component.html',
  styleUrls: ['./pie-chart-widget.component.scss'],
})
export class PieChartWidgetComponent implements OnInit, OnChanges {
  @Input() widget!: Widget;
  @Input() data!: AggregatedData;

  chartData: any = null;
  chartOptions: any = {};
  isLoading = false;

  constructor(private visualizationService: VisualizationService) {}

  ngOnInit(): void {
    this.prepareChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] || changes['widget']) {
      this.prepareChart();
    }
  }

  prepareChart(): void {
    if (!this.data || !this.widget) return;

    const config = this.widget.config as any;
    const labelField = config.dimensions?.[0] || config.xAxisField;
    const valueField = config.measures?.[0] || config.yAxisField;

    if (!labelField || !valueField) {
      console.error('Pie chart requires a dimension and a measure');
      return;
    }

    const chartData = this.visualizationService.preparePieChartData(
      this.data,
      labelField,
      valueField
    );

    this.chartData = {
      labels: chartData.labels,
      datasets: chartData.datasets,
    };

    this.chartOptions = this.visualizationService.getChartOptions('pie', {
      title: this.widget.title,
    });
  }
}
