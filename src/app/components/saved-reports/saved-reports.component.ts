import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Saved {
  name: string;
  dataset: string;
  created: string;
  lastAccessed: string;
  views: number;
  size: string;
  starred: boolean;
  category: string;
  status: 'active' | 'archived';
}

@Component({
  selector: 'app-saved-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="head">
        <div>
          <h1>Saved Reports</h1>
          <p>Your bookmarked and frequently accessed analyses.</p>
        </div>
        <div class="search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input placeholder="Search reports, datasets…" [(ngModel)]="searchQuery" />
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background: #eff6ff; color: #2563eb;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20"/></svg>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ reports.length }}</div>
            <div class="stat-label">Total Reports</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: #fef3c7; color: #f59e0b;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 10.26 24 10.27 17.18 16.7 20.09 24.96 12 18.54 3.91 24.96 6.82 16.7 0 10.27 8.91 10.26 12 2"/></svg>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ starredCount }}</div>
            <div class="stat-label">Starred</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: #f3e8ff; color: #a855f7;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ totalViews }}</div>
            <div class="stat-label">Total Views</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: #dcfce7; color: #16a34a;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/></svg>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ activeReports }}</div>
            <div class="stat-label">Active</div>
          </div>
        </div>
      </div>

      <div class="filters-section">
        <div class="filter-group">
          <label>Filter by:</label>
          <div class="filter-buttons">
            <button [class.active]="selectedFilter === 'all'" (click)="selectedFilter = 'all'" class="filter-btn">All</button>
            <button [class.active]="selectedFilter === 'starred'" (click)="selectedFilter = 'starred'" class="filter-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 10.26 24 10.27 17.18 16.7 20.09 24.96 12 18.54 3.91 24.96 6.82 16.7 0 10.27 8.91 10.26 12 2"/></svg>
              Starred
            </button>
            <button [class.active]="selectedFilter === 'recent'" (click)="selectedFilter = 'recent'" class="filter-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Recently Used
            </button>
          </div>
        </div>
        <div class="filter-group">
          <label>Category:</label>
          <select [(ngModel)]="selectedCategory" class="category-dropdown">
            <option value="">All Categories</option>
            <option value="finance">Finance</option>
            <option value="operations">Operations</option>
            <option value="sales">Sales</option>
            <option value="analytics">Analytics</option>
          </select>
        </div>
      </div>

      <div class="card">
        <table class="tbl">
          <thead>
            <tr>
              <th style="width:48px"></th>
              <th>Report Name</th>
              <th>Category</th>
              <th>Views</th>
              <th>Last Accessed</th>
              <th>Created</th>
              <th>Size</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of getFilteredReports()" [class.archived]="r.status === 'archived'">
              <td>
                <button class="star" [class.on]="r.starred" (click)="r.starred = !r.starred">
                  <svg width="17" height="17" viewBox="0 0 24 24" [attr.fill]="r.starred ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 10.26 24 10.27 17.18 16.7 20.09 24.96 12 18.54 3.91 24.96 6.82 16.7 0 10.27 8.91 10.26 12 2"/></svg>
                </button>
              </td>
              <td>
                <div class="fcell">
                  <span class="fic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
                  <span class="name">{{ r.name }}</span>
                  <span class="dataset-label">{{ r.dataset }}</span>
                </div>
              </td>
              <td><span class="category-badge" [ngClass]="getCategoryClass(r.category)">{{ r.category }}</span></td>
              <td class="muted"><span class="view-badge">{{ r.views }}</span></td>
              <td class="muted">{{ r.lastAccessed }}</td>
              <td class="muted">{{ r.created }}</td>
              <td class="muted">{{ r.size }}</td>
              <td>
                <div class="row-actions">
                  <button class="row-btn" title="Open">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="13 3 23 3 23 13"/><line x1="23" y1="3" x2="13" y2="13"/></svg>
                  </button>
                  <button class="row-btn" title="Duplicate">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M20 2h-2a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>
                  </button>
                  <button class="row-btn" title="Share" (click)="openShareModal(r)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  </button>
                  <div class="dropdown-menu">
                    <button class="menu-item danger" title="Delete">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      Delete
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="modal-overlay" *ngIf="showShareModal" (click)="closeShareModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Share Report</h2>
            <button class="close-btn" (click)="closeShareModal()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <p class="modal-subtitle">Share "{{ selectedReport?.name }}" with others</p>
            <div class="share-link-section">
              <label>Shareable Link:</label>
              <div class="share-link-container">
                <input type="text" class="share-link-input" [value]="shareableLink" readonly />
                <button class="copy-btn" (click)="copyToClipboard()">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M20 2h-2a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>
                  {{ copyButtonText }}
                </button>
              </div>
              <p class="share-hint">Anyone with this link can view this report</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 28px 32px; max-width: 1400px; margin: 0 auto; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
    .head h1 { margin: 0 0 6px; font-size: 28px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    .head p { margin: 0; font-size: 14px; color: #64748b; }
    .search { display: flex; align-items: center; gap: 9px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 9px 13px; width: 280px; }
    .search input { border: none; background: none; outline: none; font-size: 13px; flex: 1; color: #334155; }

    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 28px; }
    .stat-card { background: white; border: 1px solid #e8ebf2; border-radius: 12px; padding: 20px; display: flex; align-items: center; gap: 16px; transition: all 0.2s; }
    .stat-card:hover { border-color: #bfdbfe; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .stat-icon { width: 48px; height: 48px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .stat-content { flex: 1; }
    .stat-value { font-size: 24px; font-weight: 700; color: #0f172a; }
    .stat-label { font-size: 12px; color: #64748b; margin-top: 4px; }

    .filters-section { margin-bottom: 24px; background: white; border: 1px solid #e8ebf2; border-radius: 12px; padding: 16px 20px; display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
    .filter-group { display: flex; align-items: center; gap: 12px; }
    .filter-group label { font-size: 13px; font-weight: 600; color: #334155; white-space: nowrap; }
    .filter-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
    .filter-btn { background: transparent; border: 1px solid #e2e8f0; color: #64748b; padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
    .filter-btn:hover { border-color: #cbd5e1; background: #f1f5f9; }
    .filter-btn.active { background: #2563eb; color: white; border-color: #2563eb; }

    .category-dropdown { padding: 7px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; color: #334155; background: white; cursor: pointer; transition: all 0.2s; }
    .category-dropdown:hover { border-color: #cbd5e1; background: #f8faff; }
    .category-dropdown:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }

    .card { background: white; border: 1px solid #e8ebf2; border-radius: 16px; padding: 0; overflow: hidden; }
    .tbl { width: 100%; border-collapse: collapse; }
    .tbl th { text-align: left; padding: 14px 16px; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid #eef1f6; background: #f8faff; }
    .tbl td { padding: 16px; font-size: 13px; color: #334155; border-bottom: 1px solid #f4f6fb; }
    .tbl tbody tr { transition: background 0.15s; }
    .tbl tbody tr:hover { background: #f8faff; }
    .tbl tbody tr.archived { opacity: 0.6; }
    .tbl tbody tr:last-child td { border-bottom: none; }

    .star { background: none; border: none; cursor: pointer; color: #cbd5e1; padding: 4px; display: flex; transition: color 0.2s; }
    .star:hover { color: #f59e0b; }
    .star.on { color: #f59e0b; }

    .fcell { display: flex; align-items: center; gap: 12px; font-weight: 500; }
    .fic { width: 32px; height: 32px; background: #eff6ff; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .name { color: #0f172a; }
    .dataset-label { font-size: 12px; color: #94a3b8; font-weight: 400; }

    .category-badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; }
    .category-badge.finance { background: #dbeafe; color: #1e40af; }
    .category-badge.operations { background: #fef3c7; color: #92400e; }
    .category-badge.sales { background: #fce7f3; color: #9f1239; }
    .category-badge.analytics { background: #e9d5ff; color: #6b21a8; }

    .view-badge { display: inline-block; background: #f1f5f9; padding: 3px 8px; border-radius: 4px; font-size: 12px; }
    .muted { color: #94a3b8; }

    .row-actions { display: flex; gap: 6px; position: relative; }
    .row-btn { background: transparent; border: none; color: #64748b; padding: 6px 8px; border-radius: 6px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
    .row-btn:hover { background: #eff6ff; color: #2563eb; }
    .row-btn.danger { color: #dc2626; }
    .row-btn.danger:hover { background: #fef2f2; }

    .dropdown-menu { position: absolute; right: 0; top: 100%; display: none; background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .menu-item { background: none; border: none; padding: 8px 16px; font-size: 12px; cursor: pointer; width: 100%; text-align: left; display: flex; align-items: center; gap: 8px; color: #334155; }
    .menu-item:hover { background: #f8faff; }
    .menu-item.danger { color: #dc2626; }
    .menu-item.danger:hover { background: #fef2f2; }

    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal-content { background: white; border-radius: 16px; box-shadow: 0 20px 25px rgba(0,0,0,0.15); width: 90%; max-width: 500px; animation: slideIn 0.3s ease-out; }
    @keyframes slideIn { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 24px; border-bottom: 1px solid #e8ebf2; }
    .modal-header h2 { margin: 0; font-size: 18px; font-weight: 700; color: #0f172a; }
    .close-btn { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; display: flex; transition: color 0.2s; }
    .close-btn:hover { color: #334155; }
    .modal-body { padding: 24px; }
    .modal-subtitle { margin: 0 0 16px; font-size: 13px; color: #64748b; }
    .share-link-section label { display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 8px; }
    .share-link-container { display: flex; gap: 8px; }
    .share-link-input { flex: 1; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; color: #334155; background: #f8faff; }
    .copy-btn { background: #2563eb; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s; white-space: nowrap; }
    .copy-btn:hover { background: #1d4ed8; }
    .share-hint { margin: 12px 0 0; font-size: 12px; color: #94a3b8; }
  `]
})
export class SavedReportsComponent {
  searchQuery = '';
  selectedFilter: 'all' | 'starred' | 'recent' = 'all';
  selectedCategory = '';
  showShareModal = false;
  selectedReport: Saved | null = null;
  shareableLink = '';
  copyButtonText = 'Copy';

  reports: Saved[] = [
    { name: 'Q3 Revenue Analysis', dataset: 'Q3_Revenue_Forecast.json', created: 'Oct 24, 2023', lastAccessed: 'Oct 28, 2023', views: 24, size: '2.4 MB', starred: true, category: 'finance', status: 'active' },
    { name: 'Supply Chain Overview', dataset: 'Global_Supply_Chain_Logs.json', created: 'Oct 22, 2023', lastAccessed: 'Oct 26, 2023', views: 18, size: '5.2 MB', starred: true, category: 'operations', status: 'active' },
    { name: 'Customer Churn Prediction', dataset: 'Customer_Churn_October.json', created: 'Oct 20, 2023', lastAccessed: 'Oct 25, 2023', views: 12, size: '1.8 MB', starred: false, category: 'analytics', status: 'active' },
    { name: 'Inventory Distribution', dataset: 'Inventory_Levels.json', created: 'Oct 18, 2023', lastAccessed: 'Oct 23, 2023', views: 8, size: '3.1 MB', starred: false, category: 'operations', status: 'active' },
    { name: 'Employee Performance', dataset: 'Employee_Performance.json', created: 'Oct 15, 2023', lastAccessed: 'Oct 24, 2023', views: 32, size: '1.2 MB', starred: true, category: 'analytics', status: 'active' },
    { name: 'Q2 Sales Pipeline', dataset: 'Q2_Sales_Data.json', created: 'Jul 10, 2023', lastAccessed: 'Oct 20, 2023', views: 15, size: '2.9 MB', starred: false, category: 'sales', status: 'active' }
  ];

  get starredCount(): number {
    return this.reports.filter(r => r.starred).length;
  }

  get totalViews(): number {
    return this.reports.reduce((sum, r) => sum + r.views, 0);
  }

  get activeReports(): number {
    return this.reports.filter(r => r.status === 'active').length;
  }

  getFilteredReports(): Saved[] {
    let filtered = this.reports;

    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(r => r.name.toLowerCase().includes(query) || r.dataset.toLowerCase().includes(query));
    }

    if (this.selectedCategory) {
      filtered = filtered.filter(r => r.category === this.selectedCategory);
    }

    if (this.selectedFilter === 'starred') {
      filtered = filtered.filter(r => r.starred);
    } else if (this.selectedFilter === 'recent') {
      filtered = [...filtered].sort((a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime());
    }

    return filtered;
  }

  getCategoryClass(category: string): string {
    return category;
  }

  openShareModal(report: Saved): void {
    this.selectedReport = report;
    this.shareableLink = `${window.location.origin}/reports/share/${this.generateShareId(report.name)}`;
    this.showShareModal = true;
    this.copyButtonText = 'Copy';
  }

  closeShareModal(): void {
    this.showShareModal = false;
    this.selectedReport = null;
  }

  copyToClipboard(): void {
    navigator.clipboard.writeText(this.shareableLink).then(() => {
      this.copyButtonText = 'Copied!';
      setTimeout(() => {
        this.copyButtonText = 'Copy';
      }, 2000);
    });
  }

  private generateShareId(reportName: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}${random}`;
  }
}
