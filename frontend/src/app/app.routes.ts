import { Routes } from '@angular/router';
import { unsavedChangesGuard } from './core/guards/unsaved-changes.guard';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'signup',
    loadComponent: () => import('./features/auth/signup.component').then(m => m.SignupComponent)
  },
  {
    path: 'home',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
    canActivate: [authGuard]
  },
  {
    path: 'upload-data',
    loadComponent: () => import('./features/schema-data-upload/schema-data-upload.component').then(m => m.SchemaDataUploadComponent),
    canActivate: [authGuard]
  },
  {
    path: 'builder',
    loadComponent: () => import('./features/dashboard-builder/dashboard-builder.component').then(m => m.DashboardBuilderComponent),
    canActivate: [authGuard],
    canDeactivate: [unsavedChangesGuard]
  },
  {
    path: 'share/:username/:dashboardId',
    loadComponent: () => import('./features/dashboard-builder/dashboard-builder.component').then(m => m.DashboardBuilderComponent)
  },
  {
    path: 'data',
    loadComponent: () => import('./features/data-explorer/data-explorer.component').then(m => m.DataExplorerComponent),
    canActivate: [authGuard]
  },
  {
    path: 'preview',
    loadComponent: () => import('./features/dashboard-preview/dashboard-preview.component').then(m => m.DashboardPreviewComponent),
    canActivate: [authGuard]
  },
  {
    path: 'dashboards',
    loadComponent: () => import('./features/dashboards/dashboards.component').then(m => m.DashboardsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'live-sources',
    loadComponent: () => import('./features/live-sources/live-source-list.component').then(m => m.LiveSourceListComponent),
    canActivate: [authGuard]
  },
  {
    path: 'live-sources/new',
    loadComponent: () => import('./features/live-sources/live-source-wizard.component').then(m => m.LiveSourceWizardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'live-sources/:id',
    loadComponent: () => import('./features/live-sources/live-source-detail.component').then(m => m.LiveSourceDetailComponent),
    canActivate: [authGuard]
  }
];