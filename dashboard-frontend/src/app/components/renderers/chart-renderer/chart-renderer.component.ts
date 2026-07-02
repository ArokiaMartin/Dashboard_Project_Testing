import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import type { EChartsOption } from 'echarts';
import { NgxEchartsDirective } from 'ngx-echarts';

@Component({
  selector: 'app-chart-renderer',
  standalone: true,
  imports: [CommonModule, NgxEchartsDirective],
  templateUrl: './chart-renderer.component.html',
  styleUrl: './chart-renderer.component.css'
})
export class ChartRendererComponent {
  @Input({ required: true }) option: EChartsOption = {};
}
