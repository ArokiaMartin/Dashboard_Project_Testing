import { Injectable, signal } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Chart } from 'chart.js';

export type ThemeMode = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly THEME_KEY = 'app-theme';
  public isDarkMode = signal<boolean>(false);
  private themeSubject = new BehaviorSubject<ThemeMode>('light');
  public theme$: Observable<ThemeMode> = this.themeSubject.asObservable();

  constructor() {
    this.initTheme();
  }

  private initTheme(): void {
    const savedTheme = localStorage.getItem(this.THEME_KEY) as ThemeMode | null;
    let isDark = false;

    if (savedTheme === 'dark' || savedTheme === 'light') {
      isDark = savedTheme === 'dark';
    } else {
      isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    this.applyTheme(isDark);
  }

  public setTheme(mode: ThemeMode): void {
    const isDark = mode === 'dark';
    localStorage.setItem(this.THEME_KEY, mode);
    this.applyTheme(isDark);
  }

  public toggleTheme(): void {
    const newMode: ThemeMode = this.isDarkMode() ? 'light' : 'dark';
    this.setTheme(newMode);
  }

  private applyTheme(isDark: boolean): void {
    this.isDarkMode.set(isDark);
    const mode: ThemeMode = isDark ? 'dark' : 'light';
    this.themeSubject.next(mode);

    if (isDark) {
      document.body.classList.add('dark-theme');
      document.documentElement.classList.add('dark-theme');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      document.documentElement.classList.remove('dark-theme');
      document.documentElement.setAttribute('data-theme', 'light');
    }

    this.updateChartDefaults(isDark);
  }

  private updateChartDefaults(isDark: boolean): void {
    if (Chart && Chart.defaults) {
      Chart.defaults.color = isDark ? '#8b949e' : '#64748b';
      Chart.defaults.borderColor = isDark ? '#30363d' : '#e2e8f0';
    }
  }
}
