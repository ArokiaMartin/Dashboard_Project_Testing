import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashItem } from './dashboards-state.service';

@Component({
  selector: 'app-dashboard-grid',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="grid">
      <div class="dash" *ngFor="let d of dashboards" (click)="open.emit(d)">
        <div class="card-menu" (click)="$event.stopPropagation()">
          <button class="card-fav" [class.active]="d.isFavorite" (click)="toggleFavorite.emit(d)" [title]="d.isFavorite ? 'Remove from favorites' : 'Add to favorites'">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </button>
          <button class="card-dots" (click)="toggleMenu.emit(d)" title="Options">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>
          </button>
          <div class="card-dropdown" *ngIf="menuOpenId === d.id">
            <button (click)="startRename.emit(d)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Rename
            </button>
            <button (click)="share.emit(d)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              Share Link
            </button>
            <button class="danger" (click)="delete.emit(d)">
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
            <button class="edit-btn" (click)="$event.stopPropagation(); startRename.emit(d)" title="Rename Dashboard">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
          </div>
          <input *ngIf="renamingId === d.id" class="rename-input" [value]="d.name"
                 (click)="$event.stopPropagation()"
                 (keydown.enter)="commitRename.emit({item: d, name: $any($event.target).value})"
                 (keydown.escape)="cancelRename.emit()"
                 (blur)="commitRename.emit({item: d, name: $any($event.target).value})" />
          <p>{{ d.desc }}</p>
          <div class="meta">
            <span>Edited {{ d.edited }}</span>
            <span class="views">{{ d.views }} views</span>
          </div>
        </div>
        <div class="actions">
          <button class="a ghost" (click)="$event.stopPropagation(); preview.emit(d)">View</button>
          <button class="a ghost" (click)="$event.stopPropagation(); share.emit(d)" title="Copy shareable link">Share</button>
          <button class="a icon danger" (click)="$event.stopPropagation(); delete.emit(d)"
                  [disabled]="deletingId === d.id" title="Delete dashboard">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
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
  `]
})
export class DashboardGridComponent {
  @Input() dashboards: DashItem[] = [];
  @Input() renamingId: string | null = null;
  @Input() deletingId: string | null = null;
  @Input() menuOpenId: string | null = null;

  @Output() open = new EventEmitter<DashItem>();
  @Output() preview = new EventEmitter<DashItem>();
  @Output() toggleFavorite = new EventEmitter<DashItem>();
  @Output() toggleMenu = new EventEmitter<DashItem>();
  @Output() share = new EventEmitter<DashItem>();
  @Output() delete = new EventEmitter<DashItem>();
  @Output() startRename = new EventEmitter<DashItem>();
  @Output() commitRename = new EventEmitter<{item: DashItem, name: string}>();
  @Output() cancelRename = new EventEmitter<void>();
}
