# Stack Chart Component Documentation

## Overview
The Stack Chart Component is a reusable, standalone Angular component that builds
configurable stacked bar charts. It renders a real Chart.js chart against dummy
data that mimics a real backend's GROUP BY/aggregation behavior, so it can be
verified end-to-end before the real API exists — and swapped over with a
one-line change when it does.

**Status:** Working, chart-verified against dummy data. Ready for real API integration.

---

## Component Structure

```
stack-chart/
├── models/
│   └── stack-chart.model.ts              # TypeScript interfaces and types
├── services/
│   ├── stack-chart-config.service.ts     # Available fields/options per dataset
│   ├── stack-chart-data.service.ts       # Fetches + aggregates data (dummy today, real API later)
│   └── stack-chart-transform.service.ts  # UI selections -> backend config JSON
├── constants/
│   └── stack-chart-dummy-data.ts         # Dummy raw "fact table" data (delete when real API lands)
├── stack-chart.component.ts              # Main component logic + Chart.js rendering
├── stack-chart.component.html            # Component template
├── stack-chart.component.scss            # Component styles
├── stack-chart.component.spec.ts         # Unit tests
└── README.md                             # This file
```

---

## Two ways to view it

| Route | What it is |
|---|---|
| `/stack-chart` | Standalone, full-page Stack Chart builder |
| `/builder` → click **STACK CHART** | Embedded as a visualization option inside Dashboard Builder |

Both use the exact same `<app-stack-chart>` component — no duplicated logic.

---

## User Controls

| Control | Purpose |
|---|---|
| **Dataset** | Which table/dataset to query (`sales`, `employee`) |
| **Dimension (X-axis)** | Primary GROUP BY field, e.g. `Region` |
| **Break Down By (optional)** | A *second* GROUP BY field, e.g. `Product`. When set, the stack segments become the distinct values of this field instead of the selected measures (see "Two chart modes" below) |
| **Stack Mode** | `normal` (stacked), `percent` (normalized to 100%), `grouped` (side-by-side bars) |
| **Orientation** | `vertical` or `horizontal` bars |
| **Measures** | Multi-select when no breakdown dimension; auto-collapses to a single measure when a breakdown dimension is chosen |
| **Filters** | `field / operator / value` rules, ANDed together |

---

## Two chart modes (this is the important part)

### Mode A — No breakdown dimension (segments = measures)
```
Dimension: Region
Measures:  Sales, Revenue
```
Backend config:
```json
{ "dimensions": ["Region"], "measures": [{"field":"Sales","aggregation":"SUM","alias":"Sales"}, {"field":"Revenue","aggregation":"SUM","alias":"Revenue"}] }
```
Chart: one bar per Region, each bar stacked with a Sales segment + a Revenue segment (both are **totals aggregated across every Product/Month** in that region).

### Mode B — Breakdown dimension set (segments = a second dimension's values)
```
Dimension:      Region
Break Down By:  Product
Measure:        Sales (single, forced)
```
Backend config:
```json
{ "dimensions": ["Region", "Product"], "measures": [{"field":"Sales","aggregation":"SUM","alias":"Sales"}] }
```
Chart: one bar per Region, each bar stacked with a segment per Product (ProductA/B/C), showing SUM(Sales) for that Region+Product combination. This is the classic BI "pivot" stack chart — rows=Region, columns=Product, value=SUM(Sales).

Both modes send `dimensions` as an **array** — the backend's GROUP BY contract already supports multiple dimensions, this component just now uses that.

---

## File Descriptions

### `models/stack-chart.model.ts`
All TypeScript interfaces: `StackChartConfig` (exact backend request shape),
`MeasureConfig`, `FilterRule`, `AvailableField`, `UserStackChartInput` (what the
UI collects, including the optional `selectedBreakdownDimension`). Change this
first if your real API's field names differ.

### `services/stack-chart-config.service.ts`
Pure metadata provider — given a dataset name, returns its available dimensions,
measures, filter operators, and default aggregations. Reads from
`stack-chart-dummy-data.ts` today; would call a schema/metadata endpoint for a
real backend.

### `services/stack-chart-data.service.ts`
The only file that talks to "the backend." `fetchChartData(config)`:
1. Loads the raw fact rows for `config.dataset`.
2. **WHERE** — `applyFilters()`.
3. **GROUP BY** — `groupAndAggregate()` groups rows by every field in
   `config.dimensions` (one or many) and aggregates each measure with
   SUM/AVG/COUNT/MAX/MIN via `aggregate()`. This is what fixes duplicate
   category labels — grouping by `["Region"]` alone always collapses to one
   row per region.
4. **ORDER BY** — `applySorting()`.
5. **TOP/OFFSET** — `applyPagination()`.

**To go live:** replace the body with `return this.http.post<StackChartData>(url, config)`.
The response must be an array of flat rows keyed by the dimension field(s) +
measure alias(es), e.g. `{ Region: "North", Product: "ProductA", Sales: 15000 }`.

### `services/stack-chart-transform.service.ts`
Converts `UserStackChartInput` → `StackChartConfig`. Builds the `dimensions`
array (primary + optional breakdown), builds `measures[]` with a default
aggregation per field, wraps `selectedFilters` into the `{condition, rules}`
shape, and sets default sorting/pagination. Also validates the generated
config (`validateBackendConfig`) before it's sent.

### `constants/stack-chart-dummy-data.ts`
**Dummy only — delete once real API is wired up.** Contains:
- `DUMMY_DATASETS` — which dimensions/measures exist per dataset (used by the config service).
- `RAW_SALES_FACTS` / `RAW_EMPLOYEE_FACTS` — deterministic, seeded fake transaction-level rows (e.g. 4 regions × 3 products × 4 months = 48 sales rows) that `stack-chart-data.service.ts` groups and aggregates, standing in for a real database table.

### `stack-chart.component.ts`
Orchestrates everything:
- Holds all user selections and chart/loading/error state.
- `generateChart()` — validates selections, builds `UserStackChartInput`,
  transforms it to `StackChartConfig`, calls the data service, stores the result.
- `buildDatasets()` — picks between `buildMeasureSeriesDatasets()` (Mode A) and
  `buildPivotedDatasets()` (Mode B) to produce Chart.js `{labels, datasets}`.
- `renderChart()` / `destroyChart()` — owns the Chart.js instance rendered into
  the `<canvas #stackCanvas>`.

### `stack-chart.component.html`
Dropdowns for Dataset/Dimension/Break Down By/Stack Mode/Orientation, the
measures & filters chip-builders, the `<canvas>`, and two collapsible
`<details>` panels — **Backend Config (JSON)** and **Raw Chart Data** — so you
can visually audit exactly what would be sent to, and received from, a real API.

### `stack-chart.component.scss`
Styling only. Includes `:host { display: block; width: 100%; }` — required
because Angular custom elements default to `display: inline` and will collapse
to zero width without it.

### `stack-chart.component.spec.ts`
Jasmine unit tests — component creation, default values, add/remove measure,
add/remove filter, validation, reset. Run with `ng test`.

---

## Going live with a real API

1. Confirm your backend accepts the `StackChartConfig` shape (dataset,
   dimensions[], measures[] with aggregation/alias, filters, sorting, pagination)
   — it already does, based on the config format you shared.
2. Confirm your backend's response is an array of flat rows keyed by dimension
   field(s) + measure alias(es) (standard GROUP BY output).
3. In `stack-chart-data.service.ts`, replace the dummy body of
   `fetchChartData()` with an `HttpClient` call to your endpoint.
4. (Optional) Point `stack-chart-config.service.ts` at a real schema/metadata
   endpoint instead of `DUMMY_DATASETS`, if your dimensions/measures list needs
   to be dynamic per dataset.
5. Delete `constants/stack-chart-dummy-data.ts` once nothing references it.

No changes needed in the component, template, or transform service — they only
ever depend on the `StackChartConfig` / `StackChartData` interfaces, not on how
the data was fetched.

---

**Component Status:** 🟢 Verified with real Chart.js rendering + dummy
GROUP BY engine. Ready for real API integration.
