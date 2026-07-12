import { Component, Input, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-line-chart-widget',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart-widget">
      <div class="chart-header">
        <h4>{{ title }}</h4>
        <button class="dots"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>
      </div>
      <div class="chart-container">
        <canvas #canvas></canvas>
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

    .chart-container {
      flex: 1;
      position: relative;
      min-height: 300px;
    }

    canvas {
      max-height: 300px;
    }
  `]
})
export class LineChartWidgetComponent implements OnInit {
  @Input() title: string = 'Line Chart';
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
      type: 'line',
      data: this.data || {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
        datasets: [{
          label: 'Trend',
          data: [30, 45, 35, 50, 65, 55, 70, 85, 95],
          borderColor: '#007bff',
          backgroundColor: 'rgba(0, 123, 255, 0.05)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#007bff',
          pointBorderColor: 'white',
          pointBorderWidth: 2,
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: 100, grid: { color: '#f0f0f0' } },
          x: { grid: { display: false } }
        }
      }
    });
  }
}
