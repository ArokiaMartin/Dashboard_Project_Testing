import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService, REQUIRED_EMAIL_DOMAIN } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="auth-page-wrapper">
      <!-- Background Animated Line Graph Visualization Theme -->
      <div class="bg-viz-canvas">
        <svg width="100%" height="100%" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
          <defs>
            <linearGradient id="lineGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#3b82f6" stop-opacity="0"/>
              <stop offset="50%" stop-color="#60a5fa" stop-opacity="0.8"/>
              <stop offset="100%" stop-color="#818cf8" stop-opacity="0"/>
            </linearGradient>
            <linearGradient id="lineGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#818cf8" stop-opacity="0"/>
              <stop offset="50%" stop-color="#3b82f6" stop-opacity="0.6"/>
              <stop offset="100%" stop-color="#60a5fa" stop-opacity="0"/>
            </linearGradient>
          </defs>

          <!-- Grid Matrix Lines -->
          <g class="viz-grid-lines" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="4 8" opacity="0.65">
            <line x1="0" y1="180" x2="1440" y2="180" />
            <line x1="0" y1="360" x2="1440" y2="360" />
            <line x1="0" y1="540" x2="1440" y2="540" />
            <line x1="0" y1="720" x2="1440" y2="720" />
            <line x1="240" y1="0" x2="240" y2="900" />
            <line x1="480" y1="0" x2="480" y2="900" />
            <line x1="720" y1="0" x2="720" y2="900" />
            <line x1="960" y1="0" x2="960" y2="900" />
            <line x1="1200" y1="0" x2="1200" y2="900" />
          </g>

          <!-- Dynamic Flowing Trend Line 1 -->
          <path id="trendPath1" class="viz-trend-line line-1"
                d="M -100 650 Q 200 400, 450 550 T 900 350 T 1350 480 T 1600 250"
                stroke="url(#lineGrad1)" stroke-width="3.5" stroke-linecap="round" fill="none"/>

          <!-- Dynamic Flowing Trend Line 2 -->
          <path id="trendPath2" class="viz-trend-line line-2"
                d="M -100 300 Q 300 500, 600 280 T 1100 450 T 1600 320"
                stroke="url(#lineGrad2)" stroke-width="2.5" stroke-linecap="round" fill="none"/>

          <!-- Flowing Energy / Bulb Data Pulse traveling to charts -->
          <circle r="7" fill="#60a5fa" filter="drop-shadow(0 0 10px #3b82f6)">
            <animateMotion dur="6s" repeatCount="indefinite">
              <mpath href="#trendPath1"/>
            </animateMotion>
          </circle>
          <circle r="5" fill="#93c5fd" filter="drop-shadow(0 0 8px #60a5fa)">
            <animateMotion dur="8s" repeatCount="indefinite">
              <mpath href="#trendPath2"/>
            </animateMotion>
          </circle>

          <!-- Background Bar Chart Outlines (Left & Right Sides) -->
          <g class="viz-bar-outlines" stroke="#93c5fd" stroke-width="2" opacity="0.5">
            <rect x="80" y="240" width="28" height="120" rx="4" class="bar b1"/>
            <rect x="116" y="190" width="28" height="170" rx="4" class="bar b2"/>
            <rect x="152" y="270" width="28" height="90" rx="4" class="bar b3"/>
            <rect x="188" y="150" width="28" height="210" rx="4" class="bar b4"/>

            <rect x="1220" y="580" width="28" height="140" rx="4" class="bar b1"/>
            <rect x="1256" y="520" width="28" height="200" rx="4" class="bar b2"/>
            <rect x="1292" y="620" width="28" height="100" rx="4" class="bar b3"/>
            <rect x="1328" y="490" width="28" height="230" rx="4" class="bar b4"/>
          </g>
        </svg>
      </div>

      <!-- Centered Card Container -->
      <div class="auth-card-split">
        <!-- Left Hero Panel -->
        <div class="hero-panel">
          <div class="hero-content">
            <!-- Exact Official Asset Logo rendered in Pure White -->
            <div class="brand-block-stacked">
              <img src="assets/hyland-logo.jpg" alt="Hyland Logo" class="hyland-exact-white-img" />

              <div class="brand-titles-stacked">
                <h2 class="brand-lumina-title">LUMINA</h2>
                <span class="brand-analytics-sub">ANALYTICS SUITE</span>
              </div>
            </div>

            <!-- Hero Headline & Subtitle -->
            <div class="hero-text-area">
              <h1>Intelligence at the speed of thought.</h1>
              <p>Empowering Hyland teams with real-time data exploration, interactive dashboard creation, and enterprise analytics.</p>
            </div>
          </div>

          <!-- Ambient Background Glows -->
          <div class="bg-glow glow-1"></div>
          <div class="bg-glow glow-2"></div>
        </div>

        <!-- Right Form Panel (Clean Light Mode Card) -->
        <div class="form-panel">
          <div class="form-wrapper">
            <!-- Form Header -->
            <div class="form-header">
              <h2>Welcome back</h2>
              <p>Sign in with your official Hyland corporate email</p>
            </div>

            <!-- Alert Badge -->
            <div *ngIf="errorMessage" class="auth-alert error">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>{{ errorMessage }}</span>
            </div>

            <!-- Form -->
            <form (ngSubmit)="onSubmit()" class="auth-form" novalidate>
              <!-- Email Input -->
              <div class="form-group">
                <label for="email">Hyland Corporate Email</label>
                <div class="input-wrap" [class.invalid]="isEmailTouched && !isEmailValid">
                  <svg class="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    [(ngModel)]="email"
                    (ngModelChange)="onEmailChange()"
                    (blur)="isEmailTouched = true"
                    placeholder="name&#64;hyland.com"
                    required
                    autocomplete="email"
                  />
                </div>
              </div>

              <!-- Password Input with Eye Icon Properly Inside -->
              <div class="form-group">
                <div class="label-row">
                  <label for="password">Password</label>
                </div>
                <div class="input-wrap">
                  <svg class="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <input
                    [type]="showPassword ? 'text' : 'password'"
                    id="password"
                    name="password"
                    [(ngModel)]="password"
                    placeholder="Enter your password"
                    required
                    autocomplete="current-password"
                  />
                  <button type="button" class="pwd-toggle" (click)="showPassword = !showPassword" tabindex="-1" title="Toggle password visibility">
                    <svg *ngIf="!showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    <svg *ngIf="showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Submit Button -->
              <button type="submit" class="btn-submit" [disabled]="loading">
                <span *ngIf="!loading">Sign In to Lumina &rarr;</span>
                <span *ngIf="loading" class="spinner-text">Authenticating...</span>
              </button>
            </form>

            <!-- Footer Switch Link -->
            <div class="form-footer">
              Don't have a Lumina account? <a routerLink="/signup">Sign up now</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100vw;
      min-height: 100vh;
    }

    /* Page Wrapper - Clean Light Background with Relative Positioning */
    .auth-page-wrapper {
      position: relative;
      min-height: 100vh;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      background: #f4f6fb;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-sizing: border-box;
      overflow: hidden;
    }

    /* Background Visualization Canvas */
    .bg-viz-canvas {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
      z-index: 1;
    }

    /* Trend Line Animation */
    .viz-trend-line {
      stroke-dasharray: 1000;
      stroke-dashoffset: 1000;
      animation: drawLine 12s linear infinite;
    }
    .line-2 {
      animation-delay: -6s;
      animation-duration: 14s;
    }

    @keyframes drawLine {
      0% { stroke-dashoffset: 2000; }
      100% { stroke-dashoffset: 0; }
    }

    /* Bar Chart Loading Animations */
    .bar {
      transform-origin: bottom;
      animation: barPulse 3.5s ease-in-out infinite alternate;
    }
    .b1 { animation-delay: 0s; }
    .b2 { animation-delay: 0.6s; }
    .b3 { animation-delay: 1.2s; }
    .b4 { animation-delay: 1.8s; }

    @keyframes barPulse {
      0% {
        transform: scaleY(0.65);
        opacity: 0.25;
      }
      100% {
        transform: scaleY(1.15);
        opacity: 0.75;
      }
    }

    /* Data Node Pulse Animation */
    .node-pulse {
      animation: pulseGlow 2.5s ease-in-out infinite alternate;
    }

    @keyframes pulseGlow {
      0% {
        r: 3.5;
        opacity: 0.4;
        filter: drop-shadow(0 0 2px #2563eb);
      }
      100% {
        r: 6.5;
        opacity: 1;
        filter: drop-shadow(0 0 8px #60a5fa);
      }
    }

    /* Centered Split Card Container */
    .auth-card-split {
      position: relative;
      z-index: 10;
      width: 100%;
      max-width: 960px;
      min-height: 560px;
      display: flex;
      border-radius: 24px;
      overflow: hidden;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.12), 0 2px 10px rgba(15, 23, 42, 0.04);
    }

    /* Left Hero Panel */
    .hero-panel {
      width: 45%;
      background: linear-gradient(135deg, #0b1328 0%, #1e293b 50%, #1d4ed8 100%);
      color: #ffffff;
      padding: 48px 44px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      overflow: hidden;
    }

    .hero-content {
      position: relative;
      z-index: 5;
      display: flex;
      flex-direction: column;
      height: 100%;
      justify-content: space-between;
    }

    .brand-block-stacked {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 24px;
    }

    /* Invert official hyland-logo.jpg so it renders in 100% pure white with transparent background */
    .hyland-exact-white-img {
      height: 42px;
      width: auto;
      object-fit: contain;
      filter: brightness(0) invert(1);
      mix-blend-mode: screen;
      display: block;
    }

    .brand-titles-stacked {
      display: flex;
      flex-direction: column;
      text-align: left;
    }

    .brand-lumina-title {
      margin: 0;
      font-family: 'Syncopate', 'Cabinet Grotesk', 'Space Grotesk', sans-serif;
      font-size: 32px;
      font-weight: 800;
      letter-spacing: 6px;
      background: linear-gradient(110deg, #ffffff 0%, #dbeafe 25%, #60a5fa 50%, #e0e7ff 75%, #ffffff 100%);
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: luminaShimmer 8s ease infinite;
      line-height: 1.1;
      filter: drop-shadow(0 0 16px rgba(96, 165, 250, 0.45));
    }

    .brand-sub-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
    }

    .badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #60a5fa;
      box-shadow: 0 0 8px #60a5fa;
    }

    .brand-analytics-sub {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 2px;
      color: #93c5fd;
      text-transform: uppercase;
    }

    .hero-text-area {
      margin: 28px 0;
    }

    .hero-text-area h1 {
      margin: 0 0 14px;
      font-size: 32px;
      font-weight: 800;
      line-height: 1.25;
      letter-spacing: -0.8px;
      color: #ffffff;
    }

    .hero-text-area p {
      margin: 0;
      font-size: 14px;
      line-height: 1.6;
      color: #cbd5e1;
    }

    .bg-glow {
      position: absolute;
      border-radius: 50%;
      filter: blur(70px);
      pointer-events: none;
    }

    .glow-1 {
      width: 250px;
      height: 250px;
      top: -40px;
      left: -40px;
      background: rgba(37, 99, 235, 0.3);
    }

    .glow-2 {
      width: 300px;
      height: 300px;
      bottom: -60px;
      right: -60px;
      background: rgba(99, 102, 241, 0.25);
    }

    /* Right Form Panel (Clean Light Mode Card) */
    .form-panel {
      width: 55%;
      background: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px 44px;
    }

    .form-wrapper {
      width: 100%;
      max-width: 380px;
    }

    .form-header {
      margin-bottom: 24px;
    }

    .form-header h2 {
      margin: 0 0 6px;
      font-size: 26px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
    }

    .form-header p {
      margin: 0;
      font-size: 13.5px;
      color: #64748b;
    }

    .auth-alert {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 18px;
    }

    .auth-alert.error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
    }

    .auth-form {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .form-group label {
      font-size: 13px;
      font-weight: 700;
      color: #334155;
    }

    /* Input Wrapper & Eye Toggle Positioning Fix */
    .input-wrap {
      position: relative;
      width: 100%;
      display: flex;
      align-items: center;
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      background: #f8fafc;
      transition: all 0.15s ease;
      overflow: hidden;
      box-sizing: border-box;
    }

    .input-icon {
      position: absolute;
      left: 12px;
      color: #94a3b8;
      pointer-events: none;
      z-index: 2;
    }

    .input-wrap input {
      width: 100%;
      padding: 11px 44px 11px 40px;
      border: none;
      background: transparent;
      outline: none;
      font-size: 14px;
      color: #0f172a;
      box-sizing: border-box;
    }

    .input-wrap:focus-within {
      border-color: #2563eb;
      background: #ffffff;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }

    .input-wrap.invalid {
      border-color: #ef4444;
      background: #fff5f5;
    }

    /* Eye toggle inside input container */
    .pwd-toggle {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 5px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      z-index: 3;
      transition: color 0.15s;
    }

    .pwd-toggle:hover {
      color: #2563eb;
    }

    .btn-submit {
      width: 100%;
      padding: 12.5px;
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: #ffffff;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      box-shadow: 0 6px 18px rgba(37, 99, 235, 0.3);
      margin-top: 4px;
    }

    .btn-submit:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 8px 24px rgba(37, 99, 235, 0.4);
    }

    .btn-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      box-shadow: none;
    }

    .demo-card {
      margin-top: 20px;
      padding: 14px;
      background: #f8fafc;
      border: 1.5px dashed #cbd5e1;
      border-radius: 12px;
    }

    .demo-header {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 12px;
      font-weight: 700;
      color: #2563eb;
      margin-bottom: 4px;
    }

    .demo-detail {
      margin: 0 0 8px;
      font-size: 12px;
      color: #64748b;
    }

    .demo-detail code {
      background: #dbeafe;
      color: #1e40af;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
      font-weight: 600;
    }

    .btn-demo-fill {
      width: 100%;
      padding: 7px 10px;
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 7px;
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-demo-fill:hover {
      border-color: #2563eb;
      color: #2563eb;
      background: #eff6ff;
    }

    .form-footer {
      text-align: center;
      margin-top: 20px;
      font-size: 13px;
      color: #64748b;
    }

    .form-footer a {
      color: #2563eb;
      font-weight: 700;
      text-decoration: none;
    }

    .form-footer a:hover {
      text-decoration: underline;
    }

    @media (max-width: 860px) {
      .auth-card-split {
        flex-direction: column;
        max-width: 480px;
      }
      .hero-panel, .form-panel {
        width: 100%;
        padding: 36px 28px;
      }
    }
  `]
})
export class LoginComponent implements OnInit {
  email = '';
  password = '';
  showPassword = false;
  loading = false;
  errorMessage = '';
  isEmailTouched = false;
  isEmailValid = true;
  returnUrl = '/home';
  requiredDomain = REQUIRED_EMAIL_DOMAIN;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/home']);
    }
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/home';
  }

  onEmailChange(): void {
    if (this.isEmailTouched) {
      this.isEmailValid = this.authService.validateHylandEmail(this.email);
    }
  }

  fillDemoCredentials(): void {
    this.email = 'alexander@hyland.com';
    this.password = 'Password123!';
    this.isEmailTouched = true;
    this.isEmailValid = true;
    this.errorMessage = '';
  }

  onSubmit(): void {
    this.isEmailTouched = true;
    this.isEmailValid = this.authService.validateHylandEmail(this.email);

    if (!this.isEmailValid) {
      this.errorMessage = `Only Hyland emails ending with ${REQUIRED_EMAIL_DOMAIN} are allowed.`;
      return;
    }

    if (!this.password) {
      this.errorMessage = 'Please enter your password.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    setTimeout(() => {
      const res = this.authService.login(this.email, this.password);
      this.loading = false;

      if (res.success) {
        this.router.navigateByUrl(this.returnUrl);
      } else {
        this.errorMessage = res.message || 'Failed to sign in.';
      }
    }, 400);
  }
}
