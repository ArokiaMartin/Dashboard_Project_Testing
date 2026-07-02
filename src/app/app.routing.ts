import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardUploaderComponent } from './components/dashboard-uploader.component';
import { ModelExplorerComponent } from './components/model-explorer.component';

export const routes: Routes = [
  {
    path: '',
    component: DashboardUploaderComponent,
  },
  {
    path: 'dashboards',
    component: ModelExplorerComponent,
  },
  {
    path: 'create',
    component: DashboardUploaderComponent,
  },
  {
    path: 'about',
    component: DashboardUploaderComponent,
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRouting {}
