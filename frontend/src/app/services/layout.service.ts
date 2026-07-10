import { Injectable, signal } from '@angular/core';

/**
 * Shared UI layout state that lives outside the router-outlet, so routed pages
 * (e.g. the data explorer's full-table view) can drive shell chrome such as the
 * left sidebar's collapsed state.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  /** Whether the main navigation sidebar is collapsed. */
  readonly sidebarCollapsed = signal(false);

  setSidebarCollapsed(collapsed: boolean): void {
    this.sidebarCollapsed.set(collapsed);
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update(v => !v);
  }
}
