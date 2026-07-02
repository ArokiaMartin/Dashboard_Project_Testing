import { Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { StackChartComponent } from '../stack-chart/stack-chart.component';

Chart.register(...registerables);

interface Field { name: string; role: 'dimension' | 'measure'; icon: string; }
interface FieldGroup { name: string; open: boolean; fields: Field[]; }
interface VizType { key: string; label: string; icon: string; }
interface Slot { key: string; label: string; role: 'dimension' | 'measure'; }

@Component({
  selector: 'app-dashboard-builder',
  standalone: true,
  imports: [CommonModule, RouterLink, StackChartComponent],
  template: `
    <div class="builder">
      <!-- Toolbar -->
      <div class="toolbar">
        <div class="tb-left">
          <button class="add-widget" (click)="resetConfig()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Widget
          </button>
          <div class="divider"></div>
          <button class="tb-icon" title="Undo"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg></button>
          <button class="tb-icon" title="Redo"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg></button>
        </div>
        <div class="tb-right">
          <button class="tb-text" routerLink="/preview">Preview</button>
          <button class="tb-save">Save</button>
        </div>
      </div>

      <div class="body">
        <!-- LEFT: Available fields -->
        <aside class="left">
          <div class="left-head"><span>Available Fields</span></div>
          <div class="tree-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            UPLOADED REPORT
          </div>
          <div class="tree">
            <div *ngFor="let g of groups">
              <div class="grp" (click)="g.open = !g.open">
                <svg class="chev" [class.open]="g.open" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                {{ g.name }}
              </div>
              <div class="leaves" *ngIf="g.open">
                <div class="leaf" *ngFor="let f of g.fields">
                  <span class="ftype" [ngClass]="f.role">{{ f.icon }}</span>
                  {{ f.name }}
                </div>
              </div>
            </div>
          </div>
        </aside>

        <!-- CENTER -->
        <section class="center">
          <!-- Filters (not shown for Stack Chart - it has its own filter builder) -->
          <div class="filters-bar" *ngIf="selectedViz !== 'stack'">
            <div class="fb-head">
              <span class="fb-title">Filters</span>
              <button class="add-filter">+ Add Filter</button>
            </div>
            <div class="filter-row">
              <div class="frag"><label>FIELD</label><div class="select">Status <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div></div>
              <div class="frag"><label>OPERATOR</label><div class="select">is exactly <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div></div>
              <div class="frag"><label>VALUE</label><div class="select">Active <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div></div>
              <button class="frag-x">✕</button>
            </div>
          </div>

          <!-- Configure card -->
          <div class="config-card" [class.stack-mode]="selectedViz === 'stack'">
            <div class="cfg-head" *ngIf="selectedViz !== 'stack'">
              <div class="cfg-title">
                <span class="cfg-badge">{{ vizLabel() }}</span>
                <input class="cfg-name" [value]="widgetName" (input)="widgetName = $any($event.target).value" />
              </div>
              <span class="cfg-hint" *ngIf="!isConfigured()">Configure axes to preview →</span>
              <span class="cfg-ready" *ngIf="isConfigured()">● Live</span>
            </div>

            <!-- Axis slots (hidden for Stack Chart) -->
            <div class="slots" *ngIf="selectedViz !== 'stack'">
              <div class="slot" *ngFor="let s of currentSlots()">
                <label>{{ s.label }}</label>
                <button class="slot-btn" [class.filled]="config[s.key]" (click)="toggleSlot(s.key)">
                  <span *ngIf="config[s.key]" class="slot-val">
                    <span class="ftype sm" [ngClass]="s.role">{{ roleIcon(s.role, config[s.key]!) }}</span>
                    {{ config[s.key] }}
                  </span>
                  <span *ngIf="!config[s.key]" class="slot-placeholder">Select field</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>

                <!-- dropdown -->
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

            <!-- Preview -->
            <div class="preview">
              <!-- placeholder -->
              <div class="ph" *ngIf="!isConfigured() && selectedViz !== 'stack'">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
                <p>Pick <b>{{ missingSlotLabels() }}</b> to render the chart</p>
              </div>

              <!-- chart -->
              <div class="chart-wrap" *ngIf="isConfigured() && isChartViz()">
                <canvas #previewCanvas></canvas>
              </div>

              <!-- KPI -->
              <div class="kpi-preview" *ngIf="isConfigured() && selectedViz === 'kpi'">
                <div class="kpi-big">{{ kpiTotal() | number }}</div>
                <div class="kpi-cap">Total {{ config['metric'] }}</div>
                <div class="kpi-trend"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> +12.5% vs last week</div>
              </div>

              <!-- Table -->
              <div class="table-preview" *ngIf="isConfigured() && selectedViz === 'table'">
                <table>
                  <thead><tr><th>{{ config['group'] }}</th><th>blockers</th><th>severe</th><th>costUsd</th></tr></thead>
                  <tbody>
                    <tr *ngFor="let row of tableRows()">
                      <td>{{ row.label }}</td><td>{{ row.a }}</td><td>{{ row.b }}</td><td>\${{ row.c | number }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Stack Chart -->
              <div *ngIf="selectedViz === 'stack'" style="width: 100%; height: 100%;">
                <app-stack-chart></app-stack-chart>
              </div>
            </div>
          </div>
        </section>

        <!-- RIGHT: visualizations -->
        <aside class="right">
          <div class="right-head">Visualizations</div>
          <div class="viz-grid">
            <button class="viz" *ngFor="let v of vizTypes"
                    [class.active]="v.key === selectedViz"
                    (click)="selectViz(v.key)">
              <span class="viz-ic" [innerHTML]="v.icon"></span>
              <span class="viz-label">{{ v.label }}</span>
            </button>
          </div>

          <div class="section-title">COLOR PALETTE</div>
          <div class="palette">
            <span class="sw" *ngFor="let c of palette; let i = index"
                  [style.background]="c" [class.sel]="i === selPalette" (click)="setPalette(i)"></span>
          </div>

          <div class="section-title">LEGEND POSITION</div>
          <div class="legend-seg">
            <button *ngFor="let p of ['Bottom','Right','Top']"
                    [class.active]="p === legendPos" (click)="setLegend(p)">{{ p }}</button>
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
    .tb-right { display: flex; align-items: center; gap: 10px; }
    .tb-text { background: none; border: none; color: #475569; font-size: 13px; font-weight: 600; cursor: pointer; padding: 8px 12px; }
    .tb-text:hover { color: #2563eb; }
    .tb-save { background: white; border: 1px solid #2563eb; color: #2563eb; padding: 8px 20px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .tb-save:hover { background: #eff6ff; }

    .body { flex: 1; display: flex; min-height: 0; }

    .left { width: 240px; background: white; border-right: 1px solid #e8ebf2; padding: 18px; overflow-y: auto; }
    .left-head { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 16px; }
    .tree-label { display: flex; align-items: center; gap: 7px; font-size: 10.5px; font-weight: 700; color: #94a3b8; letter-spacing: 0.5px; padding: 8px; background: #f8fafc; border-radius: 7px; margin-bottom: 8px; }
    .grp { display: flex; align-items: center; gap: 8px; padding: 8px; font-size: 13px; font-weight: 600; color: #334155; cursor: pointer; border-radius: 7px; }
    .grp:hover { background: #f8fafc; }
    .chev { transition: transform 0.15s ease; color: #94a3b8; }
    .chev.open { transform: rotate(90deg); }
    .leaves { padding-left: 10px; }
    .leaf { display: flex; align-items: center; gap: 9px; padding: 7px 8px 7px 14px; font-size: 13px; color: #475569; border-radius: 6px; cursor: grab; }
    .leaf:hover { background: #eff6ff; color: #2563eb; }
    .ftype { width: 18px; height: 18px; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; }
    .ftype.sm { width: 16px; height: 16px; font-size: 9px; }
    .ftype.measure { background: #dbeafe; color: #2563eb; }
    .ftype.dimension { background: #f1f5f9; color: #64748b; }

    .center { flex: 1; padding: 20px; overflow-y: auto; }
    .filters-bar { background: white; border: 1px solid #e8ebf2; border-radius: 12px; padding: 16px 18px; margin-bottom: 18px; }
    .fb-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .fb-title { font-size: 14px; font-weight: 700; color: #0f172a; }
    .add-filter { background: none; border: none; color: #2563eb; font-size: 13px; font-weight: 600; cursor: pointer; }
    .filter-row { display: flex; align-items: flex-end; gap: 12px; }
    .frag { display: flex; flex-direction: column; gap: 5px; flex: 1; }
    .frag label { font-size: 10px; font-weight: 700; color: #94a3b8; letter-spacing: 0.4px; }
    .select { display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 9px 12px; font-size: 13px; color: #334155; cursor: pointer; }
    .frag-x { width: 32px; height: 36px; border: 1px solid #e2e8f0; background: white; border-radius: 8px; color: #94a3b8; cursor: pointer; font-size: 11px; }

    .config-card { background: white; border: 1px solid #e8ebf2; border-radius: 12px; padding: 20px; }
    .config-card.stack-mode { padding: 0; border: none; background: transparent; }
    .config-card.stack-mode .preview { border: none; background: transparent; min-height: auto; display: block; padding: 0; }
    .cfg-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
    .cfg-title { display: flex; align-items: center; gap: 10px; }
    .cfg-badge { background: #eff6ff; color: #2563eb; font-size: 10.5px; font-weight: 700; padding: 4px 9px; border-radius: 6px; letter-spacing: 0.3px; }
    .cfg-name { border: none; font-size: 15px; font-weight: 700; color: #0f172a; outline: none; background: none; border-bottom: 1px dashed transparent; padding: 2px 0; }
    .cfg-name:hover, .cfg-name:focus { border-bottom-color: #cbd5e1; }
    .cfg-hint { font-size: 12px; color: #94a3b8; font-weight: 500; }
    .cfg-ready { font-size: 12px; color: #059669; font-weight: 700; }

    .slots { display: flex; gap: 14px; margin-bottom: 20px; flex-wrap: wrap; }
    .slot { flex: 1; min-width: 180px; position: relative; }
    .slot label { display: block; font-size: 10px; font-weight: 700; color: #94a3b8; letter-spacing: 0.4px; margin-bottom: 6px; }
    .slot-btn { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; background: white; border: 1.5px solid #e2e8f0; border-radius: 9px; padding: 10px 12px; font-size: 13px; cursor: pointer; transition: all 0.15s ease; }
    .slot-btn:hover { border-color: #93c5fd; }
    .slot-btn.filled { border-color: #2563eb; background: #f8fbff; }
    .slot-val { display: flex; align-items: center; gap: 8px; color: #0f172a; font-weight: 600; }
    .slot-placeholder { color: #94a3b8; }
    .dropdown { position: absolute; top: 100%; left: 0; right: 0; margin-top: 6px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; box-shadow: 0 12px 30px rgba(15,23,42,0.12); padding: 8px; z-index: 30; }
    .dd-label { font-size: 10px; font-weight: 700; color: #94a3b8; letter-spacing: 0.4px; padding: 6px 8px; }
    .dd-item { width: 100%; display: flex; align-items: center; gap: 9px; padding: 9px 8px; background: none; border: none; border-radius: 7px; font-size: 13px; color: #334155; cursor: pointer; text-align: left; }
    .dd-item:hover { background: #f4f6fb; }
    .dd-check { margin-left: auto; }

    .preview { border: 1px solid #eef1f6; border-radius: 10px; background: #fbfcfe; min-height: 300px; display: flex; align-items: center; justify-content: center; padding: 18px; }
    .ph { text-align: center; color: #94a3b8; }
    .ph p { margin: 12px 0 0; font-size: 13px; }
    .ph b { color: #475569; }
    .chart-wrap { width: 100%; height: 300px; position: relative; }
    .kpi-preview { text-align: center; }
    .kpi-big { font-size: 52px; font-weight: 800; color: #0f172a; letter-spacing: -1px; }
    .kpi-cap { font-size: 13px; color: #94a3b8; margin-top: 4px; text-transform: capitalize; }
    .kpi-trend { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #059669; margin-top: 12px; }
    .table-preview { width: 100%; }
    .table-preview table { width: 100%; border-collapse: collapse; }
    .table-preview th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; border-bottom: 1px solid #eef1f6; }
    .table-preview td { padding: 11px 12px; font-size: 13px; color: #334155; border-bottom: 1px solid #f4f6fb; }

    .right { width: 250px; background: white; border-left: 1px solid #e8ebf2; padding: 18px; overflow-y: auto; }
    .right-head { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 16px; }
    .viz-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 24px; }
    .viz { background: white; border: 1.5px solid #e8ebf2; border-radius: 11px; padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer; transition: all 0.16s ease; }
    .viz:hover { border-color: #bfdbfe; }
    .viz.active { border-color: #2563eb; background: #eff6ff; }
    .viz.active .viz-ic, .viz.active .viz-label { color: #2563eb; }
    .viz-ic { color: #64748b; display: flex; }
    .viz-label { font-size: 10.5px; font-weight: 700; color: #64748b; letter-spacing: 0.3px; }
    .section-title { font-size: 10.5px; font-weight: 700; color: #94a3b8; letter-spacing: 0.5px; margin-bottom: 12px; }
    .palette { display: flex; gap: 10px; margin-bottom: 24px; }
    .sw { width: 26px; height: 26px; border-radius: 7px; cursor: pointer; border: 2px solid transparent; transition: all 0.15s ease; }
    .sw.sel { border-color: #0f172a; transform: scale(1.1); }
    .legend-seg { display: flex; background: #f1f5f9; border-radius: 9px; padding: 3px; }
    .legend-seg button { flex: 1; border: none; background: none; padding: 7px; font-size: 12px; font-weight: 600; color: #64748b; border-radius: 7px; cursor: pointer; }
    .legend-seg button.active { background: white; color: #0f172a; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }

    @media (max-width: 1200px) { .left, .right { width: 200px; } }
  `]
})
export class DashboardBuilderComponent {
  selectedViz = 'bar';
  widgetName = 'New Widget';
  openSlot: string | null = null;
  config: { [k: string]: string | null } = {};
  selPalette = 0;
  legendPos = 'Bottom';
  palette = ['#2563eb', '#64748b', '#cbd5e1', '#1e293b', '#93c5fd'];

  private _canvas?: HTMLCanvasElement;
  private chart?: Chart;

  @ViewChild('previewCanvas') set canvasRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this._canvas = ref?.nativeElement;
    if (this._canvas) setTimeout(() => this.renderChart(), 0);
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

  groups: FieldGroup[] = [
    { name: 'Summary', open: true, fields: [
      { name: 'blockers', role: 'measure', icon: '#' },
      { name: 'severe', role: 'measure', icon: '#' },
      { name: 'major', role: 'measure', icon: '#' },
      { name: 'costUsd', role: 'measure', icon: '$' }
    ]},
    { name: 'Findings', open: false, fields: [{ name: 'Department', role: 'dimension', icon: 'A' }, { name: 'Priority', role: 'dimension', icon: 'A' }] },
    { name: 'Plan', open: false, fields: [{ name: 'Month', role: 'dimension', icon: 'A' }] },
    { name: 'Metadata', open: false, fields: [{ name: 'Region', role: 'dimension', icon: 'A' }, { name: 'Status', role: 'dimension', icon: 'A' }] },
    { name: 'Cost', open: false, fields: [{ name: 'tickets', role: 'measure', icon: '#' }] },
    { name: 'Evidence', open: false, fields: [{ name: 'ref', role: 'dimension', icon: 'A' }] },
    { name: 'Passes', open: false, fields: [{ name: 'count', role: 'measure', icon: '#' }] },
    { name: 'Inapplicable', open: false, fields: [{ name: 'reason', role: 'dimension', icon: 'A' }] }
  ];

  vizTypes: VizType[] = [
    { key: 'kpi', label: 'KPI', icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>` },
    { key: 'table', label: 'TABLE', icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="12" y1="3" x2="12" y2="21"/></svg>` },
    { key: 'bar', label: 'BAR CHART', icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>` },
    { key: 'stack', label: 'STACK CHART', icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="12" width="3" height="9"/><rect x="9" y="6" width="3" height="15"/><rect x="15" y="9" width="3" height="12"/></svg>` },
    { key: 'area', label: 'AREA', icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 15l5-6 4 3 5-7 4 5v8H3z"/></svg>` },
    { key: 'donut', label: 'DONUT', icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/></svg>` },
    { key: 'pie', label: 'PIE CHART', icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v9h9"/><circle cx="12" cy="12" r="9"/></svg>` },
    { key: 'line', label: 'LINE CHART', icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 17 9 11 13 15 21 6"/></svg>` }
  ];

  slotSpecs: { [k: string]: Slot[] } = {
    kpi: [{ key: 'metric', label: 'METRIC', role: 'measure' }],
    table: [{ key: 'group', label: 'GROUP BY', role: 'dimension' }],
    bar: [{ key: 'x', label: 'X-AXIS', role: 'dimension' }, { key: 'y', label: 'Y-AXIS', role: 'measure' }],
    stack: [{ key: 'x', label: 'DIMENSION', role: 'dimension' }, { key: 'y', label: 'MEASURES', role: 'measure' }],
    area: [{ key: 'x', label: 'X-AXIS', role: 'dimension' }, { key: 'y', label: 'Y-AXIS', role: 'measure' }],
    line: [{ key: 'x', label: 'X-AXIS', role: 'dimension' }, { key: 'y', label: 'Y-AXIS', role: 'measure' }],
    donut: [{ key: 'cat', label: 'CATEGORY', role: 'dimension' }, { key: 'val', label: 'VALUE', role: 'measure' }],
    pie: [{ key: 'cat', label: 'CATEGORY', role: 'dimension' }, { key: 'val', label: 'VALUE', role: 'measure' }]
  };

  currentSlots(): Slot[] { return this.slotSpecs[this.selectedViz] || []; }
  vizLabel(): string { return this.vizTypes.find(v => v.key === this.selectedViz)?.label || 'WIDGET'; }
  isChartViz(): boolean { return ['bar', 'area', 'line', 'donut', 'pie'].includes(this.selectedViz); }
  fieldsForRole(role: string): Field[] { return role === 'dimension' ? this.dimensions : this.measures; }
  roleIcon(role: string, field: string): string { return field === 'costUsd' ? '$' : (role === 'dimension' ? 'A' : '#'); }

  isConfigured(): boolean { return this.currentSlots().every(s => !!this.config[s.key]); }
  missingSlotLabels(): string {
    return this.currentSlots().filter(s => !this.config[s.key]).map(s => s.label.toLowerCase()).join(' & ');
  }

  selectViz(key: string) {
    this.selectedViz = key;
    this.resetConfig();
  }

  resetConfig() {
    this.config = {};
    this.openSlot = null;
    this.destroyChart();
  }

  toggleSlot(key: string) { this.openSlot = this.openSlot === key ? null : key; }

  pickField(slotKey: string, field: string) {
    this.config[slotKey] = field;
    this.openSlot = null;
    if (this.isConfigured() && this.isChartViz() && this._canvas) {
      setTimeout(() => this.renderChart(), 0);
    }
  }

  setPalette(i: number) { this.selPalette = i; if (this.isConfigured() && this.isChartViz()) setTimeout(() => this.renderChart(), 0); }
  setLegend(p: string) { this.legendPos = p; if (this.isConfigured() && this.isChartViz()) setTimeout(() => this.renderChart(), 0); }

  // ---- mock data ----
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

  kpiTotal(): number {
    const m = this.config['metric']; if (!m) return 0;
    return this.valuesFor(m, 6).reduce((a, b) => a + b, 0);
  }
  tableRows() {
    const dim = this.config['group']; if (!dim) return [];
    const labels = this.labelsFor(dim);
    const a = this.valuesFor('blockers', labels.length);
    const b = this.valuesFor('severe', labels.length);
    const c = this.valuesFor('costUsd', labels.length);
    return labels.map((label, i) => ({ label, a: a[i], b: b[i], c: c[i] }));
  }

  private destroyChart() { if (this.chart) { this.chart.destroy(); this.chart = undefined; } }

  private renderChart() {
    if (!this._canvas || !this.isChartViz() || !this.isConfigured() || this.selectedViz === 'stack') return;
    this.destroyChart();

    const dimKey = this.selectedViz === 'donut' || this.selectedViz === 'pie' ? 'cat' : 'x';
    const measKey = this.selectedViz === 'donut' || this.selectedViz === 'pie' ? 'val' : 'y';
    const dim = this.config[dimKey]!, meas = this.config[measKey]!;
    const labels = this.labelsFor(dim);
    const data = this.valuesFor(meas, labels.length);
    const primary = this.palette[this.selPalette];
    const multi = ['#2563eb', '#60a5fa', '#93c5fd', '#1e40af', '#64748b', '#cbd5e1'];

    const type = this.selectedViz === 'area' ? 'line' : this.selectedViz === 'donut' ? 'doughnut' : this.selectedViz;
    const isPieish = type === 'doughnut' || type === 'pie';

    this.chart = new Chart(this._canvas.getContext('2d')!, {
      type: type as any,
      data: {
        labels,
        datasets: [{
          label: meas,
          data,
          backgroundColor: isPieish ? multi : (this.selectedViz === 'area' ? primary + '22' : primary),
          borderColor: primary,
          borderWidth: isPieish ? 2 : (this.selectedViz === 'line' || this.selectedViz === 'area' ? 2.5 : 0),
          fill: this.selectedViz === 'area',
          tension: 0.4,
          pointBackgroundColor: primary,
          pointRadius: this.selectedViz === 'line' || this.selectedViz === 'area' ? 4 : 0,
          borderRadius: this.selectedViz === 'bar' ? 6 : 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: isPieish, position: this.legendPos.toLowerCase() as any, labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } }
        },
        scales: isPieish ? {} : {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 }, color: '#94a3b8' } },
          x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94a3b8' } }
        }
      }
    });
  }
}
