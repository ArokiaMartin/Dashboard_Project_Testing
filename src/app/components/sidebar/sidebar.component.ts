import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <div class="sidebar">
      <div class="logo-section">
        <img class="brand-logo" src="assets/hyland-logo.webp" alt="Hyland" />
        <p class="subtitle">Analytics Suite</p>
      </div>

      <nav class="menu">
        <a routerLink="/home" routerLinkActive="active" class="menu-item">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Home</span>
        </a>
        <a routerLink="/reports" routerLinkActive="active" class="menu-item">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
          <span>Reports</span>
        </a>
        <a routerLink="/builder" routerLinkActive="active" class="menu-item">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
          <span>Dashboard Builder</span>
        </a>
        <a routerLink="/dashboards" routerLinkActive="active" class="menu-item">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          <span>My Dashboards</span>
        </a>
        <a routerLink="/saved" routerLinkActive="active" class="menu-item">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 10.26 24 10.27 17.18 16.7 20.09 24.96 12 18.54 3.91 24.96 6.82 16.7 0 10.27 8.91 10.26 12 2"/></svg>
          <span>Saved Reports</span>
        </a>
      </nav>

      <div class="settings-section">
        <a routerLink="/settings" routerLinkActive="active" class="menu-item">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>Settings</span>
        </a>
      </div>
    </div>
  `,
  styles: [`
    .sidebar {
      width: 250px;
      background: white;
      border-right: 1px solid #e8ebf2;
      padding: 22px 0;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow-y: auto;
      flex-shrink: 0;
    }

    .logo-section {
      padding: 0 22px 22px;
      border-bottom: 1px solid #eef1f6;
      margin-bottom: 10px;
    }
    .brand-logo { width: 150px; max-width: 100%; height: auto; display: block; }
    .subtitle { margin: 10px 0 0; font-size: 12px; color: #94a3b8; font-weight: 500; }

    .menu { flex: 1; padding: 6px 12px; display: flex; flex-direction: column; gap: 2px; }

    .menu-item {
      display: flex; align-items: center; gap: 12px;
      padding: 11px 14px; color: #64748b; text-decoration: none;
      font-size: 14px; font-weight: 600; border-radius: 10px;
      transition: all 0.16s ease; cursor: pointer;
    }
    .menu-item svg { flex-shrink: 0; }
    .menu-item:hover { background: #f4f6fb; color: #2563eb; }
    .menu-item.active { background: #eff6ff; color: #2563eb; }

    .settings-section { border-top: 1px solid #eef1f6; padding: 12px; margin-top: 8px; }
  `]
})
export class SidebarComponent {}
