import { bootstrapApplication } from '@angular/platform-browser';
import { provideEchartsCore } from 'ngx-echarts';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { AppComponent } from './app/app.component';

echarts.use([BarChart, LineChart, PieChart, ScatterChart, CanvasRenderer, GridComponent, TooltipComponent, LegendComponent]);

bootstrapApplication(AppComponent, {
  providers: [provideEchartsCore({ echarts })]
}).catch((err) => console.error(err));
