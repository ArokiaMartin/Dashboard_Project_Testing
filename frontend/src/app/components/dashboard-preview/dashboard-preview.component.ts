import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KPIWidgetComponent } from '../widgets/kpi-widget.component';
import { BarChartWidgetComponent } from '../widgets/bar-chart-widget.component';
import { PieChartWidgetComponent } from '../widgets/pie-chart-widget.component';
import { LineChartWidgetComponent } from '../widgets/line-chart-widget.component';
import { TableWidgetComponent } from '../widgets/table-widget.component';

@Component({
  selector: 'app-dashboard-preview',
  standalone: true,
  imports: [
    CommonModule,
    KPIWidgetComponent,
    BarChartWidgetComponent,
    PieChartWidgetComponent,
    LineChartWidgetComponent,
    TableWidgetComponent
  ],
  template: `
    <div class="dashboard-preview-container">
      <div class="preview-header">
        <div class="header-left">
          <h2>Operations Overview</h2>
          <p>Real-time system metrics and analytics</p>
        </div>
        <div class="header-right">
          <button class="btn btn-ghost">Live View</button>
          <button class="btn btn-ghost">History</button>
          <button class="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Filters
          </button>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="kpi-grid">
        <app-kpi-widget
          title="Total Records"
          [value]="1284092"
          [change]="12.5"
          color="#007bff"
          note="vs last 30 days">
        </app-kpi-widget>
        <app-kpi-widget
          title="Critical Issues"
          [value]="42"
          [change]="-8.2"
          color="#ef4444"
          note="Requires immediate attention">
        </app-kpi-widget>
        <app-kpi-widget
          title="Open Issues"
          [value]="312"
          [change]="5.6"
          color="#f59e0b"
          note="Stable and monitoring">
        </app-kpi-widget>
        <app-kpi-widget
          title="Closed Today"
          [value]="89"
          [change]="23.4"
          color="#10b981"
          note="Productivity surge detected">
        </app-kpi-widget>
      </div>

      <!-- Charts Section -->
      <div class="charts-section">
        <div class="chart-row">
          <div class="chart-item large">
            <app-bar-chart-widget title="System Latency & Load"></app-bar-chart-widget>
          </div>
          <div class="chart-item">
            <app-pie-chart-widget title="Status Distribution"></app-pie-chart-widget>
          </div>
        </div>
        <div class="chart-row">
          <div class="chart-item full-width">
            <app-line-chart-widget title="Performance Trend (Last 30 Days)"></app-line-chart-widget>
          </div>
        </div>
      </div>

      <!-- Table Section -->
      <div class="table-section">
        <app-table-widget title="Recent Record Activity"></app-table-widget>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-preview-container {
      padding: 40px;
      background: #f8f9fa;
      min-height: 100vh;
    }

    .preview-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
    }

    .header-left h2 {
      font-size: 32px;
      font-weight: 700;
      margin: 0 0 8px 0;
      color: #111827;
    }

    .header-left p {
      margin: 0;
      color: #6b7280;
      font-size: 14px;
    }

    .header-right {
      display: flex;
      gap: 12px;
    }

    .btn {
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.25s ease;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .btn-ghost {
      background: white;
      color: #6b7280;
      border: 1px solid #e5e7eb;
    }

    .btn-ghost:hover {
      border-color: #007bff;
      color: #007bff;
    }

    .btn-primary {
      background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
      color: white;
    }

    .btn-primary:hover {
      transform: translateY(-1px);
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }

    .charts-section {
      display: flex;
      flex-direction: column;
      gap: 20px;
      margin-bottom: 40px;
    }

    .chart-row {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 20px;
    }

    .chart-row:last-child {
      grid-template-columns: 1fr;
    }

    .chart-item {
      background: white;
      border-radius: 10px;
      min-height: 400px;
    }

    .chart-item.large {
      grid-column: span 1;
    }

    .chart-item.full-width {
      grid-column: 1 / -1;
    }

    .table-section {
      background: white;
      border-radius: 10px;
      min-height: 450px;
    }

    @media (max-width: 1200px) {
      .kpi-grid {
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      }

      .chart-row {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 768px) {
      .dashboard-preview-container {
        padding: 20px;
      }

      .preview-header {
        flex-direction: column;
        gap: 20px;
      }

      .header-right {
        width: 100%;
        flex-wrap: wrap;
      }

      .kpi-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class DashboardPreviewComponent {}
