import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { COMPONENT_REGISTRY, COMPONENT_REGISTRY_MAP } from './config/component-registry';
import { PREDEFINED_DATASETS } from './data/predefined-datasets';
import {
  DashboardComponentConfig,
  Dataset,
  FieldMetadata,
  FieldType,
  FilterState,
  KpiAggregation,
  PreviewPayload,
  SavedDashboard,
  SelectedMappings,
  ValidationResult
} from './models/dashboard.models';
import { detectFieldMetadata } from './utils/type-detection';
import { validateMappings } from './utils/validation';
import { buildPreviewPayload } from './utils/data-transform';
import { DashboardStorageService } from './services/dashboard-storage.service';
import { FieldListComponent } from './components/field-list/field-list.component';
import { ComponentSelectorComponent } from './components/component-selector/component-selector.component';
import { FieldMappingPanelComponent } from './components/field-mapping-panel/field-mapping-panel.component';
import { PreviewRendererComponent } from './components/preview-renderer/preview-renderer.component';
import { ImportModalComponent } from './components/import-modal/import-modal.component';
import { FilterPanelComponent } from './components/filter-panel/filter-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FieldListComponent,
    ComponentSelectorComponent,
    FieldMappingPanelComponent,
    PreviewRendererComponent,
    ImportModalComponent,
    FilterPanelComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  readonly datasets = PREDEFINED_DATASETS;
  readonly components = COMPONENT_REGISTRY;
  readonly kpiAggregations: KpiAggregation[] = ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT'];

  selectedDataset: Dataset | null = null;
  selectedComponent: DashboardComponentConfig | null = null;
  fieldMetadata: FieldMetadata[] = [];
  mappings: SelectedMappings = {};
  kpiAggregation: KpiAggregation = 'COUNT';
  chartAggregation: KpiAggregation = 'SUM';
  filters: FilterState = {};
  validationResult: ValidationResult = {
    isValid: false,
    messages: ['Import a dataset to start building your dashboard.']
  };
  previewPayload: PreviewPayload | null = null;

  showImportModal = false;
  dashboardName = 'Untitled dashboard';
  savedDashboards: SavedDashboard[] = [];
  toastMessage: string | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly storage: DashboardStorageService) {
    this.savedDashboards = this.storage.list();
  }

  get dataImported(): boolean {
    return this.selectedDataset !== null;
  }

  openImportModal(): void {
    this.showImportModal = true;
  }

  closeImportModal(): void {
    this.showImportModal = false;
  }

  onDatasetImported(datasetId: string): void {
    this.selectedDataset = this.datasets.find((dataset) => dataset.id === datasetId) ?? null;
    this.fieldMetadata = this.selectedDataset ? detectFieldMetadata(this.selectedDataset.rows) : [];
    this.selectedComponent = null;
    this.mappings = {};
    this.filters = {};
    this.previewPayload = null;
    this.kpiAggregation = 'COUNT';
    this.chartAggregation = 'SUM';
    this.showImportModal = false;
    this.dashboardName = this.selectedDataset ? `${this.selectedDataset.name} dashboard` : 'Untitled dashboard';
    this.validationResult = {
      isValid: false,
      messages: ['Select a dashboard component to configure field mappings.']
    };
    this.showToast(`Imported ${this.selectedDataset?.name} dataset.`);
  }

  onComponentSelected(componentId: string): void {
    this.selectedComponent = COMPONENT_REGISTRY_MAP[componentId] ?? null;
    this.resetMappings();
    this.runValidationAndPreview();
  }

  onMappingChanged(change: { key: string; value: string | string[] | null }): void {
    this.mappings = {
      ...this.mappings,
      [change.key]: change.value
    };
    this.runValidationAndPreview();
  }

  onKpiAggregationChanged(aggregation: KpiAggregation): void {
    this.kpiAggregation = aggregation;
    this.runValidationAndPreview();
  }

  onChartAggregationChanged(aggregation: KpiAggregation): void {
    this.chartAggregation = aggregation;
    this.runValidationAndPreview();
  }

  onFiltersChanged(filters: FilterState): void {
    this.filters = filters;
    this.runValidationAndPreview();
  }

  isFieldCompatibleWithSelectedComponent(field: FieldMetadata): boolean {
    if (!this.selectedComponent) {
      return true;
    }

    const acceptedTypes = new Set<FieldType | 'any'>();
    for (const mapping of this.selectedComponent.requiredMappings) {
      mapping.acceptedTypes.forEach((type) => acceptedTypes.add(type));
    }

    if (acceptedTypes.has('any')) {
      return true;
    }

    return acceptedTypes.has(field.type);
  }

  newDashboard(): void {
    this.selectedDataset = null;
    this.selectedComponent = null;
    this.fieldMetadata = [];
    this.mappings = {};
    this.filters = {};
    this.previewPayload = null;
    this.dashboardName = 'Untitled dashboard';
    this.validationResult = {
      isValid: false,
      messages: ['Import a dataset to start building your dashboard.']
    };
  }

  saveDashboard(): void {
    if (!this.selectedDataset || !this.selectedComponent) {
      this.showToast('Import a dataset and pick a component before saving.');
      return;
    }

    const dashboard: SavedDashboard = {
      id: `dash-${Date.now()}`,
      name: this.dashboardName.trim() || 'Untitled dashboard',
      datasetId: this.selectedDataset.id,
      datasetName: this.selectedDataset.name,
      componentId: this.selectedComponent.id,
      componentLabel: this.selectedComponent.label,
      mappings: this.mappings,
      kpiAggregation: this.kpiAggregation,
      filters: this.filters,
      createdAt: Date.now()
    };

    this.savedDashboards = this.storage.save(dashboard);
    this.showToast(`Saved "${dashboard.name}".`);
  }

  loadDashboard(dashboard: SavedDashboard): void {
    this.selectedDataset = this.datasets.find((dataset) => dataset.id === dashboard.datasetId) ?? null;
    this.fieldMetadata = this.selectedDataset ? detectFieldMetadata(this.selectedDataset.rows) : [];
    this.selectedComponent = COMPONENT_REGISTRY_MAP[dashboard.componentId] ?? null;
    this.mappings = { ...dashboard.mappings };
    this.filters = { ...dashboard.filters };
    this.kpiAggregation = dashboard.kpiAggregation;
    this.dashboardName = dashboard.name;
    this.runValidationAndPreview();
    this.showToast(`Opened "${dashboard.name}".`);
  }

  deleteDashboard(dashboard: SavedDashboard, event: Event): void {
    event.stopPropagation();
    this.savedDashboards = this.storage.remove(dashboard.id);
    this.showToast(`Deleted "${dashboard.name}".`);
  }

  generateReport(): void {
    // Placeholder feature: report export is not implemented yet.
    this.showToast('Report generation is coming soon.');
  }

  private resetMappings(): void {
    if (!this.selectedComponent) {
      this.mappings = {};
      return;
    }

    const initializedMappings: SelectedMappings = {};
    for (const mapping of this.selectedComponent.requiredMappings) {
      initializedMappings[mapping.key] = mapping.multiple ? [] : null;
    }

    this.mappings = initializedMappings;
    this.kpiAggregation = this.selectedComponent.id === 'kpiCard' ? 'COUNT' : this.kpiAggregation;
  }

  private runValidationAndPreview(): void {
    if (!this.selectedDataset) {
      this.previewPayload = null;
      this.validationResult = {
        isValid: false,
        messages: ['Import a dataset to begin dashboard building.']
      };
      return;
    }

    if (!this.selectedComponent) {
      this.previewPayload = null;
      this.validationResult = {
        isValid: false,
        messages: ['Select a dashboard component to preview.']
      };
      return;
    }

    this.validationResult = validateMappings(
      this.selectedComponent,
      this.fieldMetadata,
      this.mappings,
      this.kpiAggregation,
      this.selectedDataset.rows
    );

    if (!this.validationResult.isValid) {
      this.previewPayload = null;
      return;
    }

    const aggregation = this.selectedComponent.type === 'kpi' ? this.kpiAggregation : this.chartAggregation;

    this.previewPayload = buildPreviewPayload(
      this.selectedComponent,
      this.mappings,
      this.selectedDataset.rows,
      aggregation,
      this.filters
    );
  }

  private showToast(message: string): void {
    this.toastMessage = message;
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => (this.toastMessage = null), 2800);
  }
}
