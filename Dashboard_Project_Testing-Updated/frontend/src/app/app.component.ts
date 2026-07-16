import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { SidebarComponent } from '@layout/sidebar/sidebar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, SidebarComponent],
  template: `
    <div class="app-shell">
      <app-sidebar></app-sidebar>
      <div class="content-area">
        <header class="topbar">
          <div class="search-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input #globalSearch type="text" placeholder="Search dashboards by name…"
                   (keydown.enter)="searchDashboards(globalSearch.value)" />
            <span class="kbd">⏎</span>
          </div>
          <div class="topbar-actions">
            <button class="icon-pill" title="Help">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </button>
            <button class="icon-pill notif" title="Notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
              <span class="dot"></span>
            </button>
            <div class="user-chip">
              <div class="avatar">AS</div>
              <div class="user-meta">
                <span class="user-name">Alexander S.</span>
                <span class="user-role">Admin Access</span>
              </div>
            </div>
          </div>
        </header>
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
      padding: 2px 6px;
      font-weight: 600;
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

    @media (max-width: 768px) {
      .search-wrap { width: 200px; }
      .user-meta { display: none; }
    }
  `]
})
export class AppComponent {
  title = 'Dynamic Dashboard';

  constructor(private router: Router) {}

  /** Send the typed term to the My Dashboards page, which filters its list by dashboard name. */
  searchDashboards(term: string): void {
    const q = (term ?? '').trim();
    this.router.navigate(['/dashboards'], { queryParams: q ? { q } : {} });
  }
}
