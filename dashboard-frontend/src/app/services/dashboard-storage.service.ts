import { Injectable } from '@angular/core';
import { SavedDashboard } from '../models/dashboard.models';

const STORAGE_KEY = 'dashboard-studio.saved-dashboards.v1';

/** Persists saved dashboards to localStorage so previous work can be reopened. */
@Injectable({ providedIn: 'root' })
export class DashboardStorageService {
  list(): SavedDashboard[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as SavedDashboard[];
      return Array.isArray(parsed) ? parsed.sort((a, b) => b.createdAt - a.createdAt) : [];
    } catch {
      return [];
    }
  }

  save(dashboard: SavedDashboard): SavedDashboard[] {
    const existing = this.list().filter((item) => item.id !== dashboard.id);
    const next = [dashboard, ...existing];
    this.persist(next);
    return next;
  }

  remove(id: string): SavedDashboard[] {
    const next = this.list().filter((item) => item.id !== id);
    this.persist(next);
    return next;
  }

  private persist(dashboards: SavedDashboard[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboards));
    } catch {
      /* storage may be unavailable (private mode); ignore */
    }
  }
}
