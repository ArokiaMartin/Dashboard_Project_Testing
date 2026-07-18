import { Component, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, NavigationEnd } from '@angular/router';
import { DashboardRecord, DashboardWidgetRecord, DashboardService, SaveDashboardRequest } from '@core/services/dashboard.service';
import { ActiveDatasetService, DatasetFamily, NO_ACTIVE_DATASET } from '@core/services/active-dataset.service';
import { Subscription } from 'rxjs';
import Fuse from 'fuse.js';

interface DashItem {
  id: string;
  name: string;
  desc: string;
  edited: string;
  views: number;
  thumb: string;
  isFavorite: boolean;
  userId: string;
  createdAt: string;
}

@Component({
  selector: 'app-dashboards',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page">
      <div class="head">
        <div>
          <h1>{{ showFavoritesOnly ? 'Favourite Dashboards' : 'My Dashboards' }}</h1>
          <p>{{ showFavoritesOnly ? 'Your starred analytics dashboards.' : 'Build, customize, and share interactive analytics dashboards.' }}</p>
        </div>
        <button class="btn primary" routerLink="/builder">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create Dashboard
        </button>
      </div>

      <!-- Filter Bar: Dataset Picker & Search Toolbar -->
      <div class="ds-bar" *ngIf="datasetFamilies.length || totalDashboards > 0 || isSearching">
        <div class="ds-left-group">
          <div class="ds-picker-group" *ngIf="datasetFamilies.length">
            <label class="ds-label">Dataset</label>
            <div class="custom-ds-filter" (click)="$event.stopPropagation()">
              <div class="ds-filter-trigger" (click)="toggleDsDropdown($event)">
                <span>{{ getSelectedDatasetLabel() }}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
              <div class="ds-filter-menu" *ngIf="datasetDropdownOpen">
                <input class="ds-filter-search" placeholder="Search datasets..." [ngModel]="datasetSearchTerm" (ngModelChange)="onDatasetSearch($event)" />
                <div class="ds-filter-list">
                  <div class="ds-filter-item" (click)="toggleDatasetFilter('all')">
                    <input type="checkbox" [checked]="selectedDatasets.length === 0" (click)="$event.stopPropagation(); toggleDatasetFilter('all')" />
                    <span>All dashboards</span>
                  </div>
                  <div class="ds-filter-item" *ngFor="let f of filteredDatasetFamilies" (click)="toggleDatasetFilter(f.key)">
                    <input type="checkbox" [checked]="selectedDatasets.includes(f.key)" (click)="$event.stopPropagation(); toggleDatasetFilter(f.key)" />
                    <span>{{ f.label }}</span>
                  </div>
                  <div class="ds-filter-empty" *ngIf="filteredDatasetFamilies.length === 0">No datasets match</div>
                </div>
              </div>
            </div>
          </div>

          <div class="toolbar" *ngIf="!loading && !error && (totalDashboards > 0 || isSearching)">
            <div class="search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input [(ngModel)]="filter" (ngModelChange)="onFilter($event)" placeholder="Search dashboards by name…" />
              <button class="clear" *ngIf="filter" (click)="onFilter('')" title="Clear search">&#10005;</button>
            </div>
            <span class="count">{{ filteredDashboards.length }} of {{ baseCount }}</span>
          </div>
        </div>

        <div class="ds-right-group" *ngIf="!loading && !error && filteredDashboards.length > 0">
          <div class="view-toggle">
            <button class="vt-btn" [class.active]="viewType === 'grid'" (click)="setViewType('grid')" title="Grid view">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </button>
            <button class="vt-btn" [class.active]="viewType === 'list'" (click)="setViewType('list')" title="List view">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>

      <p class="state" *ngIf="loading">Loading dashboards from database...</p>
      <p class="state error" *ngIf="!loading && error">{{ error }}</p>
      <p class="state" *ngIf="!loading && !error && totalDashboards === 0">No dashboards saved yet.</p>
      <p class="state" *ngIf="!loading && !error && isSearching && filteredDashboards.length === 0">No dashboards match "{{ filter }}".</p>
      <p class="state" *ngIf="!loading && !error && !isSearching && totalDashboards > 0 && dashboards.length === 0">No dashboards for the current dataset yet.</p>

      <div class="grid" *ngIf="!loading && !error && filteredDashboards.length > 0 && viewType === 'grid'">
        <div class="dash" *ngFor="let d of filteredDashboards" (click)="openDashboard(d)">
          <div class="card-menu" (click)="$event.stopPropagation()">
            <button class="card-fav" [class.active]="d.isFavorite" (click)="toggleFavorite(d, $event)" [title]="d.isFavorite ? 'Remove from favorites' : 'Add to favorites'">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            </button>
            <button class="card-dots" (click)="toggleMenu(d.id, $event)" title="Options">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>
            </button>
            <div class="card-dropdown" *ngIf="menuOpenId === d.id">
              <button (click)="startRename(d, $event)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Rename
              </button>
              <button (click)="shareDashboard(d, $event)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                Share Link
              </button>
              <button class="danger" (click)="deleteDashboard(d, $event)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                Delete
              </button>
            </div>
          </div>
          <div class="thumb" [style.background]="d.thumb">
            <svg viewBox="0 0 200 96" class="thumb-svg" preserveAspectRatio="none">
              <rect x="16" y="52" width="16" height="36" rx="3" fill="rgba(255,255,255,.5)"/>
              <rect x="42" y="34" width="16" height="54" rx="3" fill="rgba(255,255,255,.75)"/>
              <rect x="68" y="44" width="16" height="44" rx="3" fill="rgba(255,255,255,.5)"/>
              <rect x="94" y="24" width="16" height="64" rx="3" fill="rgba(255,255,255,.9)"/>
              <rect x="120" y="40" width="16" height="48" rx="3" fill="rgba(255,255,255,.6)"/>
              <rect x="146" y="30" width="16" height="58" rx="3" fill="rgba(255,255,255,.75)"/>
            </svg>
          </div>
          <div class="dash-body">
            <div class="dash-title-row" *ngIf="renamingId !== d.id">
              <h3>{{ d.name }}</h3>
              <button class="edit-btn" (click)="startRename(d, $event)" title="Rename Dashboard">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
            </div>
            <input *ngIf="renamingId === d.id" class="rename-input" [value]="d.name"
                   (click)="$event.stopPropagation()"
                   (keydown.enter)="commitRename(d, $any($event.target).value)"
                   (keydown.escape)="renamingId = null"
                   (blur)="commitRename(d, $any($event.target).value)" />
            <p>{{ d.desc }}</p>
            <div class="meta">
              <span>Edited {{ d.edited }}</span>
              <span class="views">{{ d.views }} views</span>
            </div>
          </div>
          <div class="actions">
            <button class="a ghost" (click)="previewDashboard(d); $event.stopPropagation()">View</button>
            <button class="a ghost" (click)="shareDashboard(d, $event); $event.stopPropagation()" title="Copy shareable link">Share</button>
            <button class="a icon danger" (click)="deleteDashboard(d, $event)"
                    [disabled]="deletingId === d.id" title="Delete dashboard">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- List View Table -->
      <div class="table-container" *ngIf="!loading && !error && filteredDashboards.length > 0 && viewType === 'list'">
        <table class="dash-table">
          <thead>
            <tr>
              <th width="40" style="text-align: center;"></th>
              <th>Dashboard Name</th>
              <th>Dataset / Built From</th>
              <th>Created At</th>
              <th>Last Edited</th>
              <th width="150" style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let d of filteredDashboards" (click)="openDashboard(d)" class="table-row">
              <td (click)="$event.stopPropagation()" style="text-align: center;">
                <button class="table-fav" [class.active]="d.isFavorite" (click)="toggleFavorite(d, $event)" [title]="d.isFavorite ? 'Remove from favorites' : 'Add to favorites'">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                  </svg>
                </button>
              </td>
              <td class="name-cell">
                <div class="table-rename-row" *ngIf="renamingId !== d.id">
                  <span class="table-dash-name">{{ d.name }}</span>
                  <button class="table-rename-btn" (click)="startRename(d, $event)" title="Rename Dashboard">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  </button>
                </div>
                <input *ngIf="renamingId === d.id" class="table-rename-input" [value]="d.name"
                       (click)="$event.stopPropagation()"
                       (keydown.enter)="commitRename(d, $any($event.target).value)"
                       (keydown.escape)="renamingId = null"
                       (blur)="commitRename(d, $any($event.target).value)" />
              </td>
              <td class="desc-cell">{{ d.desc }}</td>
              <td class="date-cell">{{ d.createdAt }}</td>
              <td class="date-cell">Edited {{ d.edited }}</td>
              <td style="text-align: right;" (click)="$event.stopPropagation()">
                <div class="table-actions">
                  <button class="ta-btn" (click)="openDashboard(d)" title="Edit dashboard">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="ta-btn" (click)="previewDashboard(d)" title="View dashboard">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                  <button class="ta-btn" (click)="shareDashboard(d, $event)" title="Copy shareable link">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                  </button>
                  <button class="ta-btn danger" (click)="deleteDashboard(d, $event)" [disabled]="deletingId === d.id" title="Delete dashboard">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Toast notification -->
      <div class="toast" *ngIf="shareMessage" (click)="shareMessage = ''">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <span>{{ shareMessage }}</span>
      </div>
  `,
  styles: [`
    .page { padding: 28px 32px; max-width: 1300px; margin: 0 auto; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 26px; }
    .head h1 { margin: 0 0 6px; font-size: 26px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    .head p { margin: 0; font-size: 14px; color: #64748b; }
    .btn { display: inline-flex; align-items: center; gap: 8px; padding: 11px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; }
    .btn.primary { background: #2563eb; color: white; }
    .btn.primary:hover { background: #1d4ed8; }

    .ds-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; width: 100%; }
    .ds-left-group { display: flex; align-items: center; gap: 20px; flex: 1; flex-wrap: wrap; }
    .ds-right-group { display: flex; align-items: center; flex-shrink: 0; }
    .ds-picker-group { display: flex; align-items: center; gap: 12px; }
    .toolbar { display: flex; align-items: center; gap: 14px; margin: 0; }
    .ds-label { font-size: 13px; font-weight: 600; color: #475569; }
    .custom-ds-filter { position: relative; }
    .ds-filter-trigger { display: flex; align-items: center; gap: 6px; padding: 9px 14px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 14px; font-weight: 600; color: #475569; background: white; cursor: pointer; min-width: 240px; justify-content: space-between; }
    .ds-filter-trigger:hover { border-color: #cbd5e1; }
    .ds-filter-menu { position: absolute; top: calc(100% + 4px); left: 0; width: 240px; background: white; border: 1px solid #e8ebf2; border-radius: 9px; box-shadow: 0 12px 30px rgba(15,23,42,0.1); z-index: 50; display: flex; flex-direction: column; padding: 8px; }
    .ds-filter-search { padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12.5px; outline: none; margin-bottom: 6px; }
    .ds-filter-search:focus { border-color: #2563eb; }
    .ds-filter-list { max-height: 200px; overflow-y: auto; }
    .ds-filter-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; font-size: 12.5px; font-weight: 600; color: #475569; border-radius: 6px; cursor: pointer; }
    .ds-filter-item:hover { background: #f1f5f9; color: #2563eb; }
    .ds-filter-item input[type="checkbox"] { margin: 0; cursor: pointer; width: 14px; height: 14px; }
    .ds-filter-empty { padding: 8px 10px; font-size: 12px; color: #94a3b8; text-align: center; }
    .search { display: flex; align-items: center; gap: 9px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; width: 340px; max-width: 100%; }
    .search:focus-within { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
    .search input { border: none; background: none; outline: none; font-size: 14px; flex: 1; color: #334155; }
    .search .clear { background: none; border: none; color: #cbd5e1; font-size: 12px; cursor: pointer; padding: 2px 4px; line-height: 1; }
    .search .clear:hover { color: #64748b; }
    .count { font-size: 13px; color: #94a3b8; font-weight: 500; }

    /* View toggle style */
    .view-toggle { display: flex; background: #f1f5f9; border-radius: 9px; padding: 3px; }
    .vt-btn { border: none; background: none; padding: 6px 9px; color: #64748b; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.1s; }
    .vt-btn.active { background: white; color: #2563eb; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
    .vt-btn:hover:not(.active) { color: #334155; }

    /* Table view styling */
    .table-container { background: white; border: 1.5px solid #e8ebf2; border-radius: 12px; overflow: hidden; margin-top: 12px; width: 100%; }
    .dash-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13.5px; }
    .dash-table th { background: #f8fafc; padding: 12px 16px; font-weight: 700; color: #475569; border-bottom: 1.5px solid #e2e8f0; font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.5px; }
    .dash-table td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: middle; }
    .table-row { cursor: pointer; transition: background 0.1s; }
    .table-row:hover { background: #f8fafc; }
    .table-row:last-child td { border-bottom: none; }

    .table-fav { background: none; border: none; color: #cbd5e1; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px; border-radius: 6px; transition: all 0.12s; }
    .table-fav:hover { color: #64748b; background: #f1f5f9; }
    .table-fav.active { color: #f59e0b; fill: #f59e0b; }

    .name-cell { font-weight: 600; color: #0f172a; }
    .table-rename-row { display: flex; align-items: center; gap: 8px; }
    .table-rename-btn { background: none; border: none; color: #94a3b8; cursor: pointer; opacity: 0; padding: 2px; border-radius: 4px; transition: all 0.1s; display: flex; align-items: center; }
    .table-row:hover .table-rename-btn { opacity: 1; }
    .table-rename-btn:hover { color: #2563eb; background: #eff6ff; }
    .table-rename-input { padding: 5px 8px; border: 1.5px solid #2563eb; border-radius: 6px; font-size: 13px; font-weight: 600; outline: none; width: 220px; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }

    .desc-cell { color: #64748b; font-weight: 500; }
    .date-cell { color: #64748b; font-weight: 500; }

    .table-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
    .ta-btn { background: none; border: 1px solid #e2e8f0; color: #64748b; cursor: pointer; padding: 7px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; transition: all 0.12s; }
    .ta-btn:hover { color: #2563eb; border-color: #93c5fd; background: #eff6ff; }
    .ta-btn.danger:hover { color: #ef4444; border-color: #fca5a5; background: #fef2f2; }

    .state { margin: 4px 0 18px; color: #64748b; font-size: 14px; }
    .state.error { color: #b91c1c; }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 22px; }
    .dash { position: relative; background: white; border: 1px solid #e8ebf2; border-radius: 16px; overflow: hidden; cursor: pointer; transition: all 0.2s ease; }
    .dash:hover { box-shadow: 0 12px 30px rgba(15,23,42,0.1); transform: translateY(-3px); border-color: #dbe4f0; }
    .card-menu { position: absolute; top: 10px; right: 10px; z-index: 5; display: flex; gap: 6px; }
    .card-fav { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; border: none; background: rgba(255,255,255,0.85); color: #64748b; cursor: pointer; backdrop-filter: blur(2px); box-shadow: 0 2px 6px rgba(15,23,42,0.12); transition: all 0.15s; }
    .card-fav:hover { background: white; color: #f59e0b; }
    .card-fav.active { color: #f59e0b; background: white; }
    .card-fav.active svg { fill: #f59e0b; }
    .card-dots { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; border: none; background: rgba(255,255,255,0.85); color: #475569; cursor: pointer; backdrop-filter: blur(2px); box-shadow: 0 2px 6px rgba(15,23,42,0.12); }
    .card-dots:hover { background: white; color: #2563eb; }
    .card-dropdown { position: absolute; top: 36px; right: 0; min-width: 150px; background: white; border: 1px solid #e8ebf2; border-radius: 10px; box-shadow: 0 12px 30px rgba(15,23,42,0.16); padding: 6px; display: flex; flex-direction: column; }
    .card-dropdown button { display: flex; align-items: center; gap: 9px; padding: 9px 10px; border: none; background: none; border-radius: 7px; font-size: 13px; font-weight: 600; color: #334155; cursor: pointer; text-align: left; }
    .card-dropdown button:hover { background: #f1f5f9; }
    .card-dropdown button.danger { color: #dc2626; }
    .card-dropdown button.danger:hover { background: #fef2f2; }
    .rename-input { width: 100%; box-sizing: border-box; padding: 6px 9px; margin: 0 0 5px; border: 1.5px solid #2563eb; border-radius: 8px; font-size: 15px; font-weight: 700; color: #0f172a; outline: none; }
    .thumb { height: 120px; display: flex; align-items: flex-end; }
    .thumb-svg { width: 100%; height: 96px; }
    .dash-body { padding: 18px 18px 12px; }
    .dash-body h3 { margin: 0; }
    .dash-body p { margin: 0 0 14px; font-size: 13px; color: #94a3b8; line-height: 1.5; }
    .meta { display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8; padding-top: 12px; border-top: 1px solid #f1f5f9; }
    .views { font-weight: 600; }
    .actions { display: flex; gap: 6px; padding: 0 18px 18px; }
    .a { flex: 1; padding: 9px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #2563eb; background: #2563eb; color: white; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .a:hover { background: #1d4ed8; }
    .a.ghost { background: white; color: #475569; border-color: #e2e8f0; }
    .a.ghost:hover { border-color: #cbd5e1; color: #2563eb; }
    .a.icon { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; padding: 9px 11px; }
    .a.danger { background: white; color: #64748b; border-color: #e2e8f0; }
    .a.danger:hover { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
    .a:disabled { opacity: 0.5; cursor: default; }

    .dash-title-row { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; justify-content: space-between; }
    .dash-title-row h3 { margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; }
    .dash-body .edit-btn { background: none; border: none; padding: 2px; color: #94a3b8; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; transition: all 0.15s; flex-shrink: 0; }
    .dash-body .edit-btn:hover { color: #2563eb; background: #eff6ff; }

    .toast { position: fixed; bottom: 24px; right: 24px; background: #0f172a; color: white; padding: 12px 20px; border-radius: 10px; display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; box-shadow: 0 10px 30px rgba(0,0,0,0.15); z-index: 9999; cursor: pointer; animation: toastIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
    @keyframes toastIn { from { transform: translateY(20px) scale(0.9); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
  `]
})
export class DashboardsComponent implements OnDestroy {
  dashboards: DashItem[] = [];
  loading = true;
  error = '';
  filter = '';
  deletingId: string | null = null;
  menuOpenId: string | null = null;
  renamingId: string | null = null;
  showFavoritesOnly = false;
  private favoriteIds = new Set<string>();
  private records: DashboardRecord[] = [];
  private schemaSub?: Subscription;
  private familiesSub?: Subscription;

  /** Selectable dataset families for the picker (newest first). */
  datasetFamilies: DatasetFamily[] = [];
  filteredDatasetFamilies: DatasetFamily[] = [];
  selectedDatasets: string[] = [];
  datasetDropdownOpen = false;
  datasetSearchTerm = '';
  /** Sentinel value used by the picker's placeholder option ("nothing selected"). */
  readonly noneKey = NO_ACTIVE_DATASET;

  private readonly cardGradients = [
    'linear-gradient(135deg,#1e3a8a,#2563eb)',
    'linear-gradient(135deg,#1e293b,#334155)',
    'linear-gradient(135deg,#0f766e,#14b8a6)',
    'linear-gradient(135deg,#b45309,#f59e0b)',
    'linear-gradient(135deg,#065f46,#10b981)'
  ];

  private routeSub?: Subscription;
  private routerEventsSub?: Subscription;

  viewType: 'grid' | 'list' = 'grid';

  setViewType(type: 'grid' | 'list'): void {
    this.viewType = type;
    const key = this.showFavoritesOnly ? 'favorites-view-type' : 'dashboards-view-type';
    localStorage.setItem(key, type);
  }

  loadViewType(): void {
    try {
      const key = this.showFavoritesOnly ? 'favorites-view-type' : 'dashboards-view-type';
      const savedView = localStorage.getItem(key);
      if (savedView === 'grid' || savedView === 'list') {
        this.viewType = savedView;
      } else {
        this.viewType = 'grid';
      }
    } catch {
      this.viewType = 'grid';
    }
  }

  constructor(
    private dashboardService: DashboardService,
    private router: Router,
    private route: ActivatedRoute,
    private active: ActiveDatasetService
  ) {

    this.loadFavorites();
    this.active.ensureLoaded().then(() => this.applyScope());
    this.loadDashboards();
    // Re-filter whenever the globally-active dataset changes.
    this.schemaSub = this.active.activeKey$.subscribe((key) => {
      if (key && key !== NO_ACTIVE_DATASET) {
        this.selectedDatasets = [key];
      } else {
        this.selectedDatasets = [];
      }
      this.applyScope();
    });
    // Keep the dataset picker in sync with the available dataset families.
    this.familiesSub = this.active.families$.subscribe((families) => {
      this.datasetFamilies = families;
      this.filteredDatasetFamilies = [...families];
    });
    // Pick up a search term coming from the top-bar search (e.g. /dashboards?q=sales).
    this.routeSub = this.route.queryParamMap.subscribe((pm) => {
      const dataset = pm.get('dataset');
      this.showFavoritesOnly = pm.get('favorites') === 'true';
      this.loadViewType();
      this.selectedDatasets = dataset ? dataset.split(',') : [];
      
      this.filter = pm.get('q') ?? '';

      if (pm.get('saved') === 'true') {
        this.showShareMessage('Dashboard saved to database.');
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { saved: null },
          queryParamsHandling: 'merge',
          replaceUrl: true
        });
      }

      // Ensure the visible list reflects any change in the query param immediately.
      this.applyScope();
    });

    // Re-apply scoping after navigation end in case the active dataset changed elsewhere
    // while this component was inactive (ensureLoaded may be stale until navigation completes).
    this.routerEventsSub = this.router.events.subscribe((ev) => {
      if (ev instanceof NavigationEnd) {
        const q = this.route.snapshot.queryParamMap.get('q');
        this.filter = q ?? '';
        this.active.ensureLoaded().then(() => this.applyScope());
      }
    });
  }

  ngOnDestroy(): void {
    this.schemaSub?.unsubscribe();
    this.familiesSub?.unsubscribe();
    this.routeSub?.unsubscribe();
    this.routerEventsSub?.unsubscribe();
  }

  /** The picker's current value: the active dataset family key (or the "none" sentinel). */
  get activeDatasetKey(): string {
    return this.active.activeKey;
  }

  /** User picked a dataset from the dropdown → make it the active family; scoping re-applies via subscription. */
  onDatasetPick(): void {
    const datasetParam = this.selectedDatasets.length > 0 ? this.selectedDatasets.join(',') : null;
    this.filter = '';
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { dataset: datasetParam, q: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
    this.applyScope();
  }

  /** True while a search term is active (from the top-bar search or the on-page filter box). */
  get isSearching(): boolean {
    return this.filter.trim().length > 0;
  }

  /** Total number of saved dashboards (across all datasets). */
  get totalDashboards(): number {
    return this.records.length;
  }

  /** Denominator for the "X of N" count: the current scoped dashboard list. */
  get baseCount(): number {
    return this.dashboards.length;
  }

  private loadDashboards(): void {
    this.loading = true;
    this.error = '';

    this.dashboardService.listDashboardRecords('anonymous').subscribe({
      next: (records) => {
        this.records = records;
        this.applyScope();
        this.loading = false;
      },
      error: () => {
        this.error = 'Unable to load dashboards from database.';
        this.loading = false;
      }
    });
  }

  /** Keeps only the dashboards that belong to the currently-active dataset family. */
  private applyScope(): void {
    // When no dataset family is selected, don't hide everything — show all saved dashboards.
    const scoped = this.selectedDatasets.length === 0
      ? this.records
      : this.records.filter((r) => {
          const k = this.active.dashboardFamilyKey(r);
          return k && this.selectedDatasets.includes(k);
        });
    this.dashboards = scoped.map((record, index) => this.mapRecordToCard(record, index));
  }

  private mapRecordToCard(record: DashboardRecord, index: number): DashItem {
    return {
      id: record.dashboard_id,
      name: record.name,
      desc: record.description || 'Saved dashboard',
      edited: this.formatEdited(record.updated_at || record.created_at),
      views: record.widgets?.length || 0,
      thumb: this.cardGradients[index % this.cardGradients.length],
      isFavorite: this.favoriteIds.has(record.dashboard_id),
      userId: record.user_id || 'anonymous',
      createdAt: this.formatDate(record.created_at)
    };
  }

  private formatDate(value: string): string {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return 'unknown';
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hr = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yr}-${mo}-${day} ${hr}:${min}`;
  }

  openDashboard(item: DashItem): void {
    this.router.navigate(['/builder'], { queryParams: { dashboardId: item.id } });
  }

  /** Open the dashboard in read-only preview mode. */
  previewDashboard(item: DashItem): void {
    this.router.navigate(['/builder'], { queryParams: { dashboardId: item.id, mode: 'view' } });
  }

  onFilter(value: string): void {
    this.filter = value;
    // Persist the filter and the currently-selected dataset in the route query params.
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: value || null, dataset: this.active.activeKey || null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  /**
   * The dashboards to show. With no search term, the scoped list (active-dataset dashboards).
   * With a term, uses Fuse.js for an advanced fuzzy search by name and description.
   */
  get filteredDashboards(): DashItem[] {
    const q = this.filter.trim();
    let scoped = this.selectedDatasets.length === 0
      ? this.records
      : this.records.filter((r) => {
          const k = this.active.dashboardFamilyKey(r);
          return k && this.selectedDatasets.includes(k);
        });
    
    if (this.showFavoritesOnly) {
      scoped = scoped.filter((r) => this.favoriteIds.has(r.dashboard_id));
    }
    
    if (!q) return scoped.map((record, index) => this.mapRecordToCard(record, index));

    const fuse = new Fuse(scoped, {
      keys: ['name', 'description'],
      threshold: 0.4
    });

    return fuse.search(q).map((result: any, index: number) => this.mapRecordToCard(result.item, index));
  }

  deleteDashboard(item: DashItem, event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpenId = null;
    if (this.deletingId) return;
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;

    this.deletingId = item.id;
    this.dashboardService.deleteDashboardRecord(item.id).subscribe({
      next: () => {
        this.records = this.records.filter(r => r.dashboard_id !== item.id);
        this.dashboards = this.dashboards.filter(d => d.id !== item.id);
        this.deletingId = null;
      },
      error: () => {
        this.error = `Unable to delete "${item.name}". Please try again.`;
        this.deletingId = null;
      }
    });
  }

  toggleMenu(id: string, event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpenId = this.menuOpenId === id ? null : id;
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.menuOpenId = null;
    this.datasetDropdownOpen = false;
  }

  toggleDsDropdown(event: Event): void {
    event.stopPropagation();
    this.datasetDropdownOpen = !this.datasetDropdownOpen;
    if (this.datasetDropdownOpen) {
      this.datasetSearchTerm = '';
      this.onDatasetSearch('');
    }
  }

  onDatasetSearch(q: string): void {
    this.datasetSearchTerm = q;
    if (!q.trim()) {
      this.filteredDatasetFamilies = [...this.datasetFamilies];
      return;
    }
    const fuse = new Fuse(this.datasetFamilies, { keys: ['label'], threshold: 0.4 });
    this.filteredDatasetFamilies = fuse.search(q).map((res: any) => res.item);
  }

  selectDatasetFilter(key: string): void {
    // Legacy single-select fallback
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
    this.onDatasetPick();
  }

  getSelectedDatasetLabel(): string {
    if (this.selectedDatasets.length === 0) return 'All dashboards';
    if (this.selectedDatasets.length === 1) {
      const match = this.datasetFamilies.find(d => d.key === this.selectedDatasets[0]);
      return match ? match.label : '1 Dataset';
    }
    return `${this.selectedDatasets.length} Datasets`;
  }

  private justStartedRename = false;

  startRename(item: DashItem, event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpenId = null;
    this.renamingId = item.id;
    this.justStartedRename = true;
    setTimeout(() => {
      // Works for both card view (.rename-input) and table view (.table-rename-input)
      const input =
        document.querySelector<HTMLInputElement>('.rename-input') ??
        document.querySelector<HTMLInputElement>('.table-rename-input');
      input?.focus();
      input?.select();
      // Allow blur handling only after the input is properly focused
      setTimeout(() => { this.justStartedRename = false; }, 150);
    });
  }

  commitRename(item: DashItem, value: string): void {
    // Ignore the blur that fires immediately when the input first appears
    if (this.justStartedRename) return;
    if (this.renamingId !== item.id) return;
    const name = (value ?? '').trim();
    this.renamingId = null;
    if (!name || name === item.name) return;

    const record = this.records.find(r => r.dashboard_id === item.id);
    if (!record) return;

    const widgets: DashboardWidgetRecord[] = (record.widgets ?? []).map(w => ({
      widget_name: (w as any).widget_name ?? 'widget',
      layout_json: (w as any).layout_json ?? {},
      chart_config_json: (w as any).chart_config_json ?? {},
      database_config_json: (w as any).database_config_json ?? {}
    }));

    const payload: SaveDashboardRequest = {
      user_id: record.user_id || 'anonymous',
      name,
      description: record.description ?? '',
      widgets
    };

    const previous = item.name;
    this.dashboardService.updateDashboardRecord(item.id, payload).subscribe({
      next: () => {
        item.name = name;
        record.name = name;
      },
      error: () => {
        this.error = `Unable to rename "${previous}". Please try again.`;
      }
    });
  }

  private formatEdited(value: string): string {
    const updatedAt = new Date(value).getTime();
    if (!Number.isFinite(updatedAt)) {
      return 'recently';
    }

    const elapsedMs = Date.now() - updatedAt;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (elapsedMs < hour) {
      const mins = Math.max(1, Math.floor(elapsedMs / minute));
      return `${mins}m ago`;
    }

    if (elapsedMs < day) {
      return `${Math.floor(elapsedMs / hour)}h ago`;
    }

    const days = Math.floor(elapsedMs / day);
    if (days < 7) {
      return `${days}d ago`;
    }

    return `${Math.floor(days / 7)}w ago`;
  }

  loadFavorites(): void {
    try {
      const stored = localStorage.getItem('dashboard-favorites');
      if (stored) {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids)) {
          this.favoriteIds = new Set(ids);
        }
      }
    } catch {
      this.favoriteIds = new Set();
    }
  }

  saveFavorites(): void {
    localStorage.setItem('dashboard-favorites', JSON.stringify(Array.from(this.favoriteIds)));
  }

  toggleFavorite(item: DashItem, event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpenId = null;
    if (this.favoriteIds.has(item.id)) {
      this.favoriteIds.delete(item.id);
      item.isFavorite = false;
    } else {
      this.favoriteIds.add(item.id);
      item.isFavorite = true;
    }
    this.saveFavorites();
    this.applyScope();
  }

  shareMessage = '';
  private shareTimeout?: any;

  shareDashboard(item: DashItem, event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpenId = null;
    const shareUrl = `${window.location.origin}/share/${item.userId}/${item.id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      this.showShareMessage(`Share link copied: /share/${item.userId}/${item.id}`);
    }).catch(() => {
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      this.showShareMessage(`Share link copied: /share/${item.userId}/${item.id}`);
    });
  }

  private showShareMessage(msg: string): void {
    this.shareMessage = msg;
    if (this.shareTimeout) {
      clearTimeout(this.shareTimeout);
    }
    this.shareTimeout = setTimeout(() => {
      this.shareMessage = '';
    }, 4000);
  }
}
