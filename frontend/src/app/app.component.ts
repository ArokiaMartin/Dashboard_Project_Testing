import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { SidebarComponent } from './layout/sidebar/sidebar.component';
import { ThemeService } from './core/services/theme.service';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, SidebarComponent],
  template: `
    <ng-container *ngIf="isAuthPage">
      <router-outlet></router-outlet>
    </ng-container>

    <div class="app-shell" *ngIf="!isAuthPage">
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
            <!-- Dark/Light Theme Toggle -->
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

            <!-- Help Button -->
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

            <!-- Notifications Button -->
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

            <!-- Dynamic User Profile Chip with Popover Dropdown -->
            <div class="user-profile-wrapper">
              <div class="user-chip" (click)="toggleUserMenu($event)">
                <div class="avatar">{{ userInitials }}</div>
                <div class="user-meta">
                  <span class="user-name">{{ userName }}</span>
                  <span class="user-email-chip">{{ userEmail }}</span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 2px; flex-shrink: 0;">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>

              <!-- User Menu Dropdown -->
              <div class="user-dropdown" *ngIf="showUserMenu" (click)="$event.stopPropagation()">
                <div class="user-dropdown-header">
                  <div class="avatar lg">{{ userInitials }}</div>
                  <div class="user-dropdown-info">
                    <span class="ud-name">{{ userName }}</span>
                    <span class="ud-email">{{ userEmail }}</span>
                  </div>
                </div>
                <div class="ud-divider"></div>
                <div class="user-dropdown-menu">
                  <a routerLink="/settings" (click)="showUserMenu = false" class="ud-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="3"></circle>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    <span>Account Settings</span>
                  </a>
                  <button type="button" (click)="onLogout()" class="ud-item danger">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                      <polyline points="16 17 21 12 16 7"></polyline>
                      <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    <span>Sign Out</span>
                  </button>
                </div>
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

        <main class="page-content" [class.header-collapsed]="headerCollapsed">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styles: [`
    .app-shell {
      display: flex;
      height: 100vh;
      background: var(--bg-app, #f4f6fb);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .content-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      position: relative;
    }

    .topbar {
      height: 68px;
      background: var(--bg-surface, rgba(255,255,255,0.85));
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-color, #e8ebf2);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 32px;
      flex-shrink: 0;
      z-index: 200;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
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
      color: var(--text-secondary, #64748b);
      margin-left: 4px;
    }

    .expand-header-trigger {
      position: absolute;
      top: 12px;
      right: 24px;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 1px solid var(--border-color, #e8ebf2);
      background: var(--bg-surface, white);
      color: var(--text-secondary, #64748b);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(15,23,42,0.06);
      z-index: 300;
      transition: all 0.15s;
    }
    .expand-header-trigger:hover {
      color: var(--accent-primary, #2563eb);
      border-color: #bfdbfe;
      background: var(--bg-hover, #f8faff);
    }

    .search-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--bg-subtle, #f4f6fb);
      border: 1px solid var(--border-color, #e8ebf2);
      border-radius: 10px;
      padding: 9px 14px;
      width: 360px;
      transition: all 0.2s ease;
    }

    .search-wrap:focus-within {
      border-color: var(--accent-primary, #2563eb);
      background: var(--bg-surface, white);
      box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
    }

    .search-wrap input {
      border: none;
      background: transparent;
      outline: none;
      font-size: 13.5px;
      flex: 1;
      color: var(--text-primary, #374151);
    }

    .kbd {
      font-size: 11px;
      color: var(--text-muted, #9ca3af);
      background: var(--bg-surface, white);
      border: 1px solid var(--border-color, #e8ebf2);
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
      color: var(--accent-primary, #2563eb);
      border-color: #bfdbfe;
      background: var(--accent-subtle, #eff6ff);
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
      border: 1px solid var(--border-color, #e8ebf2);
      background: var(--bg-surface, white);
      color: var(--text-secondary, #64748b);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      position: relative;
    }

    .icon-pill:hover {
      color: var(--accent-primary, #2563eb);
      border-color: #bfdbfe;
      background: var(--accent-subtle, #eff6ff);
    }

    /* Dynamic User Profile Chip */
    .user-profile-wrapper {
      position: relative;
    }

    .user-chip {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 5px 12px 5px 5px;
      border: 1px solid var(--border-color, #e8ebf2);
      border-radius: 12px;
      cursor: pointer;
      background: var(--bg-surface, white);
      transition: all 0.2s ease;
    }

    .user-chip:hover {
      border-color: #bfdbfe;
      background: var(--accent-subtle, #f8faff);
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
      line-height: 1.2;
      text-align: left;
      max-width: 155px;
      overflow: hidden;
    }

    .user-name {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-primary, #1e293b);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .user-email-chip {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted, #94a3b8);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 1px;
    }

    /* Popover User Dropdown Menu */
    .user-dropdown {
      position: absolute;
      top: calc(100% + 10px);
      right: 0;
      width: 260px;
      background: var(--bg-surface, #ffffff);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 14px;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.15);
      z-index: 1000;
      padding: 8px;
      display: flex;
      flex-direction: column;
      animation: popIn 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
      transform-origin: top right;
    }

    @keyframes popIn {
      0% { opacity: 0; transform: scale(0.95); }
      100% { opacity: 1; transform: scale(1); }
    }

    .user-dropdown-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 10px 12px 10px;
    }

    .avatar.lg {
      width: 42px;
      height: 42px;
      font-size: 14px;
      border-radius: 10px;
      flex-shrink: 0;
    }

    .user-dropdown-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
    }

    .ud-name {
      font-size: 13.5px;
      font-weight: 700;
      color: var(--text-primary, #0f172a);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ud-email {
      font-size: 11.5px;
      color: var(--text-muted, #64748b);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 1px;
    }

    .ud-badge {
      display: inline-block;
      align-self: flex-start;
      margin-top: 5px;
      font-size: 10px;
      font-weight: 700;
      color: #2563eb;
      background: rgba(37, 99, 235, 0.1);
      padding: 2px 7px;
      border-radius: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .ud-divider {
      height: 1px;
      background: var(--border-color, #e2e8f0);
      margin: 4px 0 6px 0;
    }

    .user-dropdown-menu {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .ud-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary, #475569);
      border-radius: 8px;
      text-decoration: none;
      border: none;
      outline: none;
      background: transparent;
      cursor: pointer;
      width: 100%;
      text-align: left;
      transition: all 0.15s ease;
      box-sizing: border-box;
    }

    .ud-item:hover {
      background: var(--bg-hover, #f1f5f9);
      color: var(--accent-primary, #2563eb);
    }

    .ud-item.danger {
      color: #dc2626;
    }

    .ud-item.danger:hover {
      background: rgba(239, 68, 68, 0.1);
      color: #dc2626;
    }

    .notif-dropdown {
      position: absolute;
      top: 50px;
      right: 0;
      width: 280px;
      background: var(--bg-surface, white);
      border: 1px solid var(--border-color, #e8ebf2);
      border-radius: 12px;
      box-shadow: 0 12px 30px rgba(15,23,42,0.12);
      z-index: 500;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
      transform-origin: top right;
    }

    .notif-header {
      padding: 14px 16px;
      border-bottom: 1px solid var(--border-color, #f1f5f9);
      background: var(--bg-subtle, #fafbfc);
    }

    .notif-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: var(--text-primary, #0f172a);
    }

    .notif-body {
      padding: 24px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      text-align: center;
    }

    .caught-up-icon {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #ecfdf5;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .notif-body p {
      margin: 0;
      font-size: 13.5px;
      color: var(--text-secondary, #64748b);
      font-weight: 500;
    }

    .help-body {
      padding: 16px;
      align-items: flex-start;
      text-align: left;
      gap: 12px;
    }

    .help-list {
      margin: 0;
      padding: 0 0 0 16px;
      font-size: 12.5px;
      color: var(--text-secondary, #475569);
      line-height: 1.6;
    }

    .help-list li {
      margin-bottom: 6px;
    }

    .help-link {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--accent-primary, #2563eb);
      text-decoration: none;
      align-self: flex-start;
    }

    .help-link:hover {
      text-decoration: underline;
    }

    .page-content {
      flex: 1;
      overflow-y: auto;
      position: relative;
    }

    @media (max-width: 768px) {
      .search-wrap { width: 180px; }
      .user-meta { display: none; }
    }
  `]
})
export class AppComponent {
  title = 'Dynamic Dashboard';
  showNotifs = false;
  showHelp = false;
  showUserMenu = false;
  headerCollapsed = false;

  constructor(
    private router: Router,
    public themeService: ThemeService,
    public authService: AuthService
  ) {}

  get isAuthPage(): boolean {
    const url = this.router.url.split('?')[0];
    return url === '/login' || url === '/signup';
  }

  get isDarkMode(): boolean {
    return this.themeService.isDarkMode();
  }

  get userName(): string {
    return this.authService.currentUser()?.fullName || 'Alexander Martin';
  }

  get userEmail(): string {
    return this.authService.currentUser()?.email || 'alexander@hyland.com';
  }

  get userInitials(): string {
    const name = this.userName.trim();
    if (!name) return 'HM';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  toggleHeader(): void {
    this.headerCollapsed = !this.headerCollapsed;
  }

  toggleUserMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.showUserMenu = !this.showUserMenu;
    if (this.showUserMenu) {
      this.showNotifs = false;
      this.showHelp = false;
    }
  }

  toggleHelp(event: MouseEvent): void {
    event.stopPropagation();
    this.showHelp = !this.showHelp;
    if (this.showHelp) {
      this.showNotifs = false;
      this.showUserMenu = false;
    }
  }

  toggleNotifications(event: MouseEvent): void {
    event.stopPropagation();
    this.showNotifs = !this.showNotifs;
    if (this.showNotifs) {
      this.showHelp = false;
      this.showUserMenu = false;
    }
  }

  onLogout(): void {
    this.showUserMenu = false;
    this.authService.logout();
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.showNotifs = false;
    this.showHelp = false;
    this.showUserMenu = false;
  }

  searchDashboards(term: string): void {
    const q = (term ?? '').trim();
    this.router.navigate(['/dashboards'], { queryParams: q ? { q } : {} });
  }
}
