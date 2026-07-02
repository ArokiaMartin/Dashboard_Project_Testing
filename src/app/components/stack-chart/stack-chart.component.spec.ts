import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { StackChartComponent } from './stack-chart.component';
import { StackChartConfigService } from './services/stack-chart-config.service';
import { StackChartDataService } from './services/stack-chart-data.service';
import { StackChartTransformService } from './services/stack-chart-transform.service';

describe('StackChartComponent', () => {
  let component: StackChartComponent;
  let fixture: ComponentFixture<StackChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [StackChartComponent],
      imports: [FormsModule],
      providers: [
        StackChartConfigService,
        StackChartDataService,
        StackChartTransformService
      ]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(StackChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with default values', () => {
    expect(component.selectedDataset).toBe('sales');
    expect(component.selectedDimension).toBe('Region');
    expect(component.selectedMeasures.length).toBeGreaterThan(0);
  });

  it('should load dimensions and measures on init', () => {
    expect(component.availableDimensions.length).toBeGreaterThan(0);
    expect(component.availableMeasures.length).toBeGreaterThan(0);
  });

  it('should add a measure to selectedMeasures', () => {
    const initialLength = component.selectedMeasures.length;
    component.addMeasure('Profit');
    expect(component.selectedMeasures.length).toBe(initialLength + 1);
  });

  it('should remove a measure from selectedMeasures', () => {
    component.selectedMeasures = ['Sales', 'Revenue'];
    component.removeMeasure('Sales');
    expect(component.selectedMeasures).toEqual(['Revenue']);
  });

  it('should add a filter', () => {
    component.newFilter = { field: 'Year', operator: '=', value: '2024' };
    component.addFilter();
    expect(component.selectedFilters.length).toBeGreaterThan(0);
    expect(component.newFilter.field).toBe('');
  });

  it('should remove a filter', () => {
    component.selectedFilters = [
      { field: 'Year', operator: '=', value: '2024' }
    ];
    component.removeFilter(0);
    expect(component.selectedFilters.length).toBe(0);
  });

  it('should validate chart creation', () => {
    component.selectedDataset = '';
    component.chartError = '';
    component.generateChart();
    expect(component.chartError).toBeTruthy();
  });

  it('should reset chart', () => {
    component.resetChart();
    expect(component.selectedDataset).toBe('sales');
    expect(component.selectedDimension).toBe('Region');
    expect(component.chartReady).toBe(false);
  });
});
