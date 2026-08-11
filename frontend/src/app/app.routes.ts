import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  {
    path: 'home',
    loadComponent: () => import('@features/home/home.component').then(m => m.HomeComponent)
  },
  {
    path: 'upload-data',
    loadComponent: () => import('@features/schema-data-upload/schema-data-upload.component').then(m => m.SchemaDataUploadComponent)
  },
  {
    path: 'builder',
    loadComponent: () => import('@features/dashboard-builder/dashboard-builder.component').then(m => m.DashboardBuilderComponent),
    canDeactivate: [unsavedChangesGuard]
  },
  {
    path: 'share/:username/:dashboardId',
    loadComponent: () => import('@features/dashboard-builder/dashboard-builder.component').then(m => m.DashboardBuilderComponent)
  },
  {
    path: 'data',
    loadComponent: () => import('@features/data-explorer/data-explorer.component').then(m => m.DataExplorerComponent)
  },
  {
    path: 'preview',
    loadComponent: () => import('@features/dashboard-preview/dashboard-preview.component').then(m => m.DashboardPreviewComponent)
  },
  {
    path: 'dashboards',
    loadComponent: () => import('@features/dashboards/dashboards.component').then(m => m.DashboardsComponent)
  },
  {
    path: 'settings',
    loadComponent: () => import('@features/settings/settings.component').then(m => m.SettingsComponent)
  }
];
