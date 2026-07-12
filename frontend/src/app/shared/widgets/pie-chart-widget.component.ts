import { Component, Input, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-pie-chart-widget',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart-widget">
      <div class="chart-header">
        <h4>{{ title }}</h4>
        <button class="dots"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>
      </div>
      <div class="chart-container pie-container">
        <canvas #canvas></canvas>
      </div>
      <div class="chart-legend">
        <div class="legend-item">
          <span class="dot success"></span>
          <span>Success (85%)</span>
        </div>
        <div class="legend-item">
          <span class="dot warning"></span>
          <span>Pending (10%)</span>
        </div>
        <div class="legend-item">
          <span class="dot danger"></span>
          <span>Failed (5%)</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .chart-widget {
      background: white;
      border: 1px solid #e8ebf2;
      border-radius: 14px;
      padding: 22px;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 18px;
    }

    .chart-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
    }

    .dots {
      background: none;
      border: none;
      color: #cbd5e1;
      cursor: pointer;
      padding: 4px;
      display: flex;
    }
    .dots:hover { color: #64748b; }

    .pie-container {
      flex: 1;
      position: relative;
      min-height: 250px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .chart-container {
      flex: 1;
      position: relative;
    }

    canvas {
      max-height: 250px;
    }

    .chart-legend {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid #f0f0f0;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #6b7280;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .dot.success { background: #10b981; }
    .dot.warning { background: #f59e0b; }
    .dot.danger { background: #ef4444; }
  `]
})
export class PieChartWidgetComponent implements OnInit {
  @Input() title: string = 'Pie Chart';
  @Input() data: any = null;
  @ViewChild('canvas') canvas!: ElementRef;
  chart: any;

  ngOnInit() {
    setTimeout(() => this.initChart(), 100);
  }

  initChart() {
    const ctx = (this.canvas.nativeElement as HTMLCanvasElement).getContext('2d');
    if (!ctx) return;

    this.chart = new Chart(ctx, {
      type: 'doughnut',
      data: this.data || {
        labels: ['Success', 'Pending', 'Failed'],
        datasets: [{
          data: [1020, 120, 60],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderColor: 'white',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
  }
}
