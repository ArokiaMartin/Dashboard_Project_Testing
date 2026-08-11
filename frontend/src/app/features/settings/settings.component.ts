import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <div class="head">
        <h1>Settings</h1>
        <p>Manage your account and dashboard preferences.</p>
      </div>

      <div class="card">
        <h2>Account</h2>
        <div class="field">
          <div class="label"><span>Email Address</span><small>Primary email for your account</small></div>
          <input value="alexander@hyland.com" readonly />
        </div>
        <div class="field">
          <div class="label"><span>Full Name</span><small>Your display name</small></div>
          <input value="Alexander Sterling" />
        </div>
        <div class="field">
          <div class="label"><span>Organization</span><small>Current workspace</small></div>
          <input value="Hyland Analytics" readonly />
        </div>
      </div>

      <div class="card">
        <h2>Preferences</h2>
        <div class="toggle-row" *ngFor="let t of toggles">
          <div class="label"><span>{{ t.name }}</span><small>{{ t.desc }}</small></div>
          <button class="switch" [class.on]="getToggleState(t)" (click)="toggleSetting(t)"><span class="knob"></span></button>
        </div>
      </div>

      <div class="card danger">
        <h2>Danger Zone</h2>
        <div class="danger-row">
          <div class="label"><span>Delete Account</span><small>Permanently remove all dashboards and data. This cannot be undone.</small></div>
          <button class="btn danger">Delete Account</button>
        </div>
      </div>

      <div class="foot-actions">
        <button class="btn ghost">Cancel</button>
        <button class="btn primary">Save Changes</button>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 28px 32px; max-width: 760px; margin: 0 auto; }
    .head { margin-bottom: 26px; }
    .head h1 { margin: 0 0 6px; font-size: 26px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    .head p { margin: 0; font-size: 14px; color: #64748b; }

    .card { background: white; border: 1px solid #e8ebf2; border-radius: 16px; padding: 26px; margin-bottom: 20px; }
    .card h2 { margin: 0 0 20px; font-size: 16px; font-weight: 700; color: #0f172a; }

    .field { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid #f4f6fb; }
    .field:last-child { border-bottom: none; padding-bottom: 0; }
    .label { display: flex; flex-direction: column; gap: 3px; }
    .label span { font-size: 14px; font-weight: 600; color: #0f172a; }
    .label small { font-size: 12px; color: #94a3b8; }
    .field input { width: 280px; padding: 9px 12px; border: 1px solid #e2e8f0; border-radius: 9px; font-size: 13px; color: #334155; }
    .field input[readonly] { background: #f8fafc; color: #94a3b8; }
    .field input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }

    .toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid #f4f6fb; }
    .toggle-row:last-child { border-bottom: none; padding-bottom: 0; }
    .switch { width: 42px; height: 24px; border-radius: 12px; background: #e2e8f0; border: none; cursor: pointer; padding: 3px; transition: background 0.2s ease; }
    .switch.on { background: #2563eb; }
    .knob { display: block; width: 18px; height: 18px; background: white; border-radius: 50%; transition: transform 0.2s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
    .switch.on .knob { transform: translateX(18px); }

    .card.danger { border-color: #fecaca; background: #fef7f7; }
    .danger-row { display: flex; justify-content: space-between; align-items: center; gap: 20px; }

    .btn { padding: 10px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; }
    .btn.primary { background: #2563eb; color: white; } .btn.primary:hover { background: #1d4ed8; }
    .btn.ghost { background: white; color: #475569; border: 1px solid #e2e8f0; } .btn.ghost:hover { border-color: #cbd5e1; }
    .btn.danger { background: #dc2626; color: white; white-space: nowrap; } .btn.danger:hover { background: #b91c1c; }

    .foot-actions { display: flex; justify-content: flex-end; gap: 12px; }
  `]
})
export class SettingsComponent {
  toggles = [
    { key: 'auto-refresh', name: 'Auto-refresh dashboards', desc: 'Refresh live data every 5 minutes', on: true },
    { key: 'grid-lines', name: 'Show grid lines', desc: 'Display alignment grid in the builder', on: true },
    { key: 'alerts', name: 'Email alerts', desc: 'Notify me when data processing completes', on: true },
    { key: 'dark-mode', name: 'Dark mode', desc: 'Use a dark theme across the app', on: false }
  ];

  constructor(public themeService: ThemeService) {}

  getToggleState(t: any): boolean {
    if (t.key === 'dark-mode') {
      return this.themeService.isDarkMode();
    }
    return t.on;
  }

  toggleSetting(t: any): void {
    if (t.key === 'dark-mode') {
      this.themeService.toggleTheme();
    } else {
      t.on = !t.on;
    }
  }
}

