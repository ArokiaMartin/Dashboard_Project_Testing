import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { Widget, AggregatedData } from '../types/dashboard.types';
import { VisualizationService } from '../services/visualization.service';

@Component({
  selector: 'app-line-chart-widget',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './line-chart-widget.component.html',
  styleUrls: ['./line-chart-widget.component.scss'],
})
export class LineChartWidgetComponent implements OnInit, OnChanges {
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
    const yFields = config.measures || [config.yAxisField];

    if (!xField || yFields.length === 0) {
      console.error('Line chart requires xAxisField and at least one measure');
      return;
    }

    const chartData = this.visualizationService.prepareLineChartData(
      this.data,
      xField,
      yFields
    );

    this.chartData = {
      labels: chartData.labels,
      datasets: chartData.datasets,
    };

    this.chartOptions = this.visualizationService.getChartOptions('line', {
      title: this.widget.title,
    });
  }
}
