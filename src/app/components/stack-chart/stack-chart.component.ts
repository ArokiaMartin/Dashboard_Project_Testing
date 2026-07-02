import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Chart, ChartDataset, registerables } from 'chart.js';
import {
  StackChartConfig,
  UserStackChartInput,
  AvailableField,
  FilterRule,
  StackChartData
} from './models/stack-chart.model';
import { StackChartConfigService } from './services/stack-chart-config.service';
import { StackChartDataService } from './services/stack-chart-data.service';
import { StackChartTransformService } from './services/stack-chart-transform.service';

Chart.register(...registerables);

@Component({
  selector: 'app-stack-chart',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './stack-chart.component.html',
  styleUrls: ['./stack-chart.component.scss']
})
export class StackChartComponent implements OnInit, OnDestroy {

  // Available options for dropdowns
  availableDatasets: string[] = [];
  availableDimensions: AvailableField[] = [];
  availableBreakdownDimensions: AvailableField[] = [];
  availableMeasures: AvailableField[] = [];
  availableFilterFields: AvailableField[] = [];
  aggregationOptions = ['SUM', 'AVG', 'COUNT', 'MAX', 'MIN'];
  filterOperators = ['=', '!=', '>', '<', 'IN', 'BETWEEN'];

  // User selections
  selectedDataset = 'sales';
  selectedDimension = 'Region';
  // Optional second dimension to break the stack segments down by
  // (e.g. Region on X-axis, broken down by Product) instead of by measure.
  selectedBreakdownDimension = '';
  selectedMeasures: string[] = ['Sales', 'Revenue'];
  selectedFilters: FilterRule[] = [];

  // New filter being added
  newFilter = {
    field: '',
    operator: '=',
    value: ''
  };

  // Chart state
  chartConfig: StackChartConfig | null = null;
  chartData: StackChartData | null = null;
  chartLoading = false;
  chartError = '';
  chartReady = false;

  // Stack chart options
  stackMode = 'normal'; // normal, percent, grouped
  stackOrientation = 'vertical'; // vertical, horizontal

  // Chart.js rendering
  colorPalette = ['#2563eb', '#60a5fa', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
  private canvasEl?: HTMLCanvasElement;
  private chartInstance?: Chart;

  @ViewChild('stackCanvas') set canvasRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this.canvasEl = ref?.nativeElement;
    if (this.canvasEl && this.chartReady) {
      setTimeout(() => this.renderChart(), 0);
    }
  }

  private destroy$ = new Subject<void>();

  constructor(
    private configService: StackChartConfigService,
    private dataService: StackChartDataService,
    private transformService: StackChartTransformService
  ) { }

  ngOnInit(): void {
    this.initializeComponent();
    this.loadAvailableOptions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.destroyChart();
  }

  // Initialize component with default selections
  private initializeComponent(): void {
    this.availableDatasets = this.configService.getAvailableDatasets();
    this.loadDimensionsAndMeasures();
    this.generateChart();
  }

  // Load available dimensions and measures for selected dataset
  private loadDimensionsAndMeasures(): void {
    this.availableDimensions = this.configService.getDimensionsByDataset(this.selectedDataset);
    this.availableMeasures = this.configService.getMeasuresByDataset(this.selectedDataset);
    this.availableFilterFields = this.configService.getAllFieldsByDataset(this.selectedDataset);
    this.updateBreakdownOptions();
  }

  // Breakdown dimension options = all dimensions except the primary one
  private updateBreakdownOptions(): void {
    this.availableBreakdownDimensions = this.availableDimensions.filter(
      d => d.name !== this.selectedDimension
    );
  }

  // Load available options (for filter operators based on field type)
  private loadAvailableOptions(): void {
    // This can be extended to load more options dynamically
  }

  // Handle dataset change
  onDatasetChange(dataset: string): void {
    this.selectedDataset = dataset;
    this.selectedDimension = '';
    this.selectedBreakdownDimension = '';
    this.selectedMeasures = [];
    this.selectedFilters = [];
    this.loadDimensionsAndMeasures();
    this.chartReady = false;
  }

  // Handle dimension change
  onDimensionChange(dimension: string): void {
    this.selectedDimension = dimension;
    if (this.selectedBreakdownDimension === dimension) {
      this.selectedBreakdownDimension = '';
    }
    this.updateBreakdownOptions();
    this.generateChart();
  }

  // Handle "break down by" (second dimension) change.
  // When set, segments come from this dimension's values instead of
  // from each measure, so only a single measure makes sense to plot.
  onBreakdownDimensionChange(dimension: string): void {
    this.selectedBreakdownDimension = dimension;
    if (dimension && this.selectedMeasures.length > 1) {
      this.selectedMeasures = [this.selectedMeasures[0]];
    }
    this.generateChart();
  }

  // Add a measure. In "break down by" mode only one measure is meaningful,
  // so picking a new one replaces the current selection instead of adding to it.
  addMeasure(measure: string): void {
    if (!measure) {
      return;
    }
    if (this.selectedBreakdownDimension) {
      this.selectedMeasures = [measure];
      this.generateChart();
    } else if (!this.selectedMeasures.includes(measure)) {
      this.selectedMeasures.push(measure);
      this.generateChart();
    }
  }

  // Remove a measure
  removeMeasure(measure: string): void {
    this.selectedMeasures = this.selectedMeasures.filter(m => m !== measure);
    this.generateChart();
  }

  // Add filter
  addFilter(): void {
    if (this.newFilter.field && this.newFilter.operator && this.newFilter.value !== '') {
      this.selectedFilters.push({
        field: this.newFilter.field,
        operator: this.newFilter.operator as any,
        value: this.newFilter.value
      });
      this.resetFilterForm();
      this.generateChart();
    }
  }

  // Remove filter
  removeFilter(index: number): void {
    this.selectedFilters.splice(index, 1);
    this.generateChart();
  }

  // Reset filter form
  private resetFilterForm(): void {
    this.newFilter = {
      field: '',
      operator: '=',
      value: ''
    };
  }

  // Change stack mode
  onStackModeChange(mode: string): void {
    this.stackMode = mode;
    this.renderChart();
  }

  // Change orientation
  onOrientationChange(orientation: string): void {
    this.stackOrientation = orientation;
    this.renderChart();
  }

  // Generate and fetch chart data
  generateChart(): void {
    // Validation
    if (!this.selectedDataset || !this.selectedDimension || this.selectedMeasures.length === 0) {
      this.chartError = 'Please select dataset, dimension, and at least one measure';
      this.chartReady = false;
      return;
    }

    this.chartError = '';
    this.chartLoading = true;
    this.chartReady = false;

    // Create user input
    const userInput: UserStackChartInput = {
      selectedDataset: this.selectedDataset,
      selectedDimension: this.selectedDimension,
      selectedBreakdownDimension: this.selectedBreakdownDimension || undefined,
      selectedMeasures: this.selectedMeasures,
      selectedFilters: this.selectedFilters,
      stackMode: this.stackMode as any,
      stackOrientation: this.stackOrientation as any
    };

    // Transform to backend config
    this.chartConfig = this.transformService.transformUserInputToBackendConfig(userInput);

    // Validate config
    const validation = this.transformService.validateBackendConfig(this.chartConfig);
    if (!validation.valid) {
      this.chartError = validation.errors.join(', ');
      this.chartLoading = false;
      return;
    }

    // Fetch data from service (dummy or real API)
    this.dataService.fetchChartData(this.chartConfig)
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        (data: StackChartData) => {
          this.chartData = data;
          this.chartLoading = false;
          this.chartReady = true;
          this.chartError = '';
          setTimeout(() => this.renderChart(), 0);
        },
        (error: any) => {
          this.chartError = 'Error loading chart data: ' + (error?.message || 'Unknown error');
          this.chartLoading = false;
          this.chartReady = false;
        }
      );
  }

  // Reset all selections
  resetChart(): void {
    this.selectedDataset = 'sales';
    this.selectedDimension = 'Region';
    this.selectedBreakdownDimension = '';
    this.selectedMeasures = ['Sales', 'Revenue'];
    this.selectedFilters = [];
    this.stackMode = 'normal';
    this.stackOrientation = 'vertical';
    this.chartReady = false;
    this.chartError = '';
    this.loadDimensionsAndMeasures();
  }

  // Get field by name
  getFieldDisplayName(fieldName: string): string {
    const field = this.availableFilterFields.find(f => f.name === fieldName);
    return field ? field.displayName : fieldName;
  }

  // Get filter operators based on selected field type
  getFilterOperatorsForField(fieldName: string): string[] {
    const field = this.availableFilterFields.find(f => f.name === fieldName);
    if (!field) {
      return this.filterOperators;
    }
    return this.configService.getFilterOperatorsByFieldType(field.dataType);
  }

  // Build Chart.js labels + datasets from fetched (already-aggregated) data.
  // Two modes:
  //  - No breakdown dimension: each selected MEASURE becomes a stack segment
  //    (e.g. Region -> [Sales, Revenue] segments).
  //  - Breakdown dimension set: each distinct value of that dimension becomes
  //    a stack segment for a single measure (e.g. Region -> [ProductA,
  //    ProductB, ProductC] segments of Sales), a classic pivoted stack chart.
  private buildDatasets(): { labels: string[]; datasets: ChartDataset<'bar'>[] } {
    return this.selectedBreakdownDimension
      ? this.buildPivotedDatasets()
      : this.buildMeasureSeriesDatasets();
  }

  // Segments = measures (Sales, Revenue, ...), one bar per dimension value
  private buildMeasureSeriesDatasets(): { labels: string[]; datasets: ChartDataset<'bar'>[] } {
    const rows = this.chartData?.data || [];
    const labels = rows.map(row => String(row[this.selectedDimension]));
    const isGrouped = this.stackMode === 'grouped';
    const isPercent = this.stackMode === 'percent';

    const rowTotals = rows.map(row =>
      this.selectedMeasures.reduce((sum, m) => sum + (Number(row[m]) || 0), 0)
    );

    const datasets: ChartDataset<'bar'>[] = this.selectedMeasures.map((measure, index) => ({
      label: measure,
      data: rows.map((row, i) => {
        const value = Number(row[measure]) || 0;
        if (isPercent) {
          return rowTotals[i] ? +((value / rowTotals[i]) * 100).toFixed(1) : 0;
        }
        return value;
      }),
      backgroundColor: this.colorPalette[index % this.colorPalette.length],
      borderRadius: 4,
      stack: isGrouped ? `stack-${index}` : 'stack-total'
    }));

    return { labels, datasets };
  }

  // Segments = distinct values of the breakdown dimension (e.g. Product),
  // one bar per primary dimension value (e.g. Region), single measure value.
  private buildPivotedDatasets(): { labels: string[]; datasets: ChartDataset<'bar'>[] } {
    const rows = this.chartData?.data || [];
    const measureField = this.selectedMeasures[0];
    const isGrouped = this.stackMode === 'grouped';
    const isPercent = this.stackMode === 'percent';

    // Preserve first-seen order for both axes
    const primaryValues: string[] = [];
    const breakdownValues: string[] = [];
    const lookup = new Map<string, Map<string, number>>();

    rows.forEach(row => {
      const primary = String(row[this.selectedDimension]);
      const breakdown = String(row[this.selectedBreakdownDimension]);
      if (!primaryValues.includes(primary)) primaryValues.push(primary);
      if (!breakdownValues.includes(breakdown)) breakdownValues.push(breakdown);
      if (!lookup.has(primary)) lookup.set(primary, new Map());
      lookup.get(primary)!.set(breakdown, Number(row[measureField]) || 0);
    });

    const rowTotals = primaryValues.map(primary =>
      breakdownValues.reduce((sum, b) => sum + (lookup.get(primary)?.get(b) || 0), 0)
    );

    const datasets: ChartDataset<'bar'>[] = breakdownValues.map((breakdown, index) => ({
      label: breakdown,
      data: primaryValues.map((primary, i) => {
        const value = lookup.get(primary)?.get(breakdown) || 0;
        if (isPercent) {
          return rowTotals[i] ? +((value / rowTotals[i]) * 100).toFixed(1) : 0;
        }
        return value;
      }),
      backgroundColor: this.colorPalette[index % this.colorPalette.length],
      borderRadius: 4,
      stack: isGrouped ? `stack-${index}` : 'stack-total'
    }));

    return { labels: primaryValues, datasets };
  }

  // Render the stack chart using Chart.js (dummy-data verification chart)
  private renderChart(): void {
    if (!this.canvasEl || !this.chartReady || !this.chartData?.data?.length) {
      return;
    }
    this.destroyChart();

    const { labels, datasets } = this.buildDatasets();
    const horizontal = this.stackOrientation === 'horizontal';
    const isPercent = this.stackMode === 'percent';

    this.chartInstance = new Chart(this.canvasEl.getContext('2d')!, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.formattedValue}${isPercent ? '%' : ''}`
            }
          }
        },
        scales: {
          x: { stacked: true, grid: { display: horizontal }, ticks: { font: { size: 11 }, color: '#94a3b8' } },
          y: { stacked: true, beginAtZero: true, grid: { display: !horizontal, color: '#f1f5f9' }, ticks: { font: { size: 11 }, color: '#94a3b8' } }
        }
      }
    });
  }

  private destroyChart(): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = undefined;
    }
  }
}
