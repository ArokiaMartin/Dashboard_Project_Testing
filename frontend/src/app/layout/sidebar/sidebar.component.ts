import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LayoutService } from '@core/services/layout.service';
import { ActiveDatasetService, DatasetFamily, NO_ACTIVE_DATASET } from '@core/services/active-dataset.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <div class="sidebar" [class.collapsed]="collapsed">
      <div class="logo-section">
        <img class="brand-logo" src="assets/hyland-logo.jpg" alt="Hyland" *ngIf="!collapsed" />
        <img class="logo-mark-img" src="assets/logo-mark.jpg" alt="Hyland" *ngIf="collapsed" />
      </div>
      <p class="subtitle" *ngIf="!collapsed">Analytics Suite</p>

      <div class="dataset-picker" *ngIf="!collapsed">
        <label>Active dataset</label>
        <select [value]="activeKey" (change)="onSelect($any($event.target).value)">
          <option value="__none__" [selected]="activeKey === NONE">Select a dataset…</option>
          <option *ngFor="let f of families" [value]="f.key" [selected]="f.key === activeKey">{{ f.label }}</option>
        </select>
      </div>

      <nav class="menu">
        <a routerLink="/home" routerLinkActive="active" class="menu-item" [title]="collapsed ? 'Home' : ''">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span *ngIf="!collapsed">Home</span>
        </a>
        <a routerLink="/upload-data" routerLinkActive="active" class="menu-item" [title]="collapsed ? 'Upload Data' : ''">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span *ngIf="!collapsed">Upload Data</span>
        </a>
        <a routerLink="/data" routerLinkActive="active" class="menu-item" [title]="collapsed ? 'Uploaded Data' : ''">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>
          <span *ngIf="!collapsed">Uploaded Data</span>
        </a>
        <a routerLink="/builder" routerLinkActive="active" class="menu-item" [title]="collapsed ? 'Dashboard Builder' : ''">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
          <span *ngIf="!collapsed">Dashboard Builder</span>
        </a>
        <a routerLink="/dashboards" routerLinkActive="active" class="menu-item" [title]="collapsed ? 'My Dashboards' : ''">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          <span *ngIf="!collapsed">My Dashboards</span>
        </a>
      </nav>

      <div class="settings-section" [class.collapsed]="collapsed">
        <a routerLink="/settings" routerLinkActive="active" class="menu-item" [title]="collapsed ? 'Settings' : ''">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span *ngIf="!collapsed">Settings</span>
        </a>
        <button class="collapse-btn" (click)="layout.toggleSidebar()" [title]="collapsed ? 'Expand sidebar' : 'Collapse sidebar'">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="16" rx="2"/>
            <line x1="9" y1="4" x2="9" y2="20"/>
            <polyline *ngIf="!collapsed" points="15 9 12.5 12 15 15"/>
            <polyline *ngIf="collapsed" points="13 9 15.5 12 13 15"/>
          </svg>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .sidebar {
      width: 210px;
      background: white;
      border-right: 1px solid #e8ebf2;
      padding: 22px 0;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow-y: auto;
      overflow-x: hidden;
      flex-shrink: 0;
      transition: width 0.22s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .sidebar.collapsed { width: 74px; }

    .logo-section {
      display: flex; align-items: center; justify-content: center;
      padding: 0 18px 8px; min-height: 40px;
    }
    .brand-logo { width: 140px; max-width: 100%; height: auto; display: block; margin-right: auto; }
    .logo-mark-img {
      width: 42px; height: 42px; border-radius: 10px;
      object-fit: contain; display: block;
    }

    .subtitle {
      margin: 0 0 14px; padding: 0 20px 16px;
      font-size: 12px; color: #94a3b8; font-weight: 500;
      border-bottom: 1px solid #eef1f6;
    }
    .sidebar.collapsed .logo-section { border-bottom: 1px solid #eef1f6; padding-bottom: 16px; margin-bottom: 8px; }

    .dataset-picker { padding: 0 16px 14px; margin-bottom: 6px; border-bottom: 1px solid #eef1f6; }
    .dataset-picker label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #94a3b8; margin-bottom: 6px; }
    .dataset-picker select {
      width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 9px;
      font-size: 13px; font-weight: 600; color: #334155; background: white; cursor: pointer;
    }
    .dataset-picker select:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }

    .menu { flex: 1; padding: 6px 12px; display: flex; flex-direction: column; gap: 2px; }

    .menu-item {
      display: flex; align-items: center; gap: 12px;
      padding: 11px 14px; color: #64748b; text-decoration: none;
      font-size: 14px; font-weight: 600; border-radius: 10px;
      transition: background 0.16s ease, color 0.16s ease; cursor: pointer;
      white-space: nowrap;
    }
    .menu-item svg { flex-shrink: 0; }
    .menu-item:hover { background: #f4f6fb; color: #2563eb; }
    .menu-item.active { background: #eff6ff; color: #2563eb; }
    .sidebar.collapsed .menu-item { justify-content: center; padding: 11px 0; }

    .settings-section {
      border-top: 1px solid #eef1f6; padding: 12px;
      display: flex; align-items: center; gap: 8px;
    }
    .settings-section .menu-item { flex: 1; }
    .settings-section.collapsed { flex-direction: column; gap: 6px; }

    .collapse-btn {
      width: 34px; height: 34px; flex-shrink: 0;
      border: 1px solid #e8ebf2; background: white; border-radius: 9px;
      color: #64748b; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s ease;
    }
    .collapse-btn:hover { border-color: #bfdbfe; color: #2563eb; background: #eff6ff; }
    .settings-section.collapsed .collapse-btn { width: 40px; }
  `]
})
export class SidebarComponent implements OnInit, OnDestroy {
  readonly NONE = NO_ACTIVE_DATASET;
  families: DatasetFamily[] = [];
  activeKey: string = NO_ACTIVE_DATASET;
  private subs = new Subscription();

  constructor(public layout: LayoutService, private active: ActiveDatasetService) {}

  ngOnInit(): void {
    this.subs.add(this.active.families$.subscribe((f) => (this.families = f)));
    this.subs.add(this.active.activeKey$.subscribe((key) => (this.activeKey = key)));
    this.active.ensureLoaded();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  onSelect(value: string): void {
    this.active.setActiveKey(value);
  }

  get collapsed(): boolean {
    return this.layout.sidebarCollapsed();
  }
}
