# Dynamic Dashboard - Angular Frontend

A production-ready Angular 17+ frontend for the Dynamic Dashboard application. This frontend provides an interactive interface for creating, configuring, and visualizing dashboards with support for multiple chart types and data visualizations.

## Features

- **Schema Upload & Exploration**: Upload JSON schemas to define your data structure
- **Model Explorer**: Browse and explore dimensions and measures in your data
- **Field Picker**: Select fields for chart configuration with validation
- **Chart Types**: Support for Bar, Line, Pie charts, Tables, and KPI cards
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Real-time Data**: Integration with backend API for live data visualization
- **Data Aggregation**: Group and aggregate data by dimensions and measures
- **Pagination & Sorting**: Table widgets with advanced pagination and sorting
- **KPI Tracking**: Compare metrics against previous periods with trend indicators
- **Export/Import**: Save and restore dashboard configurations

## Tech Stack

- **Angular**: 17.3.0
- **TypeScript**: 5.2.2
- **Chart.js**: 4.4.0 with ng2-charts
- **Bootstrap**: 5.3.2 for responsive styling
- **RxJS**: 7.8.1 for reactive programming
- **ng-bootstrap**: 16.0.0 for Bootstrap components

## Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   ├── app.component.ts           # Main app component
│   │   │   ├── navbar.component.ts        # Navigation bar
│   │   │   ├── dashboard-uploader.component.ts
│   │   │   ├── model-explorer.component.ts
│   │   │   ├── field-picker.component.ts
│   │   │   ├── chart-selector.component.ts
│   │   │   ├── dashboard-renderer.component.ts
│   │   │   ├── bar-chart-widget.component.ts
│   │   │   ├── line-chart-widget.component.ts
│   │   │   ├── pie-chart-widget.component.ts
│   │   │   ├── table-widget.component.ts
│   │   │   └── kpi-widget.component.ts
│   │   ├── services/
│   │   │   ├── dashboard.service.ts       # API calls
│   │   │   ├── schema.service.ts          # Schema state management
│   │   │   └── visualization.service.ts   # Data preparation for charts
│   │   ├── types/
│   │   │   └── dashboard.types.ts         # TypeScript interfaces
│   │   ├── app.module.ts
│   │   └── app.routing.ts
│   ├── environments/
│   │   ├── environment.ts                 # Development config
│   │   └── environment.prod.ts            # Production config
│   ├── main.ts                            # Application entry point
│   ├── index.html
│   └── styles.scss                        # Global styles
├── angular.json
├── tsconfig.json
├── package.json
└── README.md
```

## Installation

### Prerequisites

- Node.js 18+
- npm 9+ or yarn 3+

### Setup

1. Navigate to the frontend directory:
```bash
cd dynamic-dashboard/frontend
```

2. Install dependencies:
```bash
npm install
```

3. Configure API endpoint in `src/environments/environment.ts`:
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000/api',
  wsUrl: 'ws://localhost:5000',
};
```

## Running the Application

### Development Server

```bash
npm start
```

The application will start on `http://localhost:4200/`. Changes are automatically reloaded.

### Production Build

```bash
npm run build:prod
```

Build artifacts are stored in the `dist/dynamic-dashboard` directory.

## Usage Guide

### 1. Upload Schema

1. Navigate to the Upload page
2. Select or drag-drop a JSON schema file
3. Format should match:
```json
{
  "name": "table_name",
  "columns": [
    {
      "name": "column_name",
      "type": "string|number|date|boolean",
      "description": "optional description"
    }
  ]
}
```

### 2. Explore Model

After uploading:
- View all dimensions (string, date, boolean fields)
- View all measures (numeric fields)
- Click columns to see detailed information

### 3. Create Dashboard

1. Select chart type (Bar, Line, Pie, Table, KPI)
2. Pick fields:
   - Dimensions: Categorical fields for grouping
   - Measures: Numeric fields for aggregation
3. Configure chart options
4. Save dashboard

### 4. View Dashboard

- Charts load automatically with data from backend
- Interactive features:
  - Hover for details on charts
  - Sort and paginate tables
  - Refresh all widgets
  - Export dashboard configuration

## Component Details

### Dashboard Uploader
- File upload with drag-and-drop support
- JSON schema validation
- Error handling and success feedback

### Model Explorer
- Two-panel view for dimensions and measures
- Column type indicators with color coding
- Expandable column details

### Field Picker
- Checkbox selection for dimensions and measures
- Validation based on chart type requirements
- Real-time selection summary

### Chart Selector
- Visual cards for each chart type
- Descriptions and use cases
- Selection state management

### Widget Components

#### Bar Chart Widget
```typescript
@Input() widget: Widget;
@Input() data: AggregatedData;
```
Configuration:
- xAxisField: Category field
- yAxisField: Value field

#### Line Chart Widget
```typescript
@Input() widget: Widget;
@Input() data: AggregatedData;
```
Configuration:
- xAxisField: Time/category field
- measures: Array of numeric fields

#### Pie Chart Widget
```typescript
@Input() widget: Widget;
@Input() data: AggregatedData;
```
Configuration:
- dimensions[0]: Labels
- measures[0]: Values

#### Table Widget
```typescript
@Input() widget: Widget;
@Input() data: PaginatedData;
```
Features:
- Automatic column detection
- Sorting by any column
- Pagination with size control
- Null value handling

#### KPI Widget
```typescript
@Input() widget: Widget;
@Input() data: any;
@Input() comparisonData?: any;
```
Features:
- Primary metric display
- Comparison with previous period
- Trend indicator (up/down)
- Percentage change calculation

## Services

### DashboardService
API integration for:
- Schema upload and retrieval
- Dashboard CRUD operations
- Widget management
- Data aggregation and retrieval
- Chart data fetching
- KPI calculations
- Table data with pagination
- Dashboard import/export

### SchemaService
State management for:
- Current schema
- Available dimensions and measures
- Field validation
- Schema loading status

### VisualizationService
Data preparation and formatting:
- Chart data transformation
- Color management
- Number formatting (currency, percentage)
- Data sorting and filtering
- Top-N selection

## Type Definitions

Key interfaces in `src/app/types/dashboard.types.ts`:

```typescript
interface Dashboard {
  id: string;
  name: string;
  schema: TableSchema;
  widgets: Widget[];
}

interface Widget {
  id: string;
  type: 'chart' | 'table' | 'kpi';
  title: string;
  config: ChartConfig | TableConfig | KPIConfig;
}

interface ChartConfig {
  type: 'bar' | 'line' | 'pie';
  xAxisField: string;
  yAxisField: string;
  dimensions?: string[];
  measures?: string[];
}
```

## Styling

### Global Styles (`src/styles.scss`)
- Bootstrap 5 integration
- Custom color scheme
- Responsive utilities
- Dark mode support

### Component Styles
Each component includes scoped SCSS with:
- Responsive breakpoints
- Hover/active states
- Animations and transitions
- Print media queries

## API Integration

### Authentication
Modify `dashboard.service.ts` to add:
```typescript
import { HttpInterceptor, HttpRequest, HttpHandler } from '@angular/common/http';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler) {
    const token = localStorage.getItem('auth_token');
    if (token) {
      req = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
    }
    return next.handle(req);
  }
}
```

### Error Handling
Services include error handling with user-friendly messages:
```typescript
catchError((error) => {
  console.error('Error:', error);
  return of({ success: false, error: error.message });
})
```

## Testing

Run unit tests:
```bash
npm test
```

Run end-to-end tests:
```bash
npm run e2e
```

## Performance Optimization

- Standalone components for reduced bundle size
- OnPush change detection strategy
- Lazy loading of chart libraries
- Virtual scrolling for large tables (future enhancement)
- Image optimization for exports

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Deployment

### Docker Build

Create `Dockerfile`:
```dockerfile
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build:prod

FROM nginx:alpine
COPY --from=builder /app/dist/dynamic-dashboard /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Build and run:
```bash
docker build -t dynamic-dashboard-frontend .
docker run -p 80:80 dynamic-dashboard-frontend
```

### Nginx Configuration

```nginx
server {
  listen 80;
  location / {
    root /usr/share/nginx/html;
    try_files $uri $uri/ /index.html;
  }
  location /api {
    proxy_pass http://backend:5000;
  }
}
```

## Troubleshooting

### Build Errors
```bash
# Clear cache and reinstall
rm -rf node_modules dist
npm install
npm run build
```

### CORS Issues
Configure backend CORS headers:
```python
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response
```

### Chart Not Rendering
- Verify data format matches widget configuration
- Check browser console for errors
- Ensure Chart.js library is loaded

## Contributing

1. Follow Angular style guide
2. Use strict TypeScript settings
3. Add unit tests for new features
4. Document public APIs
5. Format code with Prettier

## License

Copyright (c) 2024. All rights reserved.

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review backend API documentation
3. Check browser console for error messages
4. Verify API endpoint configuration
