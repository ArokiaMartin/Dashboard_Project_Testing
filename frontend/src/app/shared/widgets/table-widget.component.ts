import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-table-widget',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="table-widget">
      <div class="table-header">
        <h4>{{ title }}</h4>
        <button class="dots"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th *ngFor="let col of columns">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of rows">
              <td *ngFor="let col of columns">
                <span [ngClass]="getStatusClass(row[col])">{{ row[col] }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="table-footer">
        <p class="footer-text">Showing 4 of {{ rows.length }} results</p>
        <div class="pagination-buttons">
          <button class="pag-btn">← Prev</button>
          <button class="pag-btn">Next →</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .table-widget {
      background: white;
      border: 1px solid #e8ebf2;
      border-radius: 14px;
      overflow: hidden;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .table-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 22px;
      border-bottom: 1px solid #eef1f6;
    }

    .table-header h4 {
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

    .table-container {
      flex: 1;
      overflow: auto;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .data-table th {
      background: #f9fafb;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #6b7280;
      border-bottom: 1px solid #e5e7eb;
      white-space: nowrap;
    }

    .data-table td {
      padding: 12px;
      border-bottom: 1px solid #f0f0f0;
    }

    .table-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 20px;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .footer-text {
      margin: 0;
      font-size: 12px;
      color: #9ca3af;
    }

    .pagination-buttons {
      display: flex;
      gap: 4px;
    }

    .pag-btn {
      background: none;
      border: 1px solid #e5e7eb;
      color: #007bff;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .pag-btn:hover {
      border-color: #007bff;
      background: #f0f7ff;
    }

    .status-stable {
      color: #10b981;
      font-weight: 600;
    }

    .status-critical {
      color: #ef4444;
      font-weight: 600;
    }

    .status-strong {
      color: #ef4444;
      font-weight: 600;
    }
  `]
})
export class TableWidgetComponent {
  @Input() title: string = 'Recent Records';
  @Input() columns: string[] = ['ID', 'Module', 'Status', 'Latency', 'Timestamp'];
  @Input() rows: any[] = [
    { 'ID': 'IN-3281-X', 'Module': 'Core Storage Engine', 'Status': 'stable', 'Latency': '127ms', 'Timestamp': '2 mins ago' },
    { 'ID': 'IN-3282-Y', 'Module': 'Auth Provider Service', 'Status': 'critical', 'Latency': '842ms', 'Timestamp': '5 mins ago' },
    { 'ID': 'IN-3283-A', 'Module': 'Analytics Buffer', 'Status': 'stable', 'Latency': '43ms', 'Timestamp': '12 mins ago' },
    { 'ID': 'IN-3284-B', 'Module': 'API Gateway Hub', 'Status': 'stable', 'Latency': '8ms', 'Timestamp': '15 mins ago' }
  ];

  getStatusClass(value: string): string {
    const lower = value.toLowerCase();
    if (lower === 'stable') return 'status-stable';
    if (lower === 'critical') return 'status-critical';
    if (lower === 'strong') return 'status-strong';
    return '';
  }
}
