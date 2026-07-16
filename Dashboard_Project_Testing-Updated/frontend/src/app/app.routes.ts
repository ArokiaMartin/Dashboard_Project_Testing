import { Routes } from '@angular/router';
import { HomeComponent } from '@features/home/home.component';
import { DashboardBuilderComponent } from '@features/dashboard-builder/dashboard-builder.component';
import { DashboardPreviewComponent } from '@features/dashboard-preview/dashboard-preview.component';
import { DataExplorerComponent } from '@features/data-explorer/data-explorer.component';
import { SchemaDataUploadComponent } from '@features/schema-data-upload/schema-data-upload.component';
import { DashboardsComponent } from '@features/dashboards/dashboards.component';
import { SettingsComponent } from '@features/settings/settings.component';

export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { path: 'upload-data', component: SchemaDataUploadComponent },
  { path: 'builder', component: DashboardBuilderComponent },
  { path: 'data', component: DataExplorerComponent },
  { path: 'preview', component: DashboardPreviewComponent },
  { path: 'dashboards', component: DashboardsComponent },
  { path: 'settings', component: SettingsComponent },
  // Catch-all: send unknown URLs back to Home instead of rendering a blank router outlet.
  { path: '**', redirectTo: '/home' }
];
