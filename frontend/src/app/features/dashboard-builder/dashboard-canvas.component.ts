import { Component, Input, Output, EventEmitter, ElementRef, AfterViewInit, OnChanges, OnDestroy, HostListener, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WidgetTileComponent, WidgetSpec, GridLayout } from './widget-tile.component';

// Grid geometry constants (12-column responsive grid).
const COLS = 12;
const ROW_H = 80;
const GAP = 16;
const MIN_W = 3;
const MIN_H = 2;

/** Default placement for a widget dropped on the canvas: half-width tiles flowing two-per-row. */
export function defaultGridLayout(index: number): GridLayout {
  const col = index % 2;
  return { x: col * 6, y: Math.floor(index / 2) * 3, w: 6, h: 3 };
}

/**
 * Free-form dashboard canvas with a friendly drag-and-drop feel. Each widget renders at an absolute
 * position derived from its 12-column grid layout. While editing, the user can grab a tile's header to
 * move it or drag its corner to resize it: the tile lifts and follows the cursor smoothly, a dashed
 * placeholder shows where it will snap, faint grid lines appear, and the other tiles glide out of the
 * way (they never overlap). Emits `layoutChange` after each gesture so the host can persist positions.
 */
@Component({
  selector: 'app-dashboard-canvas',
  standalone: true,
  imports: [CommonModule, WidgetTileComponent],
  template: `
    <div class="grid-surface" #surface
         [class.readonly]="readOnly" [class.busy]="!!mode"
         [style.height.px]="surfaceHeight()"
         [style.backgroundSize]="mode ? (cellW() + 'px ' + cellH() + 'px') : null">

      <!-- Drop placeholder: green where the tile can land, red where it would overlap (snaps back). -->
      <div class="grid-ph" *ngIf="ph" [class.invalid]="!phValid"
           [style.left.px]="phLeft()" [style.top.px]="phTop()"
           [style.width.px]="phWidth()" [style.height.px]="phHeight()"></div>

      <div class="grid-item"
           *ngFor="let w of widgets; trackBy: trackW"
           [class.dragging]="active === w"
           [class.invalid-drop]="active === w && !phValid"
           [style.left.px]="itemLeft(w)" [style.top.px]="itemTop(w)"
           [style.width.px]="itemWidth(w)" [style.height.px]="itemHeight(w)">
        <app-widget-tile [spec]="w" [editing]="w.id === editingId" [readOnly]="readOnly"
                         (remove)="remove.emit(w.id)" (edit)="edit.emit(w.id)" (drillChange)="drillChange.emit()"></app-widget-tile>

        <!-- Header drag zone: grab the card header (title area) to move the tile. Leaves the top-right
             menu button clickable. A subtle grip appears on hover as an affordance. -->
        <div class="gi-drag" *ngIf="!readOnly" (mousedown)="startMove($event, w)" title="Drag to move">
          <span class="gi-grip">
            <svg width="18" height="10" viewBox="0 0 18 10" fill="currentColor">
              <circle cx="3" cy="2" r="1.4"/><circle cx="9" cy="2" r="1.4"/><circle cx="15" cy="2" r="1.4"/>
              <circle cx="3" cy="8" r="1.4"/><circle cx="9" cy="8" r="1.4"/><circle cx="15" cy="8" r="1.4"/>
            </svg>
          </span>
        </div>

        <!-- Resize handle: drag the bottom-right corner. -->
        <div class="gi-resize" *ngIf="!readOnly" (mousedown)="startResize($event, w)" title="Drag to resize">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <line x1="11" y1="4" x2="4" y2="11"/><line x1="11" y1="8" x2="8" y2="11"/>
          </svg>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .grid-surface { position: relative; width: 100%; min-height: 40px; border-radius: 12px; transition: background-color 0.15s ease; }
    /* Faint grid lines while dragging so the user can see the snap targets. */
    .grid-surface.busy { user-select: none; background-color: rgba(37,99,235,0.02);
      background-image:
        linear-gradient(to right, rgba(37,99,235,0.09) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(37,99,235,0.09) 1px, transparent 1px); }

    .grid-item { position: absolute; transition: left 0.18s cubic-bezier(0.22,0.61,0.36,1), top 0.18s cubic-bezier(0.22,0.61,0.36,1), width 0.18s cubic-bezier(0.22,0.61,0.36,1), height 0.18s cubic-bezier(0.22,0.61,0.36,1); }
    /* The tile being dragged lifts, tracks the cursor with no transition, and sits above the rest. */
    .grid-item.dragging { transition: none; z-index: 30; }
    .grid-item.dragging ::ng-deep .tile { box-shadow: 0 22px 48px rgba(15,23,42,0.22); border-color: #bfdbfe; transform: scale(1.012); }

    /* Drop placeholder — valid (free) spot is blue/green, an overlapping spot turns red. */
    .grid-ph { position: absolute; z-index: 1; border-radius: 12px;
      background: rgba(16,185,129,0.10); border: 2px dashed #34d399;
      transition: left 0.16s ease, top 0.16s ease, width 0.16s ease, height 0.16s ease, background 0.12s, border-color 0.12s; }
    .grid-ph.invalid { background: rgba(239,68,68,0.10); border-color: #f87171; }
    .grid-item.dragging.invalid-drop ::ng-deep .tile { border-color: #fca5a5; }

    /* Header drag zone — spans the header row, minus room for the top-right menu button. */
    .gi-drag { position: absolute; top: 0; left: 0; right: 54px; height: 46px; z-index: 6;
      cursor: grab; display: flex; align-items: center; justify-content: center; }
    .grid-item.dragging .gi-drag { cursor: grabbing; }
    .gi-grip { position: absolute; top: 9px; left: 50%; transform: translateX(-50%);
      color: #cbd5e1; opacity: 0; transition: opacity 0.14s ease; pointer-events: none; }
    .grid-item:hover .gi-grip { opacity: 1; }
    .grid-item.dragging .gi-grip { opacity: 1; color: #2563eb; }

    /* Resize handle — larger hit area, visible affordance on hover. */
    .gi-resize { position: absolute; right: 0; bottom: 0; z-index: 6; width: 26px; height: 26px;
      display: flex; align-items: flex-end; justify-content: flex-end; padding: 5px;
      color: #94a3b8; cursor: nwse-resize; opacity: 0; transition: opacity 0.14s ease, color 0.12s; }
    .grid-item:hover .gi-resize, .grid-item.dragging .gi-resize { opacity: 1; }
    .gi-resize:hover { color: #2563eb; }
  `]
})
export class DashboardCanvasComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() widgets: WidgetSpec[] = [];
  @Input() readOnly = false;
  @Input() editingId: number | null = null;
  @Output() remove = new EventEmitter<number>();
  @Output() edit = new EventEmitter<number>();
  /** Fired after a drag/resize gesture completes, so the host can persist the updated layouts. */
  @Output() layoutChange = new EventEmitter<void>();
  @Output() dragStart = new EventEmitter<void>();
  @Output() drillChange = new EventEmitter<void>();

  readonly cols = COLS;
  readonly rowH = ROW_H;
  readonly gap = GAP;
  /** Assumed width before the host is laid out (SSR / display:none), replaced by the live measurement. */
  private static readonly FALLBACK_W = 960;

  mode: 'move' | 'resize' | null = null;
  active: WidgetSpec | null = null;
  /** Snapped grid cell the active tile would land on — drives the placeholder. */
  ph: GridLayout | null = null;
  /** Whether the current placeholder is free (no overlap). Drops on an occupied spot snap back. */
  phValid = true;

  private startX = 0;
  private startY = 0;
  private origin: GridLayout = { x: 0, y: 0, w: 0, h: 0 };
  // Live pixel rect of the tile under the cursor (so it tracks smoothly instead of snapping per cell).
  private liveLeft = 0;
  private liveTop = 0;
  private liveWidth = 0;
  private liveHeight = 0;
  private ro?: ResizeObserver;

  trackW = (_: number, w: WidgetSpec) => w.id;

  constructor(private zone: NgZone, private host: ElementRef<HTMLElement>) {}

  ngOnChanges(): void {
    this.ensureLayouts();
    this.normalizeLayouts();
  }

  ngAfterViewInit(): void {
    // The host width drives column sizing. When it changes for reasons Angular can't see (e.g. the
    // builder's column rail being dragged), nudge a change-detection tick so the tiles re-flow.
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.zone.run(() => {}));
      this.ro.observe(this.host.nativeElement);
    }
  }

  ngOnDestroy(): void { this.ro?.disconnect(); this.clearBodyDragStyles(); }

  @HostListener('window:resize') onWinResize(): void { /* fires a CD tick so getters re-measure */ }

  /**
   * Live pixel width of a single grid column, read from the host element on each render. Reading the
   * real width during change detection (instead of caching it) means the first paint is already correct
   * and the value never changes within a cycle, so Angular's NG0100 guard is never tripped.
   */
  private colUnit(): number {
    const w = this.host.nativeElement.clientWidth || DashboardCanvasComponent.FALLBACK_W;
    return (w - (this.cols - 1) * this.gap) / this.cols;
  }

  /** Pixel span of one grid cell including the gap (used for snapping and the grid-line background). */
  cellW(): number { return this.colUnit() + this.gap; }
  cellH(): number { return this.rowH + this.gap; }

  /** Give any widget without a stored layout a sensible default so nothing renders at (0,0). */
  private ensureLayouts(): void {
    let missing = 0;
    for (const w of this.widgets) {
      if (!w.layout) w.layout = defaultGridLayout(missing++);
    }
  }

  private lay(w: WidgetSpec): GridLayout { return w.layout ?? (w.layout = defaultGridLayout(0)); }

  /**
   * Guarantees no two tiles overlap when the canvas is (re)rendered — e.g. a restored dashboard whose
   * saved layouts collide (several widgets stored at the same cell). Walks tiles in reading order and
   * pushes any that would overlap an already-placed tile straight down to the first free row. Preserves
   * each tile's column and relative order, and leaves an already-clean layout untouched (idempotent),
   * so it never disturbs an arrangement the user has deliberately set.
   */
  private normalizeLayouts(): void {
    const placed: GridLayout[] = [];
    const order = [...this.widgets].sort((a, b) => {
      const la = this.lay(a), lb = this.lay(b);
      return la.y - lb.y || la.x - lb.x || a.id - b.id;
    });
    for (const w of order) {
      const l = this.lay(w);
      // Keep the tile inside the grid horizontally before resolving vertical collisions.
      l.w = Math.max(MIN_W, Math.min(this.cols, l.w));
      l.x = Math.max(0, Math.min(this.cols - l.w, l.x));
      l.h = Math.max(MIN_H, l.h);
      l.y = Math.max(0, l.y);
      let guard = 0;
      while (guard++ < 1000 && placed.some((p) => this.overlaps(p, l))) {
        l.y++;
      }
      placed.push(l);
    }
  }

  // ---- pixel positions from grid layout ----
  private pxX(l: GridLayout): number { return l.x * this.cellW(); }
  private pxY(l: GridLayout): number { return l.y * this.cellH(); }
  private pxW(l: GridLayout): number { return l.w * this.colUnit() + (l.w - 1) * this.gap; }
  private pxH(l: GridLayout): number { return l.h * this.rowH + (l.h - 1) * this.gap; }

  // ---- rendered rect for each tile (the active one tracks the cursor; the rest follow their layout) ----
  itemLeft(w: WidgetSpec): number { return (this.active === w && this.mode) ? this.liveLeft : this.pxX(this.lay(w)); }
  itemTop(w: WidgetSpec): number { return (this.active === w && this.mode) ? this.liveTop : this.pxY(this.lay(w)); }
  itemWidth(w: WidgetSpec): number { return (this.active === w && this.mode) ? this.liveWidth : this.pxW(this.lay(w)); }
  itemHeight(w: WidgetSpec): number { return (this.active === w && this.mode) ? this.liveHeight : this.pxH(this.lay(w)); }

  // ---- placeholder rect ----
  phLeft(): number { return this.ph ? this.pxX(this.ph) : 0; }
  phTop(): number { return this.ph ? this.pxY(this.ph) : 0; }
  phWidth(): number { return this.ph ? this.pxW(this.ph) : 0; }
  phHeight(): number { return this.ph ? this.pxH(this.ph) : 0; }

  /** Total canvas height: the lowest widget bottom, plus a spare row when editing (room to drop into). */
  surfaceHeight(): number {
    let rows = 0;
    for (const w of this.widgets) rows = Math.max(rows, this.lay(w).y + this.lay(w).h);
    if (this.ph) rows = Math.max(rows, this.ph.y + this.ph.h);
    if (!this.readOnly) rows += 1;
    return rows > 0 ? rows * this.rowH + (rows - 1) * this.gap : 0;
  }

  // ---- gesture start ----
  startMove(e: MouseEvent, w: WidgetSpec): void { this.beginGesture('move', e, w); }
  startResize(e: MouseEvent, w: WidgetSpec): void { this.beginGesture('resize', e, w); }

  private beginGesture(mode: 'move' | 'resize', e: MouseEvent, w: WidgetSpec): void {
    if (this.readOnly) return;
    this.dragStart.emit();
    e.preventDefault(); e.stopPropagation();
    this.mode = mode;
    this.active = w;
    this.startX = e.clientX;
    this.startY = e.clientY;
    const l = this.lay(w);
    this.origin = { ...l };
    this.ph = { ...l };
    // Seed the live rect from the tile's current position so there's no jump on the first move.
    this.liveLeft = this.pxX(l);
    this.liveTop = this.pxY(l);
    this.liveWidth = this.pxW(l);
    this.liveHeight = this.pxH(l);
    this.phValid = true;
    this.setBodyDragStyles(mode, true);
  }

  @HostListener('document:mousemove', ['$event'])
  onMove(e: MouseEvent): void {
    if (!this.mode || !this.active || !this.ph) return;
    const cellW = this.cellW();
    const cellH = this.cellH();
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;

    if (this.mode === 'move') {
      // The tile follows the cursor pixel-for-pixel, clamped to the surface bounds…
      const maxLeft = (this.cols - this.origin.w) * cellW;
      this.liveLeft = Math.max(0, Math.min(maxLeft, this.origin.x * cellW + dx));
      this.liveTop = Math.max(0, this.origin.y * cellH + dy);
      // …and the placeholder snaps to the nearest cell.
      this.ph.x = Math.max(0, Math.min(this.cols - this.ph.w, Math.round(this.liveLeft / cellW)));
      this.ph.y = Math.max(0, Math.round(this.liveTop / cellH));
    } else {
      const maxWidthPx = (this.cols - this.origin.x) * cellW - this.gap;
      const minWidthPx = MIN_W * this.colUnit() + (MIN_W - 1) * this.gap;
      const minHeightPx = MIN_H * this.rowH + (MIN_H - 1) * this.gap;
      this.liveWidth = Math.max(minWidthPx, Math.min(maxWidthPx, this.pxW(this.origin) + dx));
      this.liveHeight = Math.max(minHeightPx, this.pxH(this.origin) + dy);
      this.ph.w = Math.max(MIN_W, Math.min(this.cols - this.ph.x, Math.round((this.liveWidth + this.gap) / cellW)));
      this.ph.h = Math.max(MIN_H, Math.round((this.liveHeight + this.gap) / cellH));
    }

    // Only the dragged tile moves. Other tiles stay put; flag whether this spot is free so the
    // placeholder can show it and the drop can either land here or snap back.
    this.phValid = !this.widgets.some((w) => w !== this.active && this.overlaps(this.lay(w), this.ph!));
    this.setBodyDragStyles(this.mode, this.phValid);
  }

  @HostListener('document:mouseup')
  onUp(): void {
    if (!this.mode) return;
    // Land the tile only if the drop spot is free; otherwise leave its layout untouched so it
    // animates back to where it started (no overlap is ever committed).
    if (this.active && this.ph && this.phValid) {
      const l = this.lay(this.active);
      l.x = this.ph.x; l.y = this.ph.y; l.w = this.ph.w; l.h = this.ph.h;
      this.layoutChange.emit();
    }
    this.mode = null;
    this.active = null;
    this.ph = null;
    this.phValid = true;
    this.clearBodyDragStyles();
  }

  // ---- cursor / selection feedback on the whole document during a drag ----
  private setBodyDragStyles(mode: 'move' | 'resize', valid: boolean): void {
    if (typeof document === 'undefined') return;
    document.body.style.cursor = !valid ? 'no-drop' : (mode === 'move' ? 'grabbing' : 'nwse-resize');
    document.body.style.userSelect = 'none';
  }
  private clearBodyDragStyles(): void {
    if (typeof document === 'undefined') return;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  private overlaps(a: GridLayout, b: GridLayout): boolean {
    return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  }
}
