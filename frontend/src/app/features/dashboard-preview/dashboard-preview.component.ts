import { Component, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DashboardCanvasComponent } from '@features/dashboard-builder/dashboard-canvas.component';
import { DashboardDraftService } from '@core/services/dashboard-draft.service';
import { WidgetSpec } from '@features/dashboard-builder/widget-tile.component';

/**
 * Full-screen preview of the dashboard currently on the builder canvas.
 * Normal mode → shows "Present" button + "Edit" button.
 * Fullscreen/Present mode → hides the top bar, shows a floating "Exit Present Mode" bar.
 * ESC exits fullscreen only (stays in preview). Only "Exit preview" navigates back to builder.
 */
@Component({
  selector: 'app-dashboard-preview',
  standalone: true,
  imports: [CommonModule, DashboardCanvasComponent],
  template: `
    <div class="pv-root">
      <!-- Normal header — hidden during fullscreen -->
      <header class="pv-top" [class.pv-top-hidden]="isFullscreen">
        <button class="pv-exit" (click)="exit()" title="Back to builder">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Exit preview
        </button>
        <h1 class="pv-title">{{ draft.name() }}</h1>
        <button class="pv-present" (click)="enterFullscreen()" title="Fullscreen presentation mode">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
          Present
        </button>
        <button class="pv-edit" (click)="exit()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          Edit
        </button>
      </header>

      <!-- Floating pill shown ONLY in fullscreen / present mode -->
      <div class="pv-present-bar" *ngIf="isFullscreen">
        <span class="pv-present-label">🎬 Present Mode</span>
        <button class="pv-exit-present" (click)="exitFullscreen()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
          Exit Present Mode
        </button>
      </div>

      <div class="pv-scroll">
        <div class="pv-canvas" *ngIf="draft.widgets().length; else empty">
          <app-dashboard-canvas [widgets]="liveWidgets" [readOnly]="false" (layoutChange)="onLayoutChange()"></app-dashboard-canvas>
        </div>
        <ng-template #empty>
          <div class="pv-empty">
            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
            <p>No widgets to preview yet.</p>
            <button class="pv-edit" (click)="exit()">Go to builder</button>
          </div>
        </ng-template>
      </div>
    </div>
  `,
  styles: [`
    .pv-root { position: fixed; inset: 0; z-index: 1000; background: #f4f6fb; display: flex; flex-direction: column;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }

    /* Header */
    .pv-top { height: 60px; flex-shrink: 0; background: white; border-bottom: 1px solid #e8ebf2;
      display: flex; align-items: center; gap: 16px; padding: 0 24px;
      transition: height 0.2s ease, opacity 0.2s ease; overflow: hidden; }
    .pv-top-hidden { height: 0 !important; opacity: 0; pointer-events: none; border: none; }

    .pv-exit { display: inline-flex; align-items: center; gap: 7px; border: 1px solid #e2e8f0; background: white;
      color: #475569; font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 9px; cursor: pointer; white-space: nowrap; }
    .pv-exit:hover { border-color: #cbd5e1; color: #2563eb; }
    .pv-title { flex: 1; margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: -0.3px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pv-present { display: inline-flex; align-items: center; gap: 7px; border: 1px solid #e2e8f0; background: white;
      color: #475569; font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 9px; cursor: pointer; white-space: nowrap; }
    .pv-present:hover { border-color: #2563eb; color: #2563eb; background: #eff6ff; }
    .pv-edit { display: inline-flex; align-items: center; gap: 7px; border: none; background: #2563eb; color: white;
      font-size: 13px; font-weight: 700; padding: 9px 18px; border-radius: 9px; cursor: pointer; white-space: nowrap; }
    .pv-edit:hover { background: #1d4ed8; }

    /* Floating present-mode bar (top-center pill) */
    .pv-present-bar {
      position: fixed; top: 0; left: 50%; transform: translateX(-50%);
      background: rgba(15,23,42,0.85); backdrop-filter: blur(10px);
      color: white; display: flex; align-items: center; gap: 20px;
      padding: 10px 24px; border-radius: 0 0 16px 16px; z-index: 9999;
      box-shadow: 0 6px 30px rgba(0,0,0,0.3);
      animation: slideDown 0.22s cubic-bezier(0.34,1.56,0.64,1); }
    @keyframes slideDown {
      from { opacity: 0; transform: translateX(-50%) translateY(-100%); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); } }
    .pv-present-label { font-size: 12px; font-weight: 600; opacity: 0.65; letter-spacing: 0.3px; }
    .pv-exit-present {
      display: inline-flex; align-items: center; gap: 8px;
      background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.22);
      color: white; padding: 7px 18px; border-radius: 9px;
      font-size: 13px; font-weight: 700; cursor: pointer; transition: background 0.15s; }
    .pv-exit-present:hover { background: rgba(255,255,255,0.28); }

    .pv-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; }
    .pv-canvas { padding: 28px; }
    .pv-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
      padding: 90px 20px; color: #94a3b8; }
    .pv-empty p { margin: 0; font-size: 15px; }
  `]
})
export class DashboardPreviewComponent implements OnDestroy {
  liveWidgets: WidgetSpec[] = [];
  isFullscreen = false;

  private fsChangeHandler = () => {
    this.isFullscreen = !!document.fullscreenElement;
  };

  constructor(public draft: DashboardDraftService, private router: Router) {
    this.liveWidgets = draft.widgets().map(w => ({ ...w }));
    document.addEventListener('fullscreenchange', this.fsChangeHandler);
  }

  ngOnDestroy(): void {
    document.removeEventListener('fullscreenchange', this.fsChangeHandler);
  }

  onLayoutChange(): void {
    this.draft.set(this.liveWidgets, this.draft.name(), this.draft.datasetKey());
  }

  /** ESC key: exit fullscreen only — stay on preview page. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  }

  enterFullscreen(): void {
    document.documentElement.requestFullscreen().catch(err => {
      console.error(`Fullscreen error: ${err.message}`);
    });
  }

  /** Exit fullscreen → drop back to normal preview (not builder). */
  exitFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  }

  /** Exit preview entirely → back to builder. */
  exit(): void {
    const qp: Record<string, any> = { returnFromPreview: true };
    if (this.draft.dashboardId()) {
      qp['dashboardId'] = this.draft.dashboardId();
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().then(() => this.router.navigate(['/builder'], { queryParams: qp }));
    } else {
      this.router.navigate(['/builder'], { queryParams: qp });
    }
  }
}
