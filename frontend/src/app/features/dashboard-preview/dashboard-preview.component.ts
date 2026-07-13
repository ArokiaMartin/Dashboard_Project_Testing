import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DashboardGridComponent } from '@features/dashboard-builder/dashboard-grid.component';
import { DashboardDraftService } from '@core/services/dashboard-draft.service';

/**
 * Full-screen, read-only preview of the dashboard currently on the builder canvas. Renders the exact
 * same widgets in the same grid positions the user arranged, with none of the builder chrome (no app
 * nav sidebar, top bar, column-selection rail, or move/resize handles). Sourced from DashboardDraftService,
 * which the builder keeps in sync, so this shows "the same dashboard" without a backend round-trip.
 */
@Component({
  selector: 'app-dashboard-preview',
  standalone: true,
  imports: [CommonModule, DashboardGridComponent],
  template: `
    <div class="pv-root">
      <header class="pv-top">
        <button class="pv-exit" (click)="exit()" title="Back to builder">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Exit preview
        </button>
        <h1 class="pv-title">{{ draft.name() }}</h1>
        <button class="pv-edit" (click)="exit()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          Edit
        </button>
      </header>

      <div class="pv-scroll">
        <div class="pv-canvas" *ngIf="draft.widgets().length; else empty">
          <app-dashboard-grid [widgets]="draft.widgets()" [readOnly]="true"></app-dashboard-grid>
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
    .pv-top { height: 60px; flex-shrink: 0; background: white; border-bottom: 1px solid #e8ebf2;
      display: flex; align-items: center; gap: 16px; padding: 0 24px; }
    .pv-exit { display: inline-flex; align-items: center; gap: 7px; border: 1px solid #e2e8f0; background: white;
      color: #475569; font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 9px; cursor: pointer; }
    .pv-exit:hover { border-color: #cbd5e1; color: #2563eb; }
    .pv-title { flex: 1; margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: -0.3px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pv-edit { display: inline-flex; align-items: center; gap: 7px; border: none; background: #2563eb; color: white;
      font-size: 13px; font-weight: 700; padding: 9px 18px; border-radius: 9px; cursor: pointer; }
    .pv-edit:hover { background: #1d4ed8; }
    .pv-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; }
    .pv-canvas { padding: 28px; }
    .pv-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
      padding: 90px 20px; color: #94a3b8; }
    .pv-empty p { margin: 0; font-size: 15px; }
  `]
})
export class DashboardPreviewComponent {
  constructor(public draft: DashboardDraftService, private router: Router) {}

  exit(): void { this.router.navigate(['/builder']); }
}
