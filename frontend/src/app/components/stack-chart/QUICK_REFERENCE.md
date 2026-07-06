# Stack Chart Component - Quick Reference

## Where to see it
| Route | What |
|---|---|
| `/stack-chart` | Standalone full-page builder |
| `/builder` -> click **STACK CHART** | Embedded inside Dashboard Builder |

## File -> Purpose

| File | Purpose |
|---|---|
| `stack-chart.component.ts` | State, event handlers, Chart.js render logic |
| `stack-chart.component.html` | Config UI, chart canvas, JSON/data viewers |
| `stack-chart.component.scss` | Styles (`:host { display:block }` fix included) |
| `stack-chart.component.spec.ts` | Unit tests (`ng test`) |
| `models/stack-chart.model.ts` | All TypeScript interfaces / data contract |
| `services/stack-chart-config.service.ts` | Available dimensions/measures per dataset |
| `services/stack-chart-data.service.ts` | **The file to swap for the real API** |
| `services/stack-chart-transform.service.ts` | UI selections -> backend config JSON |
| `constants/stack-chart-dummy-data.ts` | Dummy-only fake data (delete when live) |

## Two chart modes

**No breakdown dimension** — stack segments = measures
```
Dimension: Region | Measures: Sales, Revenue
-> dimensions: ["Region"], measures: [Sales, Revenue]
-> one bar per Region, segments = Sales + Revenue (totals across everything else)
```

**Breakdown dimension set** — stack segments = a second dimension's values
```
Dimension: Region | Break Down By: Product | Measure: Sales (forced single)
-> dimensions: ["Region", "Product"], measures: [Sales]
-> one bar per Region, segments = ProductA/B/C (SUM(Sales) per Region+Product)
```

## Stack modes
| Mode | Behavior |
|---|---|
| `normal` | Segments stacked, absolute values |
| `percent` | Segments normalized so each bar sums to 100 |
| `grouped` | Segments placed side-by-side instead of stacked |

## Go live checklist
1. Confirm backend accepts `StackChartConfig` (dataset, dimensions[], measures[], filters, sorting, pagination).
2. Confirm backend returns `{ data: [...flat rows...], metadata: {...} }` where each row is keyed by dimension field(s) + measure alias(es).
3. In `stack-chart-data.service.ts`, replace the dummy body of `fetchChartData()` with `this.http.post(...)`.
4. (Optional) Point `stack-chart-config.service.ts` at a real metadata endpoint.
5. Delete `constants/stack-chart-dummy-data.ts`.

No other file needs to change.

## Common tasks
| Task | Where |
|---|---|
| Add a new dataset/field for testing | `constants/stack-chart-dummy-data.ts` |
| Change aggregation defaults | `services/stack-chart-config.service.ts` -> `getDefaultAggregation()` |
| Change backend config shape | `models/stack-chart.model.ts` + `services/stack-chart-transform.service.ts` |
| Change chart colors | `stack-chart.component.ts` -> `colorPalette` |
| Change chart library options (legend, tooltip, axes) | `stack-chart.component.ts` -> `renderChart()` |
