import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DashboardService, DashboardRecord } from '@core/services/dashboard.service';
import { ActiveDatasetService } from '@core/services/active-dataset.service';
import { Chart, registerables } from 'chart.js';
import Fuse from 'fuse.js';

Chart.register(...registerables);

interface DashCard {
  id: string;
  name: string;
  edited: string;
  thumb: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page">
      <!-- Welcome banner -->
      <div class="welcome">
        <div class="welcome-text">
          <h1>Welcome, Alexander</h1>
          <p>Get started by uploading your data and schema. Once ingested, you can explore it and build dashboards.</p>
          <div class="welcome-actions">
            <button class="btn primary" routerLink="/upload-data">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload Data &amp; Schema
            </button>
            <button class="btn ghost" routerLink="/builder">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Create New Dashboard
            </button>
          </div>
        </div>
        <svg class="welcome-art" viewBox="0 0 220 140" fill="none">
          <path d="M20 110 Q60 60 100 80 T200 30" stroke="#c7d7f5" stroke-width="3" fill="none"/>
          <circle cx="100" cy="80" r="5" fill="#93b4f0"/>
          <circle cx="200" cy="30" r="5" fill="#93b4f0"/>
          <path d="M165 20 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" fill="#dbe6fb"/>
          <path d="M40 40 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#e6eefc"/>
        </svg>
      </div>

      <div class="home-layout">
        <!-- Left Column: Trend Graph -->
        <div class="left-col">
          <div class="chart-block">
            <div class="block-head">
              <h3>Dashboard Creation Trends</h3>
              <div class="chart-filters">
                <select class="filter-select" [(ngModel)]="timeFilter" (ngModelChange)="renderChart()">
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="year">This Year</option>
                  <option value="5years">Last 5 Years</option>
                </select>

                <div class="custom-ds-filter" (click)="$event.stopPropagation()">
                  <div class="ds-filter-trigger" (click)="toggleDsDropdown()">
                    <span>{{ getSelectedDatasetLabel() }}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </div>
                  <div class="ds-filter-menu" *ngIf="datasetDropdownOpen">
                    <input class="ds-filter-search" placeholder="Search datasets..." [ngModel]="datasetSearchTerm" (ngModelChange)="onDatasetSearch($event)" />
                    <div class="ds-filter-list">
                      <div class="ds-filter-item" (click)="toggleDatasetFilter('all')">
                        <input type="checkbox" [checked]="selectedDatasets.length === 0" (click)="$event.stopPropagation(); toggleDatasetFilter('all')" />
                        <span>All Datasets</span>
                      </div>
                      <div class="ds-filter-item" *ngFor="let ds of filteredDatasets" (click)="toggleDatasetFilter(ds.key)">
                        <input type="checkbox" [checked]="selectedDatasets.includes(ds.key)" (click)="$event.stopPropagation(); toggleDatasetFilter(ds.key)" />
                        <span>{{ ds.label }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="chart-container">
              <canvas #trendChart></canvas>
            </div>
          </div>
        </div>

        <!-- Right Column: Recent and Favorites -->
        <div class="right-col">
          <!-- Recent Dashboards -->
          <div class="dash-block">
            <div class="block-head">
              <h3>My Recent Dashboards</h3>
              <a routerLink="/dashboards" class="link" *ngIf="dashboards.length">View All</a>
            </div>
            <div class="dash-list" *ngIf="dashboards.length">
              <div class="dash-card-mini" *ngFor="let d of dashboards" (click)="openDashboard(d)">
                <div class="thumb-mini" [style.background]="d.thumb">
                  <svg viewBox="0 0 200 96" class="thumb-svg" preserveAspectRatio="none">
                    <rect x="16" y="52" width="16" height="36" rx="3" fill="rgba(255,255,255,.5)"/>
                    <rect x="42" y="34" width="16" height="54" rx="3" fill="rgba(255,255,255,.75)"/>
                    <rect x="68" y="44" width="16" height="44" rx="3" fill="rgba(255,255,255,.5)"/>
                    <rect x="94" y="24" width="16" height="64" rx="3" fill="rgba(255,255,255,.9)"/>
                    <rect x="120" y="40" width="16" height="48" rx="3" fill="rgba(255,255,255,.6)"/>
                    <rect x="146" y="30" width="16" height="58" rx="3" fill="rgba(255,255,255,.75)"/>
                  </svg>
                </div>
                <div class="dash-info">
                  <h4>{{ d.name }}</h4>
                  <div class="dash-edited">Last edited {{ d.edited }}</div>
                </div>
              </div>
            </div>
            <div class="dash-empty-mini" *ngIf="dashLoaded && !dashboards.length">
              <p>No recent dashboards</p>
              <span>Upload data & build one!</span>
            </div>
          </div>

          <!-- Favourite Dashboards -->
          <div class="dash-block">
            <div class="block-head">
              <h3>Favourite Dashboards</h3>
              <a routerLink="/dashboards" [queryParams]="{favorites: 'true'}" class="link" *ngIf="favoriteDashboards.length">View All</a>
            </div>
            <div class="dash-list" *ngIf="favoriteDashboards.length">
              <div class="dash-card-mini" *ngFor="let d of favoriteDashboards" (click)="openDashboard(d)">
                <div class="thumb-mini" [style.background]="d.thumb">
                  <svg viewBox="0 0 200 96" class="thumb-svg" preserveAspectRatio="none">
                    <rect x="16" y="52" width="16" height="36" rx="3" fill="rgba(255,255,255,.5)"/>
                    <rect x="42" y="34" width="16" height="54" rx="3" fill="rgba(255,255,255,.75)"/>
                    <rect x="68" y="44" width="16" height="44" rx="3" fill="rgba(255,255,255,.5)"/>
                    <rect x="94" y="24" width="16" height="64" rx="3" fill="rgba(255,255,255,.9)"/>
                    <rect x="120" y="40" width="16" height="48" rx="3" fill="rgba(255,255,255,.6)"/>
                    <rect x="146" y="30" width="16" height="58" rx="3" fill="rgba(255,255,255,.75)"/>
                  </svg>
                </div>
                <div class="dash-info">
                  <h4>{{ d.name }}</h4>
                  <div class="dash-edited">Last edited {{ d.edited }}</div>
                </div>
              </div>
            </div>
            <div class="dash-empty-mini" *ngIf="dashLoaded && !favoriteDashboards.length">
              <p>No favourite dashboards</p>
              <span>Mark a dashboard as favourite to access it quickly here.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 28px 32px; max-width: 1200px; margin: 0 auto; }

    /* Welcome */
    .welcome {
      background: white; border: 1px solid #e8ebf2; border-radius: 16px;
      padding: 34px 36px; margin-bottom: 22px; position: relative; overflow: hidden;
      display: flex; justify-content: space-between; align-items: center;
    }
    .welcome-text { max-width: 560px; z-index: 2; }
    .welcome h1 { margin: 0 0 10px; font-size: 30px; font-weight: 800; color: #0f172a; letter-spacing: -0.6px; }
    .welcome p { margin: 0 0 22px; font-size: 14px; color: #64748b; line-height: 1.6; }
    .welcome-actions { display: flex; gap: 12px; }
    .welcome-art { width: 220px; height: 140px; flex-shrink: 0; opacity: 0.9; }

    .btn { display: inline-flex; align-items: center; gap: 8px; padding: 11px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: all 0.18s ease; }
    .btn.primary { background: #2563eb; color: white; }
    .btn.primary:hover { background: #1d4ed8; }
    .btn.ghost { background: white; border-color: #e2e8f0; color: #334155; }
    .btn.ghost:hover { border-color: #cbd5e1; }
    .btn.light { background: #f1f5f9; color: #334155; padding: 9px 18px; font-size: 13px; }
    .btn.light:hover { background: #e2e8f0; }

    /* Layout Split */
    .home-layout { display: flex; gap: 24px; align-items: flex-start; }
    .left-col { flex: 1; min-width: 0; }
    .right-col { width: 420px; flex-shrink: 0; display: flex; flex-direction: column; gap: 24px; }
    
    /* Blocks */
    .chart-block, .dash-block { background: white; border: 1px solid #e8ebf2; border-radius: 16px; padding: 22px; }
    .block-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .block-head h3 { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; }
    .link { color: #2563eb; font-size: 13px; font-weight: 600; text-decoration: none; }
    .link:hover { color: #1d4ed8; }
    
    .chart-filters { display: flex; gap: 10px; align-items: center; }
    .filter-select { padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-weight: 600; color: #475569; background: white; cursor: pointer; outline: none; }
    .filter-select:focus { border-color: #2563eb; }

    .custom-ds-filter { position: relative; }
    .ds-filter-trigger { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-weight: 600; color: #475569; background: white; cursor: pointer; }
    .ds-filter-trigger:hover { border-color: #cbd5e1; }
    .ds-filter-menu { position: absolute; top: calc(100% + 4px); right: 0; width: 220px; background: white; border: 1px solid #e8ebf2; border-radius: 8px; box-shadow: 0 12px 30px rgba(15,23,42,0.1); z-index: 10; display: flex; flex-direction: column; padding: 6px; }
    .ds-filter-search { padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; outline: none; margin-bottom: 6px; }
    .ds-filter-search:focus { border-color: #2563eb; }
    .ds-filter-list { max-height: 200px; overflow-y: auto; }
    .ds-filter-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; font-size: 12.5px; font-weight: 600; color: #475569; border-radius: 6px; cursor: pointer; }
    .ds-filter-item:hover { background: #f1f5f9; color: #2563eb; }
    .ds-filter-item input[type="checkbox"] { margin: 0; cursor: pointer; width: 14px; height: 14px; }
    .ds-filter-empty { padding: 8px 10px; font-size: 12px; color: #94a3b8; text-align: center; }
    
    .chart-container { width: 100%; height: 380px; position: relative; margin-top: 10px; }

    /* Mini Dashboard Cards */
    .dash-list { display: flex; flex-direction: column; gap: 12px; }
    .dash-card-mini { display: flex; align-items: center; gap: 14px; background: white; border: 1px solid #e8ebf2; border-radius: 12px; padding: 12px; cursor: pointer; transition: all 0.2s ease; }
    .dash-card-mini:hover { box-shadow: 0 8px 24px rgba(15,23,42,0.08); transform: translateY(-2px); border-color: #dbe4f0; }
    .thumb-mini { width: 68px; height: 50px; border-radius: 8px; flex-shrink: 0; position: relative; overflow: hidden; }
    .thumb-mini .thumb-svg { position: absolute; bottom: -2px; left: -2px; width: 110%; height: 75%; }
    .dash-info { flex: 1; min-width: 0; }
    .dash-info h4 { margin: 0 0 4px; font-size: 14px; font-weight: 700; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dash-edited { font-size: 12px; color: #94a3b8; }
    
    .dash-empty-mini { padding: 24px 20px; text-align: center; color: #94a3b8; border: 1.5px dashed #e2e8f0; border-radius: 12px; }
    .dash-empty-mini p { margin: 0 0 4px; font-size: 14px; font-weight: 700; color: #475569; }
    .dash-empty-mini span { font-size: 12.5px; }

    @media (max-width: 1000px) {
      .home-layout { flex-direction: column; }
      .right-col { width: 100%; }
    }
    @media (max-width: 560px) {
      .page { padding: 18px; }
      .welcome-actions { flex-direction: column; align-items: stretch; }
      .welcome-art { display: none; }
    }
  `]
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  dashboards: DashCard[] = [];
  favoriteDashboards: DashCard[] = [];
  dashLoaded = false;
  private records: DashboardRecord[] = [];
  
  chartInstance?: Chart;
  @ViewChild('trendChart') trendChartRef?: ElementRef<HTMLCanvasElement>;

  timeFilter: 'week' | 'month' | 'year' | '5years' = 'year';
  selectedDatasets: string[] = [];
  datasetSearchTerm: string = '';
  datasetDropdownOpen: boolean = false;
  availableFamilies: {key: string, label: string}[] = [];
  filteredDatasets: {key: string, label: string}[] = [];

  private readonly cardGradients = [
    'linear-gradient(135deg,#1e3a8a,#2563eb)',
    'linear-gradient(135deg,#1e293b,#334155)',
    'linear-gradient(135deg,#0f766e,#14b8a6)',
    'linear-gradient(135deg,#b45309,#f59e0b)',
    'linear-gradient(135deg,#065f46,#10b981)'
  ];

  constructor(
    private router: Router,
    private dashboardService: DashboardService,
    private activeService: ActiveDatasetService
  ) {}

  ngOnInit(): void {
    this.activeService.ensureLoaded().then(() => {
      this.activeService.families$.subscribe(families => {
        this.availableFamilies = families.map(f => ({ key: f.key, label: f.label }));
        this.filteredDatasets = [...this.availableFamilies];
        if (this.dashLoaded) {
          this.renderChart();
        }
      });
      this.loadRecentDashboards();
    });
  }

  ngAfterViewInit(): void {
    if (this.dashLoaded) {
      this.renderChart();
    }
  }
  
  ngOnDestroy(): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }
  }

  private loadRecentDashboards(): void {
    this.dashboardService.listDashboardRecords('anonymous').subscribe({
      next: (records) => {
        this.records = records ?? [];
        this.processDashboards();
        this.dashLoaded = true;
        this.renderChart();
      },
      error: () => { this.dashLoaded = true; }
    });
  }

  private processDashboards(): void {
    const favIds = this.getFavoriteIds();
    const sorted = [...this.records].sort((a, b) => this.time(b.updated_at || b.created_at) - this.time(a.updated_at || a.created_at));
    
    this.dashboards = sorted.slice(0, 2).map((r, i) => this.toCard(r, i));
    this.favoriteDashboards = sorted.filter(r => favIds.has(r.dashboard_id)).slice(0, 2).map((r, i) => this.toCard(r, i));
  }
  
  private getFavoriteIds(): Set<string> {
    try {
      const stored = localStorage.getItem('dashboard-favorites');
      if (stored) return new Set(JSON.parse(stored));
    } catch {}
    return new Set();
  }

  private toCard(r: DashboardRecord, index: number): DashCard {
    return {
      id: r.dashboard_id,
      name: r.name,
      edited: this.formatEdited(r.updated_at || r.created_at),
      thumb: this.cardGradients[index % this.cardGradients.length]
    };
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick() {
    this.datasetDropdownOpen = false;
  }

  toggleDsDropdown(): void {
    this.datasetDropdownOpen = !this.datasetDropdownOpen;
    if (this.datasetDropdownOpen) {
      this.datasetSearchTerm = '';
      this.onDatasetSearch('');
    }
  }

  onDatasetSearch(q: string): void {
    this.datasetSearchTerm = q;
    if (!q.trim()) {
      this.filteredDatasets = [...this.availableFamilies];
      return;
    }
    const fuse = new Fuse(this.availableFamilies, { keys: ['label'], threshold: 0.4 });
    this.filteredDatasets = fuse.search(q).map((res: any) => res.item);
  }

  toggleDatasetFilter(key: string): void {
    if (key === 'all') {
      this.selectedDatasets = [];
    } else {
      const idx = this.selectedDatasets.indexOf(key);
      if (idx > -1) {
        this.selectedDatasets.splice(idx, 1);
      } else {
        this.selectedDatasets.push(key);
      }
    }
    this.renderChart();
  }

  getSelectedDatasetLabel(): string {
    if (this.selectedDatasets.length === 0) return 'All Datasets';
    if (this.selectedDatasets.length === 1) {
      const match = this.availableFamilies.find(d => d.key === this.selectedDatasets[0]);
      return match ? match.label : '1 Dataset';
    }
    return `${this.selectedDatasets.length} Datasets`;
  }
  
  renderChart(): void {
    if (!this.trendChartRef) return;
    
    const now = new Date();
    let labels: string[] = [];
    let groupingStrategy: (d: Date) => number;
    
    if (this.timeFilter === 'week') {
      labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      
      groupingStrategy = (d: Date) => {
        if (d < startOfWeek) return -1;
        return d.getDay();
      };
    } else if (this.timeFilter === 'month') {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
      
      groupingStrategy = (d: Date) => {
        if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return -1;
        return d.getDate() - 1;
      };
    } else if (this.timeFilter === '5years') {
      const currentY = now.getFullYear();
      labels = [String(currentY - 4), String(currentY - 3), String(currentY - 2), String(currentY - 1), String(currentY)];
      
      groupingStrategy = (d: Date) => {
        const y = d.getFullYear();
        if (y < currentY - 4 || y > currentY) return -1;
        return y - (currentY - 4);
      };
    } else {
      labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      groupingStrategy = (d: Date) => {
        if (d.getFullYear() !== now.getFullYear()) return -1;
        return d.getMonth();
      };
    }
    
    const counts = new Array(labels.length).fill(0);
    
    const filteredRecords = this.selectedDatasets.length === 0
      ? this.records
      : this.records.filter(r => {
          const k = this.activeService.dashboardFamilyKey(r);
          return k && this.selectedDatasets.includes(k);
        });
    
    for (const r of filteredRecords) {
      const date = new Date(r.created_at || r.updated_at);
      const idx = groupingStrategy(date);
      if (idx === -1) continue;
      counts[idx]++;
    }

    const datasets = [{
      label: 'Dashboards Created',
      data: counts,
      borderColor: '#2563eb',
      backgroundColor: 'rgba(37, 99, 235, 0.1)',
      borderWidth: 3,
      pointBackgroundColor: '#2563eb',
      tension: 0.3,
      fill: true
    }];

    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    this.chartInstance = new Chart(this.trendChartRef.nativeElement, {
      type: 'line',
      data: {
        labels: labels,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            usePointStyle: true,
            boxPadding: 8
          }
        },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
          x: { 
            grid: { display: false },
            ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 }
          }
        },
        interaction: { mode: 'index', axis: 'x', intersect: false }
      }
    });
  }

  openDashboard(d: DashCard): void {
    this.router.navigate(['/builder'], { queryParams: { dashboardId: d.id } });
  }

  private time(v: string): number { const t = new Date(v).getTime(); return Number.isFinite(t) ? t : 0; }

  private formatEdited(value: string): string {
    const t = new Date(value).getTime();
    if (!Number.isFinite(t)) return 'recently';
    const ms = Date.now() - t, min = 60000, hr = 60 * min, day = 24 * hr;
    if (ms < hr) return `${Math.max(1, Math.floor(ms / min))}m ago`;
    if (ms < day) return `${Math.floor(ms / hr)}h ago`;
    return `${Math.floor(ms / day)}d ago`;
  }
}
