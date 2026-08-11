import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { SidebarComponent } from '@layout/sidebar/sidebar.component';
import { ThemeService } from '@core/services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, SidebarComponent],
  template: `
    <div class="app-shell">
      <app-sidebar></app-sidebar>
      <div class="content-area">
        <header class="topbar" [class.collapsed]="headerCollapsed">
          <div class="search-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input #globalSearch type="text" placeholder="Search dashboards by name…"
                   (keydown.enter)="searchDashboards(globalSearch.value)" />
            <button class="kbd" (click)="searchDashboards(globalSearch.value)" title="Go to My Dashboards">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>
          </div>
          <div class="topbar-actions">
            <button class="icon-pill theme-toggle" [title]="isDarkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'" (click)="toggleTheme()">
              <svg *ngIf="!isDarkMode" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
              <svg *ngIf="isDarkMode" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            </button>
            <div class="notif-wrapper" style="position: relative;">
              <button class="icon-pill" title="Help" (click)="toggleHelp($event)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </button>
              <div class="notif-dropdown" *ngIf="showHelp" (click)="$event.stopPropagation()">
                <div class="notif-header">
                  <h4>Application Help</h4>
                </div>
                <div class="notif-body help-body">
                  <ul class="help-list">
                    <li><strong>Upload Data:</strong> Ingest JSON schemas and tabular data.</li>
                    <li><strong>Dashboard Builder:</strong> Visualize your data with interactive charts.</li>
                    <li><strong>My Dashboards:</strong> Manage, edit, and organize all your views.</li>
                  </ul>
                  <a href="assets/Dashboard_End_User_Guide.pdf" target="_blank" class="help-link">View Full Documentation &rarr;</a>
                </div>
              </div>
            </div>
            <div class="notif-wrapper" style="position: relative;">
              <button class="icon-pill notif" title="Notifications" (click)="toggleNotifications($event)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              </button>
              <div class="notif-dropdown" *ngIf="showNotifs" (click)="$event.stopPropagation()">
                <div class="notif-header">
                  <h4>Notifications</h4>
                </div>
                <div class="notif-body">
                  <div class="caught-up-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                  </div>
                  <p>You're all caught up!</p>
                </div>
              </div>
            </div>
            <div class="user-chip" routerLink="/settings">
              <div class="avatar">AS</div>
              <div class="user-meta">
                <span class="user-name">Alexander S.</span>
                <span class="user-role">Admin Access</span>
              </div>
            </div>
            <button class="icon-pill toggle-header-btn" (click)="toggleHeader()" title="Collapse Header">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
            </button>
          </div>
        </header>
        <button class="expand-header-trigger" *ngIf="headerCollapsed" (click)="toggleHeader()" title="Expand Header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <main class="scroll-region">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styles: [`
    .app-shell {
      display: flex;
      height: 100vh;
      background: #f4f6fb;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .content-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .topbar {
      height: 68px;
      background: rgba(255,255,255,0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid #e8ebf2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 32px;
      flex-shrink: 0;
      z-index: 20;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      opacity: 1;
      overflow: visible;
    }

    .topbar.collapsed {
      height: 0px !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      border-bottom-width: 0px !important;
      opacity: 0 !important;
      overflow: hidden !important;
      pointer-events: none;
    }

    .toggle-header-btn {
      color: #64748b;
      margin-left: 4px;
    }

    .expand-header-trigger {
      position: absolute;
      top: 12px;
      right: 24px;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 1px solid #e8ebf2;
      background: white;
      color: #64748b;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(15,23,42,0.06);
      z-index: 30;
      animation: floatIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      transition: all 0.15s;
    }
    .expand-header-trigger:hover {
      color: #2563eb;
      border-color: #bfdbfe;
      background: #f8faff;
      transform: translateY(1px);
    }

    @keyframes floatIn {
      from { transform: translateY(-10px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .search-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #f4f6fb;
      border: 1px solid #e8ebf2;
      border-radius: 10px;
      padding: 9px 14px;
      width: 420px;
      transition: all 0.2s ease;
    }

    .search-wrap:focus-within {
      border-color: #2563eb;
      background: white;
      box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
    }

    .search-wrap input {
      border: none;
      background: transparent;
      outline: none;
      font-size: 14px;
      flex: 1;
      color: #374151;
    }

    .kbd {
      font-size: 11px;
      color: #9ca3af;
      background: white;
      border: 1px solid #e8ebf2;
      border-radius: 5px;
      padding: 4px 6px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .kbd:hover {
      color: #2563eb;
      border-color: #bfdbfe;
      background: #eff6ff;
    }

    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .icon-pill {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      border: 1px solid #e8ebf2;
      background: white;
      color: #64748b;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      position: relative;
    }

    .icon-pill:hover {
      color: #2563eb;
      border-color: #bfdbfe;
      background: #eff6ff;
    }

    .icon-pill .dot {
      position: absolute;
      top: 9px;
      right: 9px;
      width: 8px;
      height: 8px;
      background: #ef4444;
      border-radius: 50%;
      border: 2px solid white;
    }

    .user-chip {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 5px 12px 5px 5px;
      border: 1px solid #e8ebf2;
      border-radius: 12px;
      cursor: pointer;
      background: white;
      transition: all 0.2s ease;
    }

    .user-chip:hover {
      border-color: #bfdbfe;
      background: #f8faff;
    }

    .avatar {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
    }

    .user-meta {
      display: flex;
      flex-direction: column;
      line-height: 1.3;
    }

    .user-name {
      font-size: 13px;
      font-weight: 600;
      color: #1e293b;
    }

    .user-role {
      font-size: 11px;
      color: #94a3b8;
    }

    .scroll-region {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .notif-dropdown {
      position: absolute;
      top: 50px;
      right: 0;
      width: 280px;
      background: white;
      border: 1px solid #e8ebf2;
      border-radius: 12px;
      box-shadow: 0 12px 30px rgba(15,23,42,0.12);
      z-index: 50;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
      transform-origin: top right;
    }
    
    @keyframes popIn {
      0% { opacity: 0; transform: scale(0.95); }
      100% { opacity: 1; transform: scale(1); }
    }

    .notif-header {
      padding: 14px 16px;
      border-bottom: 1px solid #f1f5f9;
      background: #fafbfc;
    }

    .notif-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
    }

    .notif-body {
      padding: 30px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      text-align: center;
    }

    .caught-up-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #ecfdf5;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .notif-body p {
      margin: 0;
      font-size: 14px;
      color: #64748b;
      font-weight: 500;
    }

    .help-body {
      padding: 16px;
      align-items: flex-start;
      text-align: left;
      gap: 16px;
    }

    .help-list {
      margin: 0;
      padding: 0 0 0 16px;
      font-size: 13px;
      color: #475569;
      line-height: 1.6;
    }

    .help-list li {
      margin-bottom: 8px;
    }

    .help-list li:last-child {
      margin-bottom: 0;
    }

    .help-link {
      font-size: 13px;
      font-weight: 600;
      color: #2563eb;
      text-decoration: none;
      align-self: center;
    }

    .help-link:hover {
      text-decoration: underline;
    }

    @media (max-width: 768px) {
      .search-wrap { width: 200px; }
      .user-meta { display: none; }
    }
  `]
})
export class AppComponent {
  title = 'Dynamic Dashboard';
  showNotifs = false;
  showHelp = false;
  headerCollapsed = false;

  constructor(
    private router: Router,
    public themeService: ThemeService
  ) {}

  get isDarkMode(): boolean {
    return this.themeService.isDarkMode();
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  toggleHeader(): void {
    this.headerCollapsed = !this.headerCollapsed;
  }

  toggleHelp(event: MouseEvent): void {
    event.stopPropagation();
    this.showHelp = !this.showHelp;
    if (this.showHelp) this.showNotifs = false;
  }

  toggleNotifications(event: MouseEvent): void {
    event.stopPropagation();
    this.showNotifs = !this.showNotifs;
    if (this.showNotifs) this.showHelp = false;
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.showNotifs = false;
    this.showHelp = false;
  }

  /** Send the typed term to the My Dashboards page, which filters its list by dashboard name. */
  searchDashboards(term: string): void {
    const q = (term ?? '').trim();
    this.router.navigate(['/dashboards'], { queryParams: q ? { q } : {} });
  }
}
