import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Dashboard, Widget } from '../types/dashboard.types';
import { DashboardService } from '../services/dashboard.service';
import { BarChartWidgetComponent } from './bar-chart-widget.component';
import { LineChartWidgetComponent } from './line-chart-widget.component';
import { PieChartWidgetComponent } from './pie-chart-widget.component';
import { TableWidgetComponent } from './table-widget.component';
import { KPIWidgetComponent } from './kpi-widget.component';

@Component({
  selector: 'app-dashboard-renderer',
  standalone: true,
  imports: [
    CommonModule,
    BarChartWidgetComponent,
    LineChartWidgetComponent,
    PieChartWidgetComponent,
    TableWidgetComponent,
    KPIWidgetComponent,
  ],
  templateUrl: './dashboard-renderer.component.html',
  styleUrls: ['./dashboard-renderer.component.scss'],
})
export class DashboardRendererComponent implements OnInit {
  @Input() dashboard!: Dashboard;

  isLoading = false;
  widgetDataMap: Map<string, any> = new Map();

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    if (this.dashboard) {
      this.loadWidgetData();
    }
  }

  loadWidgetData(): void {
    this.isLoading = true;
    this.dashboard.widgets.forEach((widget) => {
      this.loadWidgetData$(widget);
    });
  }

  private loadWidgetData$(widget: Widget): void {
    const config = widget.config as any;

    switch (widget.type) {
      case 'chart':
        this.loadChartData(widget);
        break;
      case 'kpi':
        this.loadKPIData(widget);
        break;
      case 'table':
        this.loadTableData(widget);
        break;
    }
  }

  private loadChartData(widget: Widget): void {
    const config = widget.config as any;
    const tableName = this.dashboard.schema.name;

    const groupBy = config.dimensions || [config.xAxisField];
    const aggregations = (config.measures || [config.yAxisField]).map((m: string) => ({
      field: m,
      operation: 'sum',
    }));

    this.dashboardService
      .getAggregatedData(tableName, groupBy, aggregations)
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.widgetDataMap.set(widget.id, response.data);
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error(`Error loading data for widget ${widget.id}:`, error);
          this.isLoading = false;
        },
      });
  }

  private loadKPIData(widget: Widget): void {
    const config = widget.config as any;
    const tableName = this.dashboard.schema.name;

    this.dashboardService
      .getKPIData(tableName, config.metric, config.aggregation, config.filters)
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.widgetDataMap.set(widget.id, response.data);
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error(`Error loading KPI data for widget ${widget.id}:`, error);
          this.isLoading = false;
        },
      });
  }

  private loadTableData(widget: Widget): void {
    const config = widget.config as any;
    const tableName = this.dashboard.schema.name;

    this.dashboardService
      .getTableData(tableName, 1, config.pageSize || 20, null, config.filters)
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.widgetDataMap.set(widget.id, response.data);
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error(`Error loading table data for widget ${widget.id}:`, error);
          this.isLoading = false;
        },
      });
  }

  getWidgetData(widgetId: string): any {
    return this.widgetDataMap.get(widgetId);
  }

  getGridClass(widget: Widget): string {
    const layout = widget.layout;
    if (!layout) {
      return 'col-md-6 mb-3';
    }
    // Map width to Bootstrap grid
    if (layout.width >= 12) {
      return 'col-12 mb-3';
    }
    if (layout.width >= 6) {
      return 'col-lg-6 mb-3';
    }
    return 'col-lg-4 mb-3';
  }

  refreshDashboard(): void {
    this.widgetDataMap.clear();
    this.loadWidgetData();
  }

  exportDashboard(): void {
    this.dashboardService.exportDashboard(this.dashboard.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.dashboard.name}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        console.error('Error exporting dashboard:', error);
      },
    });
  }
}
