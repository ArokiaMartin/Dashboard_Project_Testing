import { Component, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Chart, registerables } from 'chart.js';
import { WidgetTileComponent, WidgetSpec } from './widget-tile.component';

Chart.register(...registerables);

interface Field { name: string; role: 'dimension' | 'measure'; icon: string; }
interface VizType { key: string; label: string; desc: string; icon: string; iconSafe?: SafeHtml; }
interface Slot { key: string; label: string; role: 'dimension' | 'measure'; }
interface ChartMeta { t: 'bar' | 'line' | 'doughnut' | 'pie' | 'radar' | 'polarArea'; axis: 'x' | 'y'; fill: boolean; multi: boolean; radial: boolean; legend: boolean; }

@Component({
  selector: 'app-dashboard-builder',
  standalone: true,
  imports: [CommonModule, RouterLink, WidgetTileComponent],
  template: `
    <div class="builder" [class.dragging]="dragging">
      <!-- Toolbar -->
      <div class="toolbar">
        <div class="tb-left">
          <button class="add-widget" (click)="addWidget()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Widget
          </button>
          <div class="divider"></div>
          <button class="tb-icon" title="Undo"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg></button>
          <button class="tb-icon" title="Redo"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg></button>
          <div class="divider"></div>
          <button class="view-data" routerLink="/data">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3z"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            View Uploaded Data
          </button>
        </div>
        <div class="tb-right">
          <button class="tb-text" routerLink="/preview">Preview</button>
          <button class="tb-save">Save</button>
        </div>
      </div>

      <div class="body">
        <!-- LEFT: vertical visualization list -->
        <aside class="viz-rail" [style.width.px]="railWidth" [class.mini]="railWidth < 140">
          <div class="rail-head">VISUALIZATIONS</div>
          <button class="rail-item" *ngFor="let v of vizTypes"
                  [class.active]="v.key === selectedViz" (click)="selectViz(v.key)">
            <span class="rail-ic" [innerHTML]="v.iconSafe"></span>
            <span class="rail-text">
              <span class="rail-label">{{ v.label }}</span>
              <span class="rail-desc">{{ v.desc }}</span>
            </span>
          </button>
        </aside>
        <div class="rail-resizer" (mousedown)="startDrag($event)" (dblclick)="toggleRail()" title="Drag to resize · double-click to toggle">
          <span class="grip"></span>
        </div>

        <!-- CENTER -->
        <section class="center">
          <!-- Committed widgets canvas -->
          <div class="canvas-grid" *ngIf="committedWidgets.length">
            <app-widget-tile *ngFor="let w of committedWidgets; trackBy: trackWidget" [spec]="w" (remove)="removeWidget(w.id)"></app-widget-tile>
          </div>
          <div class="canvas-divider" *ngIf="committedWidgets.length">
            <span>{{ committedWidgets.length }} widget{{ committedWidgets.length > 1 ? 's' : '' }} on canvas — build another below</span>
          </div>

          <!-- Stepper -->
          <div class="stepper">
            <div class="stp" [class.active]="!selectedViz" [class.done]="!!selectedViz"><span class="stp-num">1</span> Choose Visualization</div>
            <div class="stp-line" [class.done]="!!selectedViz"></div>
            <div class="stp" [class.active]="!!selectedViz && !isConfigured()" [class.done]="isConfigured()"><span class="stp-num">2</span> Select Columns</div>
            <div class="stp-line" [class.done]="isConfigured()"></div>
            <div class="stp" [class.active]="isConfigured()"><span class="stp-num">3</span> Preview</div>
          </div>

          <!-- Empty prompt -->
          <div class="step-panel prompt" *ngIf="!selectedViz">
            <div class="empty">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 0 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              <h2>Pick a visualization</h2>
              <p>Choose a chart type from the list on the left to start building your widget.</p>
            </div>
          </div>

          <!-- Configure + preview -->
          <div class="step-panel" *ngIf="selectedViz">
            <div class="chosen">
              <div class="chosen-left">
                <span class="chosen-ic" [innerHTML]="vizIconSafe()"></span>
                <div>
                  <span class="chosen-label">{{ vizLabel() }}</span>
                  <span class="chosen-hint" *ngIf="!isConfigured()">Now select the columns below</span>
                  <span class="chosen-hint live" *ngIf="isConfigured()">● Live preview ready</span>
                </div>
              </div>
              <button class="change-btn" (click)="startOver()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                Clear
              </button>
            </div>

            <div class="cols">
              <div class="col-field" *ngFor="let s of currentSlots()">
                <label>{{ s.label }} <span class="req">*</span></label>
                <button class="col-btn" [class.filled]="config[s.key]" (click)="toggleSlot(s.key)">
                  <span *ngIf="config[s.key]" class="col-val">
                    <span class="ftype sm" [ngClass]="s.role">{{ roleIcon(s.role, config[s.key]!) }}</span>
                    {{ config[s.key] }}
                  </span>
                  <span *ngIf="!config[s.key]" class="col-ph">Select {{ s.role }}…</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="dropdown" *ngIf="openSlot === s.key">
                  <div class="dd-label">{{ s.role === 'dimension' ? 'DIMENSIONS' : 'MEASURES' }}</div>
                  <button class="dd-item" *ngFor="let f of fieldsForRole(s.role)" (click)="pickField(s.key, f.name)">
                    <span class="ftype sm" [ngClass]="f.role">{{ f.icon }}</span>
                    {{ f.name }}
                    <svg *ngIf="config[s.key] === f.name" class="dd-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                </div>
              </div>
            </div>

            <div class="preview">
              <div class="ph" *ngIf="!isConfigured()">
                <span class="ph-ic" [innerHTML]="vizIconSafe()"></span>
                <p>Select <b>{{ missingSlotLabels() }}</b> to render your {{ vizLabel().toLowerCase() }}</p>
              </div>
              <div class="chart-wrap" *ngIf="isConfigured() && isChartViz()">
                <canvas #previewCanvas></canvas>
              </div>
              <div class="kpi-preview" *ngIf="isConfigured() && selectedViz === 'kpi'">
                <div class="kpi-big">{{ previewKpi | number }}</div>
                <div class="kpi-cap">Total {{ config['metric'] }}</div>
                <div class="kpi-trend"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> +12.5% vs last week</div>
              </div>
              <div class="table-preview" *ngIf="isConfigured() && selectedViz === 'table'">
                <table>
                  <thead><tr><th>{{ config['group'] }}</th><th>blockers</th><th>severe</th><th>costUsd</th></tr></thead>
                  <tbody>
                    <tr *ngFor="let row of previewTable; trackBy: trackRow">
                      <td>{{ row.label }}</td><td>{{ row.a }}</td><td>{{ row.b }}</td><td>\${{ row.c | number }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <!-- RIGHT: style options -->
        <aside class="right">
          <div class="right-head">Style Options</div>
          <div *ngIf="!selectedViz" class="right-hint">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2a10 10 0 0 0 0 20 3 3 0 0 0 0-6 2 2 0 0 1 0-4 3 3 0 0 0 0-6z"/></svg>
            <p>Pick a visualization to see color & legend options.</p>
          </div>
          <div *ngIf="selectedViz">
            <div class="section-title">COLOR PALETTE</div>
            <div class="palette">
              <span class="sw" *ngFor="let c of palette; let i = index" [style.background]="c" [class.sel]="i === selPalette" (click)="setPalette(i)"></span>
            </div>
            <div class="section-title">LEGEND POSITION</div>
            <div class="legend-seg">
              <button *ngFor="let p of ['Bottom','Right','Top']" [class.active]="p === legendPos" (click)="setLegend(p)">{{ p }}</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  `,
  styles: [`
    .builder { display: flex; flex-direction: column; height: 100%; background: #f4f6fb; }
    .toolbar { height: 56px; background: white; border-bottom: 1px solid #e8ebf2; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0; }
    .tb-left { display: flex; align-items: center; gap: 6px; }
    .add-widget { display: inline-flex; align-items: center; gap: 7px; background: #2563eb; color: white; border: none; padding: 8px 15px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .add-widget:hover { background: #1d4ed8; }
    .divider { width: 1px; height: 24px; background: #e2e8f0; margin: 0 8px; }
    .tb-icon { width: 34px; height: 34px; border: none; background: none; border-radius: 8px; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .tb-icon:hover { background: #f1f5f9; color: #2563eb; }
    .view-data { display: inline-flex; align-items: center; gap: 7px; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 8px 14px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .view-data:hover { background: #dbeafe; }
    .tb-right { display: flex; align-items: center; gap: 10px; }
    .tb-text { background: none; border: none; color: #475569; font-size: 13px; font-weight: 600; cursor: pointer; padding: 8px 12px; }
    .tb-text:hover { color: #2563eb; }
    .tb-save { background: white; border: 1px solid #2563eb; color: #2563eb; padding: 8px 20px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .tb-save:hover { background: #eff6ff; }

    .body { flex: 1; display: flex; min-height: 0; }

    .builder.dragging { user-select: none; cursor: col-resize; }

    /* Left vertical viz rail */
    .viz-rail { background: white; border-right: 1px solid #e8ebf2; padding: 16px 12px; overflow-y: auto; flex-shrink: 0; }
    .rail-resizer { width: 7px; flex-shrink: 0; cursor: col-resize; background: transparent; display: flex; align-items: center; justify-content: center; transition: background 0.15s ease; }
    .rail-resizer:hover, .builder.dragging .rail-resizer { background: #e8ebf2; }
    .rail-resizer .grip { width: 2px; height: 32px; background: #cbd5e1; border-radius: 2px; }
    .rail-resizer:hover .grip { background: #2563eb; }

    /* mini (collapsed) rail — icons only */
    .viz-rail.mini { padding: 16px 8px; }
    .viz-rail.mini .rail-head { height: 0; overflow: hidden; padding: 0 0 10px; }
    .viz-rail.mini .rail-text { display: none; }
    .viz-rail.mini .rail-item { justify-content: center; padding: 10px 0; gap: 0; }
    .rail-head { font-size: 10.5px; font-weight: 700; color: #94a3b8; letter-spacing: 0.6px; padding: 6px 10px 12px; }
    .rail-item { width: 100%; display: flex; align-items: center; gap: 12px; padding: 11px 12px; background: white; border: 1.5px solid transparent; border-radius: 11px; cursor: pointer; text-align: left; margin-bottom: 4px; transition: all 0.15s ease; }
    .rail-item:hover { background: #f8fafc; }
    .rail-item.active { border-color: #2563eb; background: #eff6ff; }
    .rail-ic { width: 34px; height: 34px; border-radius: 9px; background: #f1f5f9; color: #64748b; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .rail-ic svg { width: 18px; height: 18px; }
    .rail-item.active .rail-ic { background: #dbeafe; color: #2563eb; }
    .rail-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .rail-label { font-size: 13px; font-weight: 700; color: #0f172a; }
    .rail-desc { font-size: 11px; color: #94a3b8; }
    .rail-item.active .rail-label { color: #2563eb; }

    .center { flex: 1; padding: 24px; overflow-y: auto; }

    .canvas-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; }
    .canvas-divider { display: flex; align-items: center; gap: 12px; margin: 8px 0 20px; font-size: 12px; color: #94a3b8; font-weight: 600; }
    .canvas-divider::before, .canvas-divider::after { content: ''; flex: 1; height: 1px; background: #e8ebf2; }

    .stepper { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    .stp { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #94a3b8; }
    .stp-num { width: 24px; height: 24px; border-radius: 50%; background: #e2e8f0; color: #94a3b8; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
    .stp.active { color: #2563eb; } .stp.active .stp-num { background: #2563eb; color: white; }
    .stp.done { color: #059669; } .stp.done .stp-num { background: #059669; color: white; }
    .stp-line { flex: 1; height: 2px; background: #e2e8f0; max-width: 60px; }
    .stp-line.done { background: #059669; }

    .step-panel { background: white; border: 1px solid #e8ebf2; border-radius: 14px; padding: 26px; }
    .step-panel.prompt { display: flex; align-items: center; justify-content: center; min-height: 340px; }
    .empty { text-align: center; max-width: 340px; }
    .empty svg { margin-bottom: 14px; }
    .empty h2 { margin: 0 0 6px; font-size: 20px; font-weight: 800; color: #0f172a; }
    .empty p { margin: 0; font-size: 14px; color: #94a3b8; line-height: 1.5; }

    .chosen { display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; margin-bottom: 20px; border-bottom: 1px solid #eef1f6; }
    .chosen-left { display: flex; align-items: center; gap: 12px; }
    .chosen-ic { width: 42px; height: 42px; border-radius: 10px; background: #eff6ff; color: #2563eb; display: flex; align-items: center; justify-content: center; }
    .chosen-ic svg { width: 22px; height: 22px; }
    .chosen-label { display: block; font-size: 15px; font-weight: 700; color: #0f172a; }
    .chosen-hint { font-size: 12px; color: #94a3b8; }
    .chosen-hint.live { color: #059669; font-weight: 600; }
    .change-btn { display: inline-flex; align-items: center; gap: 6px; background: white; border: 1px solid #e2e8f0; color: #475569; padding: 8px 14px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .change-btn:hover { border-color: #2563eb; color: #2563eb; }

    .cols { display: flex; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
    .col-field { flex: 1; min-width: 200px; position: relative; }
    .col-field label { display: block; font-size: 11px; font-weight: 700; color: #64748b; letter-spacing: 0.3px; margin-bottom: 7px; }
    .req { color: #ef4444; }
    .col-btn { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; background: white; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 11px 13px; font-size: 13px; cursor: pointer; transition: all 0.15s ease; }
    .col-btn:hover { border-color: #93c5fd; }
    .col-btn.filled { border-color: #2563eb; background: #f8fbff; }
    .col-val { display: flex; align-items: center; gap: 8px; color: #0f172a; font-weight: 600; }
    .col-ph { color: #94a3b8; text-transform: capitalize; }
    .dropdown { position: absolute; top: 100%; left: 0; right: 0; margin-top: 6px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; box-shadow: 0 12px 30px rgba(15,23,42,0.14); padding: 8px; z-index: 30; max-height: 240px; overflow-y: auto; }
    .dd-label { font-size: 10px; font-weight: 700; color: #94a3b8; letter-spacing: 0.4px; padding: 6px 8px; }
    .dd-item { width: 100%; display: flex; align-items: center; gap: 9px; padding: 9px 8px; background: none; border: none; border-radius: 7px; font-size: 13px; color: #334155; cursor: pointer; text-align: left; }
    .dd-item:hover { background: #f4f6fb; }
    .dd-check { margin-left: auto; }
    .ftype { width: 18px; height: 18px; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; }
    .ftype.sm { width: 16px; height: 16px; font-size: 9px; }
    .ftype.measure { background: #dbeafe; color: #2563eb; }
    .ftype.dimension { background: #f1f5f9; color: #64748b; }

    .preview { border: 1px solid #eef1f6; border-radius: 10px; background: #fbfcfe; min-height: 320px; display: flex; align-items: center; justify-content: center; padding: 18px; }
    .ph { text-align: center; color: #94a3b8; }
    .ph-ic { display: block; margin-bottom: 12px; color: #cbd5e1; }
    .ph-ic svg { width: 40px; height: 40px; }
    .ph p { margin: 0; font-size: 13px; }
    .ph b { color: #475569; }
    .chart-wrap { width: 100%; height: 320px; position: relative; }
    .kpi-preview { text-align: center; }
    .kpi-big { font-size: 52px; font-weight: 800; color: #0f172a; letter-spacing: -1px; }
    .kpi-cap { font-size: 13px; color: #94a3b8; margin-top: 4px; text-transform: capitalize; }
    .kpi-trend { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #059669; margin-top: 12px; }
    .table-preview { width: 100%; }
    .table-preview table { width: 100%; border-collapse: collapse; }
    .table-preview th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; border-bottom: 1px solid #eef1f6; }
    .table-preview td { padding: 11px 12px; font-size: 13px; color: #334155; border-bottom: 1px solid #f4f6fb; }

    .right { width: 240px; background: white; border-left: 1px solid #e8ebf2; padding: 18px; overflow-y: auto; flex-shrink: 0; }
    .right-head { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 16px; }
    .right-hint { text-align: center; color: #94a3b8; padding: 24px 8px; }
    .right-hint svg { margin-bottom: 10px; }
    .right-hint p { font-size: 12.5px; line-height: 1.5; margin: 0; }
    .section-title { font-size: 10.5px; font-weight: 700; color: #94a3b8; letter-spacing: 0.5px; margin-bottom: 12px; }
    .palette { display: flex; gap: 10px; margin-bottom: 24px; flex-wrap: wrap; }
    .sw { width: 26px; height: 26px; border-radius: 7px; cursor: pointer; border: 2px solid transparent; transition: all 0.15s ease; }
    .sw.sel { border-color: #0f172a; transform: scale(1.1); }
    .legend-seg { display: flex; background: #f1f5f9; border-radius: 9px; padding: 3px; }
    .legend-seg button { flex: 1; border: none; background: none; padding: 7px; font-size: 12px; font-weight: 600; color: #64748b; border-radius: 7px; cursor: pointer; }
    .legend-seg button.active { background: white; color: #0f172a; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }

    @media (max-width: 1200px) { .viz-rail { width: 200px; } .right { width: 200px; } }
  `]
})
export class DashboardBuilderComponent {
  selectedViz: string | null = null;
  openSlot: string | null = null;
  config: { [k: string]: string | null } = {};
  selPalette = 0;
  legendPos = 'Bottom';
  palette = ['#2563eb', '#64748b', '#cbd5e1', '#1e293b', '#93c5fd'];

  committedWidgets: WidgetSpec[] = [];
  private widgetSeq = 0;

  railWidth = 244;
  dragging = false;
  private dragStartX = 0;
  private dragStartW = 0;
  private lastWidth = 244;

  startDrag(e: MouseEvent) { this.dragging = true; this.dragStartX = e.clientX; this.dragStartW = this.railWidth; e.preventDefault(); }

  @HostListener('document:mousemove', ['$event'])
  onDrag(e: MouseEvent) {
    if (!this.dragging) return;
    const delta = e.clientX - this.dragStartX;
    this.railWidth = Math.min(400, Math.max(66, this.dragStartW + delta));
  }

  @HostListener('document:mouseup')
  stopDrag() {
    if (this.dragging && this.railWidth > 140) this.lastWidth = this.railWidth;
    this.dragging = false;
  }

  toggleRail() { this.railWidth = this.railWidth < 140 ? this.lastWidth : 72; }
  previewTable: { label: string; a: number; b: number; c: number }[] = [];
  previewKpi = 0;
  trackRow = (_: number, r: { label: string }) => r.label;
  trackWidget = (_: number, w: WidgetSpec) => w.id;

  private _canvas?: HTMLCanvasElement;
  private chart?: Chart;

  @ViewChild('previewCanvas') set canvasRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this._canvas = ref?.nativeElement;
    if (this._canvas) setTimeout(() => this.renderChart(), 0);
  }

  constructor(private sanitizer: DomSanitizer) {
    this.vizTypes.forEach(v => v.iconSafe = this.sanitizer.bypassSecurityTrustHtml(v.icon));
  }

  dimensions: Field[] = [
    { name: 'Department', role: 'dimension', icon: 'A' },
    { name: 'Region', role: 'dimension', icon: 'A' },
    { name: 'Month', role: 'dimension', icon: 'A' },
    { name: 'Priority', role: 'dimension', icon: 'A' },
    { name: 'Status', role: 'dimension', icon: 'A' }
  ];
  measures: Field[] = [
    { name: 'blockers', role: 'measure', icon: '#' },
    { name: 'severe', role: 'measure', icon: '#' },
    { name: 'major', role: 'measure', icon: '#' },
    { name: 'costUsd', role: 'measure', icon: '$' },
    { name: 'tickets', role: 'measure', icon: '#' }
  ];

  vizTypes: VizType[] = [
    { key: 'kpi', label: 'KPI', desc: 'A single headline metric', icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 16a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/><path d="M12 16l5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16" r="1.8" fill="currentColor"/></svg>` },
    { key: 'table', label: 'TABLE', desc: 'Rows & columns of data', icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2.5" fill="currentColor" opacity="0.15"/><rect x="3.9" y="4.9" width="16.2" height="14.2" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M4 9.5h16" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 9.5V20M15 9.5V20" stroke="currentColor" stroke-width="1.6"/></svg>` },
    { key: 'bar', label: 'BAR CHART', desc: 'Compare across categories', icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="12" width="4.2" height="8" rx="1.3" fill="currentColor" opacity="0.4"/><rect x="9.9" y="6" width="4.2" height="14" rx="1.3" fill="currentColor"/><rect x="15.8" y="9" width="4.2" height="11" rx="1.3" fill="currentColor" opacity="0.4"/></svg>` },
    { key: 'hbar', label: 'HORIZONTAL BAR', desc: 'Ranked categories', icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4.5" width="15" height="4.2" rx="1.3" fill="currentColor"/><rect x="4" y="10.9" width="9" height="4.2" rx="1.3" fill="currentColor" opacity="0.4"/><rect x="4" y="17.3" width="12.5" height="4.2" rx="1.3" fill="currentColor" opacity="0.7"/></svg>` },
    { key: 'line', label: 'LINE CHART', desc: 'Trends over a dimension', icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 16l5-5 4 3 7-8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="11" r="1.7" fill="currentColor"/><circle cx="20" cy="6" r="1.7" fill="currentColor"/></svg>` },
    { key: 'area', label: 'AREA', desc: 'Trend with filled volume', icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M3 20V13l5-5 4 3 6-6 3 3v12H3z" fill="currentColor" opacity="0.2"/><path d="M3 13l5-5 4 3 6-6 3 3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
    { key: 'pie', label: 'PIE CHART', desc: 'Part-to-whole share', icon: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" fill="currentColor" opacity="0.18"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5H12V3.5z" fill="currentColor"/><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6"/></svg>` },
    { key: 'donut', label: 'DONUT', desc: 'Proportions with total', icon: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7.5" stroke="currentColor" stroke-width="3.4" opacity="0.22"/><path d="M12 4.5a7.5 7.5 0 0 1 7.5 7.5" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>` },
    { key: 'radar', label: 'RADAR', desc: 'Compare multiple metrics', icon: `<svg viewBox="0 0 24 24" fill="none"><polygon points="12 3 20 8.5 17 18.5 7 18.5 4 8.5" fill="currentColor" opacity="0.16"/><polygon points="12 7 16 10 14.5 15 9.5 15 8 10" fill="currentColor" opacity="0.5"/><polygon points="12 3 20 8.5 17 18.5 7 18.5 4 8.5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>` },
    { key: 'polar', label: 'POLAR AREA', desc: 'Proportional segments', icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 12V4a8 8 0 0 1 5.7 2.3L12 12z" fill="currentColor"/><path d="M12 12l5.7-5.7A8 8 0 0 1 20 12h-8z" fill="currentColor" opacity="0.5"/><path d="M12 12h8a8 8 0 0 1-8 8v-8z" fill="currentColor" opacity="0.28"/><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.4" opacity="0.45"/></svg>` }
  ];

  slotSpecs: { [k: string]: Slot[] } = {
    kpi: [{ key: 'metric', label: 'METRIC', role: 'measure' }],
    table: [{ key: 'group', label: 'GROUP BY', role: 'dimension' }],
    bar: [{ key: 'x', label: 'X-AXIS', role: 'dimension' }, { key: 'y', label: 'Y-AXIS', role: 'measure' }],
    hbar: [{ key: 'x', label: 'CATEGORY', role: 'dimension' }, { key: 'y', label: 'VALUE', role: 'measure' }],
    line: [{ key: 'x', label: 'X-AXIS', role: 'dimension' }, { key: 'y', label: 'Y-AXIS', role: 'measure' }],
    area: [{ key: 'x', label: 'X-AXIS', role: 'dimension' }, { key: 'y', label: 'Y-AXIS', role: 'measure' }],
    pie: [{ key: 'cat', label: 'CATEGORY', role: 'dimension' }, { key: 'val', label: 'VALUE', role: 'measure' }],
    donut: [{ key: 'cat', label: 'CATEGORY', role: 'dimension' }, { key: 'val', label: 'VALUE', role: 'measure' }],
    radar: [{ key: 'x', label: 'AXES', role: 'dimension' }, { key: 'y', label: 'VALUE', role: 'measure' }],
    polar: [{ key: 'cat', label: 'CATEGORY', role: 'dimension' }, { key: 'val', label: 'VALUE', role: 'measure' }]
  };

  private chartMeta(viz: string): ChartMeta {
    const m: { [k: string]: ChartMeta } = {
      bar: { t: 'bar', axis: 'x', fill: false, multi: false, radial: false, legend: false },
      hbar: { t: 'bar', axis: 'y', fill: false, multi: false, radial: false, legend: false },
      line: { t: 'line', axis: 'x', fill: false, multi: false, radial: false, legend: false },
      area: { t: 'line', axis: 'x', fill: true, multi: false, radial: false, legend: false },
      pie: { t: 'pie', axis: 'x', fill: false, multi: true, radial: false, legend: true },
      donut: { t: 'doughnut', axis: 'x', fill: false, multi: true, radial: false, legend: true },
      radar: { t: 'radar', axis: 'x', fill: true, multi: false, radial: true, legend: false },
      polar: { t: 'polarArea', axis: 'x', fill: false, multi: true, radial: true, legend: true }
    };
    return m[viz];
  }

  currentSlots(): Slot[] { return this.selectedViz ? (this.slotSpecs[this.selectedViz] || []) : []; }
  vizLabel(): string { return this.vizTypes.find(v => v.key === this.selectedViz)?.label || 'WIDGET'; }
  vizIconSafe(): SafeHtml { return this.vizTypes.find(v => v.key === this.selectedViz)?.iconSafe || ''; }
  isChartViz(): boolean { return !!this.selectedViz && ['bar', 'hbar', 'line', 'area', 'pie', 'donut', 'radar', 'polar'].includes(this.selectedViz); }
  fieldsForRole(role: string): Field[] { return role === 'dimension' ? this.dimensions : this.measures; }
  roleIcon(role: string, field: string): string { return field === 'costUsd' ? '$' : (role === 'dimension' ? 'A' : '#'); }

  isConfigured(): boolean { return !!this.selectedViz && this.currentSlots().every(s => !!this.config[s.key]); }
  missingSlotLabels(): string { return this.currentSlots().filter(s => !this.config[s.key]).map(s => s.label.toLowerCase()).join(' & '); }

  selectViz(key: string) { this.selectedViz = key; this.config = {}; this.openSlot = null; this.previewTable = []; this.previewKpi = 0; this.destroyChart(); }
  startOver() { this.selectedViz = null; this.config = {}; this.openSlot = null; this.previewTable = []; this.previewKpi = 0; this.destroyChart(); }
  toggleSlot(key: string) { this.openSlot = this.openSlot === key ? null : key; }

  addWidget() {
    if (this.isConfigured()) { this.committedWidgets.push(this.buildSpec()); }
    this.startOver();
  }
  removeWidget(id: number) { this.committedWidgets = this.committedWidgets.filter(w => w.id !== id); }

  pickField(slotKey: string, field: string) {
    this.config[slotKey] = field;
    this.openSlot = null;
    if (this.isConfigured()) {
      if (this.isChartViz() && this._canvas) setTimeout(() => this.renderChart(), 0);
      if (this.selectedViz === 'table') this.previewTable = this.tableRows();
      if (this.selectedViz === 'kpi') this.previewKpi = this.kpiTotal();
    }
  }

  setPalette(i: number) { this.selPalette = i; if (this.isConfigured() && this.isChartViz()) setTimeout(() => this.renderChart(), 0); }
  setLegend(p: string) { this.legendPos = p; if (this.isConfigured() && this.isChartViz()) setTimeout(() => this.renderChart(), 0); }

  private hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  private labelsFor(dim: string): string[] {
    const map: { [k: string]: string[] } = {
      Department: ['Engineering', 'Sales', 'Operations', 'Finance', 'HR', 'IT'],
      Region: ['North America', 'EMEA', 'APAC', 'LATAM'],
      Month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
      Priority: ['Critical', 'High', 'Medium', 'Low'],
      Status: ['Active', 'Pending', 'Resolved', 'Closed']
    };
    return map[dim] || ['A', 'B', 'C', 'D'];
  }
  private valuesFor(measure: string, n: number): number[] {
    let seed = this.hash(measure);
    const base = measure === 'costUsd' ? 4000 : measure === 'tickets' ? 600 : 25;
    const out: number[] = [];
    for (let i = 0; i < n; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; out.push(Math.round(base * (0.35 + (seed / 4294967296)))); }
    return out;
  }

  kpiTotal(): number { const m = this.config['metric']; return m ? this.valuesFor(m, 6).reduce((a, b) => a + b, 0) : 0; }
  tableRows() {
    const dim = this.config['group']; if (!dim) return [];
    const labels = this.labelsFor(dim);
    const a = this.valuesFor('blockers', labels.length), b = this.valuesFor('severe', labels.length), c = this.valuesFor('costUsd', labels.length);
    return labels.map((label, i) => ({ label, a: a[i], b: b[i], c: c[i] }));
  }

  private dimMeas(): { dim: string; meas: string } {
    const slots = this.currentSlots();
    return { dim: this.config[slots.find(s => s.role === 'dimension')!.key]!, meas: this.config[slots.find(s => s.role === 'measure')!.key]! };
  }

  private buildSpec(): WidgetSpec {
    const viz = this.selectedViz!;
    const primary = this.palette[this.selPalette];

    if (viz === 'kpi') {
      const m = this.config['metric']!;
      return { id: ++this.widgetSeq, viz, title: 'Total ' + m, chartType: null, labels: [], data: [], primary, fill: false, multiColor: false, radial: false, indexAxis: 'x', showLegend: false, kpiTotal: this.kpiTotal(), kpiLabel: m };
    }
    if (viz === 'table') {
      const dim = this.config['group']!;
      const rows = this.tableRows().map(r => [r.label, r.a, r.b, '$' + r.c.toLocaleString()]);
      return { id: ++this.widgetSeq, viz, title: dim + ' breakdown', chartType: null, labels: [], data: [], primary, fill: false, multiColor: false, radial: false, indexAxis: 'x', showLegend: false, tableColumns: [dim, 'blockers', 'severe', 'costUsd'], tableRows: rows };
    }

    const { dim, meas } = this.dimMeas();
    const labels = this.labelsFor(dim);
    const data = this.valuesFor(meas, labels.length);
    const meta = this.chartMeta(viz);
    return { id: ++this.widgetSeq, viz, title: meas + ' by ' + dim, chartType: meta.t, labels, data, primary, fill: meta.fill, multiColor: meta.multi, radial: meta.radial, indexAxis: meta.axis, showLegend: meta.legend, kpiLabel: meas };
  }

  private destroyChart() { if (this.chart) { this.chart.destroy(); this.chart = undefined; } }

  private renderChart() {
    if (!this._canvas || !this.isChartViz() || !this.isConfigured()) return;
    this.destroyChart();
    const { dim, meas } = this.dimMeas();
    const labels = this.labelsFor(dim);
    const data = this.valuesFor(meas, labels.length);
    const primary = this.palette[this.selPalette];
    const multi = ['#2563eb', '#60a5fa', '#93c5fd', '#1e40af', '#64748b', '#cbd5e1'];
    const meta = this.chartMeta(this.selectedViz!);

    this.chart = new Chart(this._canvas.getContext('2d')!, {
      type: meta.t,
      data: {
        labels,
        datasets: [{
          label: meas,
          data,
          backgroundColor: meta.multi ? multi : (meta.t === 'radar' ? primary + '33' : meta.fill ? primary + '22' : primary),
          borderColor: primary,
          borderWidth: meta.multi ? 2 : (meta.t === 'line' || meta.t === 'radar' ? 2.5 : 0),
          fill: meta.fill,
          tension: 0.4,
          pointRadius: (meta.t === 'line' || meta.t === 'radar') ? 4 : 0,
          borderRadius: (this.selectedViz === 'bar' || this.selectedViz === 'hbar') ? 6 : 0
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: meta.axis,
        plugins: { legend: { display: meta.legend, position: this.legendPos.toLowerCase() as any, labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } } },
        scales: (meta.multi || meta.radial) ? {} : {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 }, color: '#94a3b8' } },
          x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94a3b8' } }
        }
      }
    });
  }
}
