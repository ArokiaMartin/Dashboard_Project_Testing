import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { DashboardBuilderComponent } from './components/dashboard-builder/dashboard-builder.component';
import { DashboardPreviewComponent } from './components/dashboard-preview/dashboard-preview.component';
import { DataExplorerComponent } from './components/data-explorer/data-explorer.component';
import { ReportsComponent } from './components/reports/reports.component';
import { DashboardsComponent } from './components/dashboards/dashboards.component';
import { SettingsComponent } from './components/settings/settings.component';

export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { path: 'builder', component: DashboardBuilderComponent },
  { path: 'data', component: DataExplorerComponent },
  { path: 'preview', component: DashboardPreviewComponent },
  { path: 'reports', component: ReportsComponent },
  { path: 'dashboards', component: DashboardsComponent },
  { path: 'settings', component: SettingsComponent }
];
