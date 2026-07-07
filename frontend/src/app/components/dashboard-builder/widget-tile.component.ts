import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export interface Series { label: string; data: number[]; }

export interface WidgetSpec {
  id: number;
  viz: string;
  title: string;
  chartType: 'bar' | 'line' | 'doughnut' | 'pie' | 'radar' | 'polarArea' | 'scatter' | null;
  labels: string[];
  datasets: Series[];
  points?: { x: number; y: number }[];
  primary: string;
  fill: boolean;
  multiColor: boolean;
  radial: boolean;
  indexAxis: 'x' | 'y';
  showLegend: boolean;
  legendPosition?: 'bottom' | 'right' | 'top';
  stacked?: boolean;
  kpiTotal?: number;
  kpiLabel?: string;
  tableColumns?: string[];
  tableRows?: (string | number)[][];
  databaseConfig?: Record<string, unknown>;
}

const PALETTE = ['#2563eb', '#60a5fa', '#93c5fd', '#1e40af', '#64748b', '#cbd5e1'];

@Component({
  selector: 'app-widget-tile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tile">
      <div class="tile-head">
        <span class="tile-title">{{ spec.title }}</span>
        <button class="tile-remove" (click)="remove.emit()" title="Remove widget">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="tile-body">
        <div class="tile-chart" *ngIf="spec.chartType"><canvas #cv></canvas></div>

        <div class="tile-kpi" *ngIf="spec.viz === 'kpi'">
          <div class="tk-num">{{ spec.kpiTotal | number }}</div>
          <div class="tk-cap">Total {{ spec.kpiLabel }}</div>
          <div class="tk-trend"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> +12.5%</div>
        </div>

        <div class="tile-table" *ngIf="spec.viz === 'table'">
          <table>
            <thead><tr><th *ngFor="let c of spec.tableColumns">{{ c }}</th></tr></thead>
            <tbody>
              <tr *ngFor="let r of spec.tableRows"><td *ngFor="let cell of r">{{ cell }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .tile { background: white; border: 1px solid #e8ebf2; border-radius: 12px; padding: 16px; height: 260px; display: flex; flex-direction: column; }
    .tile-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .tile-title { font-size: 13px; font-weight: 700; color: #0f172a; }
    .tile-remove { width: 26px; height: 26px; border: none; background: none; color: #cbd5e1; border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .tile-remove:hover { background: #fef2f2; color: #ef4444; }
    .tile-body { flex: 1; min-height: 0; position: relative; }
    .tile-chart { position: absolute; inset: 0; }
    .tile-kpi { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .tk-num { font-size: 40px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    .tk-cap { font-size: 12px; color: #94a3b8; text-transform: capitalize; margin-top: 2px; }
    .tk-trend { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: #059669; margin-top: 10px; }
    .tile-table { height: 100%; overflow: auto; }
    .tile-table table { width: 100%; border-collapse: collapse; }
    .tile-table th { text-align: left; padding: 7px 10px; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; border-bottom: 1px solid #eef1f6; position: sticky; top: 0; background: white; }
    .tile-table td { padding: 7px 10px; font-size: 12px; color: #334155; border-bottom: 1px solid #f4f6fb; white-space: nowrap; }
  `]
})
export class WidgetTileComponent implements AfterViewInit, OnDestroy {
  @Input() spec!: WidgetSpec;
  @Output() remove = new EventEmitter<void>();
  @ViewChild('cv') canvas?: ElementRef<HTMLCanvasElement>;
  private chart?: Chart;

  ngAfterViewInit() { setTimeout(() => this.render(), 0); }
  ngOnDestroy() { this.chart?.destroy(); }

  private render() {
    if (!this.spec.chartType || !this.canvas) return;
    this.chart = new Chart(this.canvas.nativeElement.getContext('2d')!, buildChartConfig(this.spec, true));
  }
}

/** Builds a colour sequence that always starts with the user's chosen primary colour. */
function paletteFrom(primary: string): string[] {
  const rest = PALETTE.filter(c => c.toLowerCase() !== primary.toLowerCase());
  return [primary, ...rest];
}

/** Shared Chart.js config builder — used by tiles and the builder preview. */
export function buildChartConfig(s: WidgetSpec, compact: boolean): any {
  const fontSize = compact ? 10 : 11;
  const pointSize = compact ? 3 : 4;
  const colors = paletteFrom(s.primary);
  let data: any;

  if (s.chartType === 'scatter') {
    data = { datasets: [{ label: s.datasets[0]?.label ?? '', data: s.points ?? [], backgroundColor: s.primary, pointRadius: pointSize + 2 }] };
  } else if (s.multiColor) {
    // pie / doughnut / polar — one series, many colours
    data = { labels: s.labels, datasets: [{ data: s.datasets[0]?.data ?? [], backgroundColor: colors, borderColor: '#fff', borderWidth: 2 }] };
  } else {
    // bar / line / area / radar — one dataset per measure
    data = {
      labels: s.labels,
      datasets: s.datasets.map((d, i) => {
        const c = colors[i % colors.length];
        return {
          label: d.label,
          data: d.data,
          backgroundColor: s.fill ? c + '22' : c,
          borderColor: c,
          borderWidth: (s.chartType === 'line' || s.chartType === 'radar') ? 2.5 : 0,
          fill: s.fill,
          tension: 0.4,
          pointRadius: (s.chartType === 'line' || s.chartType === 'radar') ? pointSize : 0,
          borderRadius: s.chartType === 'bar' ? (compact ? 5 : 6) : 0
        };
      })
    };
  }

  const showLegend = s.multiColor || s.datasets.length > 1;
  const cartesian = s.chartType === 'bar' || s.chartType === 'line';

  return {
    type: s.chartType,
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: s.indexAxis,
      plugins: {
        legend: { display: showLegend, position: s.legendPosition || 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: fontSize } } }
      },
      scales: s.chartType === 'scatter'
        ? { x: { type: 'linear', position: 'bottom', grid: { color: '#f1f5f9' }, ticks: { font: { size: fontSize }, color: '#94a3b8' } }, y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: fontSize }, color: '#94a3b8' } } }
        : cartesian
          ? { y: { beginAtZero: true, stacked: !!s.stacked, grid: { color: '#f1f5f9' }, ticks: { font: { size: fontSize }, color: '#94a3b8' } }, x: { stacked: !!s.stacked, grid: { display: false }, ticks: { font: { size: fontSize }, color: '#94a3b8' } } }
          : {}
    }
  };
}
