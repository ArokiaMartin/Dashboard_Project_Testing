import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashItem } from './dashboards-state.service';

@Component({
  selector: 'app-dashboard-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="table-container">
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
          <tr *ngFor="let d of dashboards" (click)="open.emit(d)" class="table-row">
            <td (click)="$event.stopPropagation()" style="text-align: center;">
              <button class="table-fav" [class.active]="d.isFavorite" (click)="toggleFavorite.emit(d)" [title]="d.isFavorite ? 'Remove from favorites' : 'Add to favorites'">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
              </button>
            </td>
            <td class="name-cell">
              <div class="table-rename-row" *ngIf="renamingId !== d.id">
                <span class="table-dash-name">{{ d.name }}</span>
                <button class="table-rename-btn" (click)="$event.stopPropagation(); startRename.emit(d)" title="Rename Dashboard">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
              </div>
              <input *ngIf="renamingId === d.id" class="table-rename-input" [value]="d.name"
                     (click)="$event.stopPropagation()"
                     (keydown.enter)="commitRename.emit({item: d, name: $any($event.target).value})"
                     (keydown.escape)="cancelRename.emit()"
                     (blur)="commitRename.emit({item: d, name: $any($event.target).value})" />
            </td>
            <td class="desc-cell">{{ d.desc }}</td>
            <td class="date-cell">{{ d.createdAt }}</td>
            <td class="date-cell">Edited {{ d.edited }}</td>
            <td style="text-align: right;" (click)="$event.stopPropagation()">
              <div class="table-actions">
                <button class="ta-btn" (click)="$event.stopPropagation(); open.emit(d)" title="Edit dashboard">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="ta-btn" (click)="$event.stopPropagation(); preview.emit(d)" title="View dashboard">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                <button class="ta-btn" (click)="$event.stopPropagation(); share.emit(d)" title="Copy shareable link">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                </button>
                <button class="ta-btn danger" (click)="$event.stopPropagation(); delete.emit(d)" [disabled]="deletingId === d.id" title="Delete dashboard">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .table-container { background: white; border: 1px solid #e8ebf2; border-radius: 12px; overflow-x: auto; box-shadow: 0 4px 15px rgba(15,23,42,0.03); }
    .dash-table { width: 100%; border-collapse: collapse; min-width: 900px; }
    .dash-table th { text-align: left; padding: 14px 16px; font-size: 13px; font-weight: 600; color: #475569; border-bottom: 1px solid #e8ebf2; background: #f8fafc; }
    .dash-table td { padding: 16px; font-size: 14px; border-bottom: 1px solid #e8ebf2; vertical-align: middle; }
    .table-row { cursor: pointer; transition: background 0.15s; }
    .table-row:hover { background: #f8fafc; }
    .table-row:last-child td { border-bottom: none; }
    .table-fav { background: none; border: none; color: #cbd5e1; cursor: pointer; transition: color 0.15s; display: inline-flex; }
    .table-fav:hover { color: #f59e0b; }
    .table-fav.active { color: #f59e0b; }
    .table-fav.active svg { fill: #f59e0b; }

    .name-cell { font-weight: 700; color: #0f172a; max-width: 250px; }
    .table-rename-row { display: flex; align-items: center; gap: 8px; }
    .table-dash-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; }
    .table-rename-btn { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; transition: all 0.15s; }
    .table-rename-btn:hover { color: #2563eb; background: #eff6ff; }
    .table-rename-input { padding: 5px 8px; border: 1.5px solid #2563eb; border-radius: 6px; font-size: 13px; font-weight: 600; outline: none; width: 220px; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }

    .desc-cell { color: #64748b; font-weight: 500; }
    .date-cell { color: #64748b; font-weight: 500; }

    .table-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
    .ta-btn { background: none; border: 1px solid #e2e8f0; color: #64748b; cursor: pointer; padding: 7px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; transition: all 0.12s; }
    .ta-btn:hover { color: #2563eb; border-color: #93c5fd; background: #eff6ff; }
    .ta-btn.danger:hover { color: #ef4444; border-color: #fca5a5; background: #fef2f2; }
  `]
})
export class DashboardListComponent {
  @Input() dashboards: DashItem[] = [];
  @Input() renamingId: string | null = null;
  @Input() deletingId: string | null = null;

  @Output() open = new EventEmitter<DashItem>();
  @Output() preview = new EventEmitter<DashItem>();
  @Output() toggleFavorite = new EventEmitter<DashItem>();
  @Output() share = new EventEmitter<DashItem>();
  @Output() delete = new EventEmitter<DashItem>();
  @Output() startRename = new EventEmitter<DashItem>();
  @Output() commitRename = new EventEmitter<{item: DashItem, name: string}>();
  @Output() cancelRename = new EventEmitter<void>();
}
