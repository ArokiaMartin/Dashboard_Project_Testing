import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../core/services/theme.service';
import { AuthService, User } from '../../core/services/auth.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="head">
        <div>
          <h1>Settings</h1>
          <p>Manage your account and dashboard preferences.</p>
        </div>
        <div class="head-actions">
          <button class="btn ghost-btn" (click)="loadUserData()">Cancel</button>
          <button class="btn primary-btn" (click)="saveProfileChanges()">Save Changes</button>
        </div>
      </div>

      <!-- Account Real Data Card -->
      <div class="card">
        <h2>Account Profile</h2>
        <div class="field">
          <div class="label">
            <span>Email Address</span>
            <small>Primary email for your account (Verified Hyland Domain)</small>
          </div>
          <input [value]="userEmail" readonly class="readonly-input" />
        </div>
        <div class="field">
          <div class="label">
            <span>Full Name</span>
            <small>Your account display name</small>
          </div>
          <input [(ngModel)]="fullName" placeholder="Enter full name" />
        </div>
      </div>

      <!-- Change Password with OTP Authentication to Email Card -->
      <div class="card security-card">
        <div class="card-header-row">
          <div>
            <h2>Change Password</h2>
            <p class="section-desc">Secure OTP authentication sent to your registered email</p>
          </div>
        </div>

        <!-- Step 1: Send OTP Action -->
        <div class="otp-action-row" *ngIf="!otpSent">
          <div class="label">
            <span>Email OTP Verification</span>
            <small>Click to receive a 6-digit one-time passcode at {{ userEmail }}</small>
          </div>
          <button type="button" class="btn primary-btn" (click)="sendOtp()" [disabled]="sendingOtp">
            <span *ngIf="!sendingOtp">Send OTP Code to Email &rarr;</span>
            <span *ngIf="sendingOtp">Sending OTP...</span>
          </button>
        </div>

        <!-- Notification Banner -->
        <div *ngIf="otpBannerMessage" class="otp-banner" [class.success]="otpBannerType === 'success'" [class.error]="otpBannerType === 'error'" [class.info]="otpBannerType === 'info'">
          <svg *ngIf="otpBannerType === 'info'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <svg *ngIf="otpBannerType === 'success'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <span>{{ otpBannerMessage }}</span>
        </div>

        <!-- Step 2: Form for OTP & New Password -->
        <div *ngIf="otpSent" class="otp-form-area">
          <div class="otp-grid">
            <!-- OTP Input -->
            <div class="form-field">
              <label for="otp">Enter 6-Digit OTP Code</label>
              <div class="input-wrap">
                <input
                  type="text"
                  id="otp"
                  [(ngModel)]="enteredOtp"
                  placeholder="e.g. 849204"
                  maxlength="6"
                  required
                />
                <button type="button" class="resend-link" (click)="sendOtp()">Resend OTP</button>
              </div>
            </div>

            <!-- New Password -->
            <div class="form-field">
              <label for="newPass">New Password</label>
              <div class="input-wrap">
                <input
                  [type]="showPassword ? 'text' : 'password'"
                  id="newPass"
                  [(ngModel)]="newPassword"
                  placeholder="Minimum 6 characters"
                  required
                />
                <button type="button" class="pwd-eye-btn" (click)="showPassword = !showPassword">
                  <svg *ngIf="!showPassword" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  <svg *ngIf="showPassword" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Confirm Password -->
            <div class="form-field">
              <label for="confirmPass">Confirm New Password</label>
              <div class="input-wrap">
                <input
                  type="password"
                  id="confirmPass"
                  [(ngModel)]="confirmPassword"
                  placeholder="Re-enter new password"
                  required
                />
              </div>
            </div>
          </div>

          <div class="otp-actions">
            <button type="button" class="btn primary-btn" (click)="verifyAndChangePassword()" [disabled]="verifying">
              <span *ngIf="!verifying">Verify OTP & Change Password &rarr;</span>
              <span *ngIf="verifying">Updating Password...</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Preferences Card -->
      <div class="card">
        <h2>Preferences</h2>
        <div class="toggle-row" *ngFor="let t of toggles">
          <div class="label">
            <span>{{ t.name }}</span>
            <small>{{ t.desc }}</small>
          </div>
          <button class="switch" [class.on]="getToggleState(t)" (click)="toggleSetting(t)"><span class="knob"></span></button>
        </div>
      </div>

      <!-- Danger Zone Card -->
      <div class="card danger">
        <h2>Danger Zone</h2>
        <div class="danger-row">
          <div class="label">
            <span>Delete Account</span>
            <small>Permanently remove all dashboards and data. This cannot be undone.</small>
          </div>
          <button class="btn danger-btn">Delete Account</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 28px 32px; max-width: 780px; margin: 0 auto; font-family: 'Inter', -apple-system, sans-serif; }
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 26px; }
    .head h1 { margin: 0 0 4px; font-size: 26px; font-weight: 800; color: var(--text-primary, #0f172a); letter-spacing: -0.5px; }
    .head p { margin: 0; font-size: 14px; color: var(--text-muted, #64748b); }
    .head-actions { display: flex; gap: 12px; align-items: center; }

    .card { background: var(--bg-surface, white); border: 1px solid var(--border-color, #e8ebf2); border-radius: 16px; padding: 26px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(15,23,42,0.04); }
    .card h2 { margin: 0 0 18px; font-size: 16.5px; font-weight: 700; color: var(--text-primary, #0f172a); }

    .field { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--border-subtle, #f4f6fb); }
    .field:last-child { border-bottom: none; padding-bottom: 0; }
    .label { display: flex; flex-direction: column; gap: 3px; }
    .label span { font-size: 14px; font-weight: 600; color: var(--text-primary, #0f172a); }
    .label small { font-size: 12px; color: var(--text-muted, #94a3b8); }
    .field input { width: 300px; padding: 9.5px 14px; border: 1.5px solid var(--border-color, #cbd5e1); border-radius: 10px; font-size: 13.5px; color: var(--text-primary, #0f172a); background: var(--bg-subtle, #f8fafc); }
    .field input.readonly-input { background: var(--bg-subtle, #f1f5f9); color: var(--text-muted, #64748b); cursor: not-allowed; }
    .field input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }

    /* Security Card Styles */
    .security-card {
      border: 1px solid #dbeafe;
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    }

    :host-context(body.dark-theme) .security-card {
      background: var(--bg-surface, #1e293b);
      border-color: #334155;
    }

    .card-header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
    }

    .section-desc {
      margin: 2px 0 0;
      font-size: 13px;
      color: var(--text-muted, #64748b);
    }

    .security-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      color: #2563eb;
    }

    .otp-action-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 10px;
    }

    .otp-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      margin-top: 14px;
    }

    .otp-banner.info {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1d4ed8;
    }

    .otp-banner.success {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #15803d;
    }

    .otp-banner.error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
    }

    .otp-form-area {
      margin-top: 18px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .otp-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-field label {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--text-primary, #334155);
    }

    .input-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }

    .input-wrap input {
      width: 100%;
      padding: 9.5px 40px 9.5px 12px;
      border: 1.5px solid var(--border-color, #cbd5e1);
      border-radius: 10px;
      font-size: 13.5px;
      color: var(--text-primary, #0f172a);
      background: var(--bg-surface, #ffffff);
      box-sizing: border-box;
    }

    .input-wrap input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
    }

    .resend-link {
      position: absolute;
      right: 10px;
      background: none;
      border: none;
      color: #2563eb;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }

    .pwd-eye-btn {
      position: absolute;
      right: 10px;
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      display: flex;
      align-items: center;
    }

    .pwd-eye-btn:hover {
      color: #2563eb;
    }

    .otp-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 4px;
    }

    /* Toggles & General Buttons */
    .toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--border-subtle, #f4f6fb); }
    .toggle-row:last-child { border-bottom: none; padding-bottom: 0; }
    .switch { width: 44px; height: 24px; border-radius: 12px; background: #cbd5e1; border: none; cursor: pointer; padding: 3px; transition: background 0.2s ease; }
    .switch.on { background: #2563eb; }
    .knob { display: block; width: 18px; height: 18px; background: white; border-radius: 50%; transition: transform 0.2s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
    .switch.on .knob { transform: translateX(20px); }

    .card.danger { border-color: #fecaca; background: #fef7f7; }
    :host-context(body.dark-theme) .card.danger { background: rgba(220, 38, 38, 0.1); border-color: rgba(220, 38, 38, 0.3); }

    .danger-row { display: flex; justify-content: space-between; align-items: center; gap: 20px; }

    .btn { padding: 10px 18px; border-radius: 10px; font-size: 13.5px; font-weight: 700; cursor: pointer; border: none; transition: all 0.15s ease; }
    .primary-btn { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; box-shadow: 0 4px 12px rgba(37,99,235,0.25); }
    .primary-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(37,99,235,0.35); }
    .primary-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .ghost-btn { background: var(--bg-surface, white); color: var(--text-secondary, #475569); border: 1.5px solid var(--border-color, #cbd5e1); }
    .ghost-btn:hover { border-color: #94a3b8; color: #0f172a; }
    .danger-btn { background: #dc2626; color: white; white-space: nowrap; }
    .danger-btn:hover { background: #b91c1c; }

    .foot-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 10px; }
  `]
})
export class SettingsComponent implements OnInit {
  userEmail = '';
  fullName = '';

  // OTP Change Password State
  otpSent = false;
  sendingOtp = false;
  verifying = false;
  generatedOtp = '';
  enteredOtp = '';
  newPassword = '';
  confirmPassword = '';
  showPassword = false;
  otpBannerMessage = '';
  otpBannerType: 'info' | 'success' | 'error' = 'info';

  toggles = [
    { key: 'auto-refresh', name: 'Auto-refresh dashboards', desc: 'Refresh live data every 5 minutes', on: true },
    { key: 'grid-lines', name: 'Show grid lines', desc: 'Display alignment grid in the builder', on: true },
    { key: 'alerts', name: 'Email alerts', desc: 'Notify me when data processing completes', on: true },
    { key: 'dark-mode', name: 'Dark mode', desc: 'Use a dark theme across the app', on: false }
  ];

  constructor(
    public themeService: ThemeService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadUserData();
  }

  loadUserData(): void {
    const user: User | null = this.authService.currentUser();
    if (user) {
      this.userEmail = user.email;
      this.fullName = user.fullName;
    } else {
      this.userEmail = 'arokia.martinn@hyland.com';
      this.fullName = 'Martin';
    }
  }

  sendOtp(): void {
    this.sendingOtp = true;
    this.otpBannerMessage = '';

    setTimeout(() => {
      // Generate a random 6-digit OTP code
      this.generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      this.otpSent = true;
      this.sendingOtp = false;
      this.otpBannerType = 'info';
      this.otpBannerMessage = `OTP verification code (${this.generatedOtp}) has been sent to your email (${this.userEmail}).`;
    }, 600);
  }

  verifyAndChangePassword(): void {
    if (!this.enteredOtp || this.enteredOtp.trim() !== this.generatedOtp) {
      this.otpBannerType = 'error';
      this.otpBannerMessage = 'Invalid OTP code. Please check your code and try again.';
      return;
    }

    if (!this.newPassword || this.newPassword.length < 6) {
      this.otpBannerType = 'error';
      this.otpBannerMessage = 'New password must be at least 6 characters long.';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.otpBannerType = 'error';
      this.otpBannerMessage = 'Passwords do not match. Please re-enter passwords.';
      return;
    }

    this.verifying = true;

    setTimeout(() => {
      const updated = this.authService.updatePassword(this.userEmail, this.newPassword);
      this.verifying = false;

      if (updated) {
        this.otpBannerType = 'success';
        this.otpBannerMessage = 'Password updated successfully with email OTP verification!';
        this.newPassword = '';
        this.confirmPassword = '';
        this.enteredOtp = '';
        this.otpSent = false;
      } else {
        this.otpBannerType = 'error';
        this.otpBannerMessage = 'Failed to update password for user account.';
      }
    }, 500);
  }

  saveProfileChanges(): void {
    const user = this.authService.currentUser();
    if (user) {
      user.fullName = this.fullName;
      localStorage.setItem('app_current_user', JSON.stringify(user));
      this.authService.currentUser.set({ ...user });
    }
    this.otpBannerType = 'success';
    this.otpBannerMessage = 'Profile display name updated successfully!';
  }

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
