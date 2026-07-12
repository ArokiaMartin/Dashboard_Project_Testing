import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-kpi-widget',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="kpi-widget">
      <div class="kpi-header">
        <h4>{{ title }}</h4>
        <div class="kpi-actions">
          <button class="icon-btn">⟳</button>
          <button class="icon-btn">⋮</button>
        </div>
      </div>
      <div class="kpi-content">
        <div class="kpi-value" [style.color]="color">{{ value | number }}</div>
        <div class="kpi-comparison" [ngClass]="isPositive ? 'positive' : 'negative'">
          <span class="arrow">{{ isPositive ? '▲' : '▼' }}</span>
          <span class="percentage">{{ Math.abs(change) }}%</span>
          <span class="period">vs last 30 days</span>
        </div>
        <p class="kpi-note">{{ note }}</p>
      </div>
    </div>
  `,
  styles: [`
    .kpi-widget {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 20px;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .kpi-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      border-bottom: 1px solid #f0f0f0;
      padding-bottom: 12px;
    }

    .kpi-header h4 {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .kpi-actions {
      display: flex;
      gap: 4px;
    }

    .icon-btn {
      background: none;
      border: none;
      color: #9ca3af;
      cursor: pointer;
      padding: 4px;
      font-size: 14px;
    }

    .kpi-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .kpi-value {
      font-size: 36px;
      font-weight: 700;
      margin: 0 0 12px 0;
      line-height: 1;
    }

    .kpi-comparison {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 12px;
    }

    .kpi-comparison.positive {
      color: #10b981;
    }

    .kpi-comparison.negative {
      color: #ef4444;
    }

    .arrow {
      font-size: 12px;
    }

    .percentage {
      font-weight: 600;
      font-size: 14px;
    }

    .period {
      font-size: 12px;
      color: #9ca3af;
      font-weight: 500;
    }

    .kpi-note {
      margin: 0;
      font-size: 12px;
      color: #9ca3af;
    }
  `]
})
export class KPIWidgetComponent {
  @Input() title: string = 'Metric';
  @Input() value: number = 0;
  @Input() change: number = 0;
  @Input() color: string = '#007bff';
  @Input() note: string = '';

  get isPositive(): boolean {
    return this.change >= 0;
  }

  Math = Math;
}
