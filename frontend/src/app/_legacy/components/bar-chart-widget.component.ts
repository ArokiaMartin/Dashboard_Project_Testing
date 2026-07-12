import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { Widget, AggregatedData } from '@shared/types/dashboard.types';
import { VisualizationService } from '@core/services/visualization.service';

@Component({
  selector: 'app-bar-chart-widget',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './bar-chart-widget.component.html',
  styleUrls: ['./bar-chart-widget.component.scss'],
})
export class BarChartWidgetComponent implements OnInit, OnChanges {
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
    const xField = config.xAxisField;
    const yField = config.yAxisField;

    if (!xField || !yField) {
      console.error('Bar chart requires xAxisField and yAxisField');
      return;
    }

    const chartData = this.visualizationService.prepareBarChartData(
      this.data,
      xField,
      yField
    );

    this.chartData = {
      labels: chartData.labels,
      datasets: chartData.datasets,
    };

    this.chartOptions = this.visualizationService.getChartOptions('bar', {
      title: this.widget.title,
    });
  }
}
