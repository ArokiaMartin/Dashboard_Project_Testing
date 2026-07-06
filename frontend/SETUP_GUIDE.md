# Angular Frontend Setup Guide

## Quick Start

### 1. Installation

```bash
cd dynamic-dashboard/frontend
npm install
```

### 2. Development Server

```bash
npm start
```

Open browser at `http://localhost:4200`

### 3. Production Build

```bash
npm run build:prod
```

Output: `dist/dynamic-dashboard/`

---

## Project Overview

### Architecture

**Standalone Components**: All components are Angular 17+ standalone
- No module declarations needed
- Tree-shakeable and optimized
- Bootstrapped via `bootstrapApplication` in main.ts

**Reactive Services**: Using RxJS Subjects for state management
- `DashboardService`: API communication
- `SchemaService`: Schema state
- `VisualizationService`: Data transformation

**Responsive UI**: Bootstrap 5 + Custom SCSS
- Mobile-first design
- Dark mode support
- Print-friendly layouts

---

## Key Components

### 1. Dashboard Uploader (`dashboard-uploader.component.ts`)
- **Purpose**: Accept JSON schema files
- **Features**: Drag-drop, file validation, progress feedback
- **Inputs**: None
- **Outputs**: `schemaLoaded: EventEmitter<TableSchema>`
- **Dependencies**: `DashboardService`, `SchemaService`

### 2. Model Explorer (`model-explorer.component.ts`)
- **Purpose**: Browse schema structure
- **Features**: Dimension/measure categorization, column details
- **Inputs**: None
- **Outputs**: None
- **Dependencies**: `SchemaService`

### 3. Field Picker (`field-picker.component.ts`)
- **Purpose**: Select fields for chart creation
- **Features**: Checkbox selection, validation, requirement checking
- **Inputs**: `chartType: string`
- **Outputs**: `selectionChanged: EventEmitter<FieldSelection>`
- **Dependencies**: `SchemaService`

### 4. Chart Selector (`chart-selector.component.ts`)
- **Purpose**: Choose visualization type
- **Features**: Visual cards, descriptions, selection state
- **Inputs**: None
- **Outputs**: `chartSelected: EventEmitter<ChartType>`
- **Dependencies**: None

### 5. Widget Components

#### Bar Chart Widget
```typescript
@Input() widget: Widget
@Input() data: AggregatedData
```

#### Line Chart Widget
```typescript
@Input() widget: Widget
@Input() data: AggregatedData
```

#### Pie Chart Widget
```typescript
@Input() widget: Widget
@Input() data: AggregatedData
```

#### Table Widget
```typescript
@Input() widget: Widget
@Input() data: PaginatedData | any[]
```

#### KPI Widget
```typescript
@Input() widget: Widget
@Input() data: any
@Input() comparisonData?: any
```

### 6. Dashboard Renderer (`dashboard-renderer.component.ts`)
- **Purpose**: Display complete dashboard
- **Features**: Widget layout, data loading, refresh, export
- **Inputs**: `dashboard: Dashboard`
- **Outputs**: None
- **Dependencies**: All services and widgets

---

## Services

### DashboardService
```typescript
// Schema operations
uploadSchema(file: File): Observable<SchemaResponse>
getSchema(): Observable<SchemaResponse>

// Dashboard operations
createDashboard(dashboard: Dashboard): Observable<DashboardResponse>
getDashboard(id: string): Observable<DashboardResponse>
updateDashboard(id: string, dashboard: Partial<Dashboard>): Observable<DashboardResponse>
deleteDashboard(id: string): Observable<DashboardResponse>
listDashboards(): Observable<...>

// Widget operations
addWidget(dashboardId: string, widget: Widget): Observable<DashboardResponse>
removeWidget(dashboardId: string, widgetId: string): Observable<DashboardResponse>
updateWidget(dashboardId: string, widgetId: string, widget: Partial<Widget>): Observable<DashboardResponse>

// Data operations
getChartData(...): Observable<DataResponse>
getAggregatedData(...): Observable<...>
getTableData(...): Observable<...>
getKPIData(...): Observable<DataResponse>

// Utilities
exportDashboard(dashboardId: string): Observable<Blob>
importDashboard(file: File): Observable<DashboardResponse>
```

### SchemaService
```typescript
// Schema management
loadSchema(): Observable<TableSchema | null>
setSchema(schema: TableSchema): void
getSchema(): Observable<TableSchema | null>

// Field access
getDimensions(): Observable<Column[]>
getMeasures(): Observable<Column[]>
getDimensionNames(): string[]
getMeasureNames(): string[]

// Validation
fieldExists(fieldName: string): boolean
getFieldType(fieldName: string): string | null
getColumn(name: string): Column | undefined

// Status
isLoaded(): Observable<boolean>
clearSchema(): void
```

### VisualizationService
```typescript
// Chart data preparation
prepareBarChartData(data: AggregatedData, xField: string, yField: string): VisualizationData
prepareLineChartData(data: AggregatedData, xField: string, yFields: string[]): VisualizationData
preparePieChartData(data: AggregatedData, labelField: string, valueField: string): VisualizationData
prepareGroupedChartData(data: AggregatedData, xField: string, yField: string, seriesField: string): VisualizationData

// Chart configuration
getChartOptions(chartType: string, config?: any): any

// Formatting
formatNumber(value: number, decimals?: number): string
formatCurrency(value: number, currency?: string): string
formatPercentage(value: number, decimals?: number): string

// Data manipulation
sortData(data: AggregatedData, field: string, ascending?: boolean): AggregatedData
filterDataByThreshold(data: AggregatedData, field: string, threshold: number, operator?: string): AggregatedData
limitData(data: AggregatedData, limit: number, orderBy?: string): AggregatedData

// Utilities
getSeriesColor(index: number): string
generateColors(count: number): string[]
```

---

## Type System

All types defined in `src/app/types/dashboard.types.ts`:

```typescript
// Core domain types
interface Dashboard { ... }
interface Widget { ... }
interface TableSchema { ... }
interface Column { ... }
interface FieldSelection { ... }

// Configuration types
interface ChartConfig { ... }
interface KPIConfig { ... }
interface TableConfig { ... }
interface ChartOptions { ... }

// API response types
interface DashboardResponse { ... }
interface DataResponse { ... }
interface SchemaResponse { ... }

// Chart data types
interface VisualizationData { ... }
interface Dataset { ... }

// Data types
interface PaginatedData { ... }
interface AggregatedData { ... }
interface FilterCondition { ... }
```

---

## API Configuration

### Development Environment
File: `src/environments/environment.ts`
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000/api',
  wsUrl: 'ws://localhost:5000',
};
```

### Production Environment
File: `src/environments/environment.prod.ts`
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://api.example.com/api',
  wsUrl: 'wss://api.example.com',
};
```

---

## File Structure Reference

```
frontend/
├── src/
│   ├── app/
│   │   ├── components/          # All UI components
│   │   │   ├── *widget.component.ts
│   │   │   ├── *.component.html
│   │   │   └── *.component.scss
│   │   ├── services/            # Business logic
│   │   │   ├── dashboard.service.ts
│   │   │   ├── schema.service.ts
│   │   │   └── visualization.service.ts
│   │   ├── types/              # TypeScript interfaces
│   │   │   └── dashboard.types.ts
│   │   ├── app.module.ts       # Root module
│   │   └── app.routing.ts      # Route definitions
│   ├── environments/           # Environment configs
│   │   ├── environment.ts
│   │   └── environment.prod.ts
│   ├── main.ts                # Bootstrap entry
│   ├── index.html
│   └── styles.scss            # Global styles
├── angular.json              # Angular CLI config
├── tsconfig.json             # TypeScript config
├── package.json              # Dependencies
├── .eslintrc.json           # Linting rules
├── .gitignore               # Git ignore rules
├── README.md                # Documentation
└── SETUP_GUIDE.md          # This file
```

---

## Development Workflow

### 1. Add New Component

```bash
# Generate component files
ng generate component components/my-component
```

Structure your component as standalone:
```typescript
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-my-component',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-component.component.html',
  styleUrls: ['./my-component.component.scss'],
})
export class MyComponentComponent {}
```

### 2. Add New Service

```typescript
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class MyService {
  constructor() {}
}
```

### 3. Add Route

Update `src/app/app.routing.ts`:
```typescript
export const routes: Routes = [
  { path: 'my-route', component: MyComponent },
];
```

### 4. Style Component

Create `*.component.scss`:
```scss
.my-class {
  color: #333;
  
  @media (max-width: 768px) {
    color: #666;
  }
}
```

---

## Testing

### Unit Tests
```bash
npm test
```

### E2E Tests
```bash
npm run e2e
```

### Test Coverage
```bash
npm run test -- --code-coverage
```

---

## Debugging

### Browser DevTools

1. Open Chrome DevTools (F12)
2. Sources tab: Set breakpoints in TypeScript
3. Console tab: Angular debugging commands:
```javascript
ng.getComponent($0)              // Get component from DOM element
ng.probe($0)                      // Get component injector
ng.coreTokens.NgModuleRef        // Access services
```

### VS Code Debugging

Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "ng serve",
      "type": "chrome",
      "request": "launch",
      "preLaunchTask": "npm: start",
      "url": "http://localhost:4200",
      "webRoot": "${workspaceFolder}"
    }
  ]
}
```

---

## Performance Tips

1. **Change Detection**: Use `ChangeDetectionStrategy.OnPush`
2. **Lazy Loading**: Split routes into feature modules
3. **Unsubscribe**: Use async pipe or takeUntilDestroyed()
4. **Memoization**: Cache expensive computations
5. **Virtual Scrolling**: For large lists (future enhancement)

---

## Common Issues & Solutions

### Chart Not Rendering
- Verify Chart.js is installed: `npm list chart.js`
- Check data format matches config
- Ensure canvas element is rendered

### CORS Errors
- Backend must allow origin in headers
- Check API URL in environment config
- Use proxy configuration for dev server

### API 404 Errors
- Verify backend is running
- Check API endpoint in environment config
- Use browser network tab to debug requests

### Styling Issues
- Clear cache: `npm run build --delete-output-path`
- Ensure Bootstrap CSS is loaded
- Check scoped styles don't conflict

---

## Deployment Checklist

- [ ] Update API URLs in environment.prod.ts
- [ ] Remove console.log statements
- [ ] Test all components in production build
- [ ] Verify CORS configuration on backend
- [ ] Set up error logging/monitoring
- [ ] Configure CDN for static assets
- [ ] Enable compression on web server
- [ ] Set appropriate cache headers
- [ ] Test on target browsers
- [ ] Run security audit: `npm audit`

---

## Security Considerations

1. **Input Validation**: All user inputs validated before API calls
2. **XSS Prevention**: Angular's built-in sanitization
3. **CSRF Protection**: Include CSRF tokens in requests
4. **Dependencies**: Regular security updates
5. **Secrets**: Never commit credentials; use environment variables

---

## Additional Resources

- [Angular Docs](https://angular.io/docs)
- [Chart.js Docs](https://www.chartjs.org/docs/latest/)
- [Bootstrap Docs](https://getbootstrap.com/docs/)
- [RxJS Docs](https://rxjs.dev/)
- [TypeScript Docs](https://www.typescriptlang.org/docs/)

---

## Support

For issues:
1. Check console errors (F12)
2. Review API responses in Network tab
3. Check backend logs
4. Verify environment configuration
5. Run `npm install` if dependencies are missing
