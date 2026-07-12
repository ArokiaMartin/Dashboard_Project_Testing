# Stack Chart Component Architecture

## File Tree

```
stack-chart/
├── stack-chart.component.ts        Main logic + Chart.js rendering
├── stack-chart.component.html      Template (config UI + canvas + JSON/data viewers)
├── stack-chart.component.scss      Styles
├── stack-chart.component.spec.ts   Unit tests
├── models/
│   └── stack-chart.model.ts        Interfaces: StackChartConfig, MeasureConfig,
│                                    FilterRule, AvailableField, UserStackChartInput
├── services/
│   ├── stack-chart-config.service.ts     Dataset -> available dimensions/measures/operators
│   ├── stack-chart-data.service.ts       fetch + filter + GROUP BY + aggregate + sort + paginate
│   └── stack-chart-transform.service.ts  UserStackChartInput -> StackChartConfig (+ validation)
└── constants/
    └── stack-chart-dummy-data.ts   Dummy-only raw fact tables (delete when real API lands)
```

---

## Data Flow

```
User picks: Dataset, Dimension, [Break Down By], Measure(s), Filters, Stack Mode, Orientation
                              |
                              v
              UserStackChartInput (component state)
                              |
                              v      StackChartTransformService
              StackChartConfig  { dataset, dimensions[], measures[], filters, sorting, pagination }
                              |
                              v      StackChartDataService.fetchChartData(config)
              -----------------------------------------------------------------
              DUMMY:  raw facts -> filter -> GROUP BY dimensions[] -> aggregate
                      measures[] -> sort -> paginate
              REAL:   http.post(url, config)  <-- the only line that changes
              -----------------------------------------------------------------
                              |
                              v
              StackChartData { data: [{ dim: val, ..., measureAlias: number }], metadata }
                              |
                              v      StackChartComponent.buildDatasets()
              Chart.js { labels, datasets } -> rendered into <canvas #stackCanvas>
```

---

## The two dataset->chart mappings (`buildDatasets()`)

`stack-chart.component.ts` picks one of two builders depending on whether a
breakdown dimension is set:

### `buildMeasureSeriesDatasets()` — no breakdown dimension
- `labels` = one entry per row (each row already unique per the single
  GROUP BY dimension, thanks to the data service's aggregation).
- One Chart.js dataset **per selected measure** (e.g. Sales, Revenue), each a
  stack segment.

### `buildPivotedDatasets()` — breakdown dimension set
- `labels` = distinct values of the primary dimension (e.g. Region).
- One Chart.js dataset **per distinct value of the breakdown dimension**
  (e.g. ProductA/B/C), each a stack segment, plotting the single selected
  measure for that (primary, breakdown) pair.
- Internally builds a `Map<primary, Map<breakdown, value>>` lookup from the
  already-grouped rows, then reads it back out per label/segment.

Both builders respect `stackMode` (`normal` / `percent` / `grouped` — percent
normalizes each bar's segments to sum to 100) and `stackOrientation`
(`vertical` -> Chart.js `indexAxis: 'x'`, `horizontal` -> `indexAxis: 'y'`).

---

## Why the dummy data behaves like a real backend

`stack-chart-data.service.ts` doesn't return canned per-scenario JSON. It holds
raw, transaction-level fact rows (`RAW_SALES_FACTS`: 4 regions x 3 products x
4 months = 48 rows) and performs the same steps a SQL backend would for
`SELECT dims, AGG(measure) FROM table WHERE ... GROUP BY dims ORDER BY ...
LIMIT top OFFSET offset`:

```
applyFilters()        -> WHERE
groupAndAggregate()   -> GROUP BY dimensions[], aggregate() each measure
applySorting()        -> ORDER BY
applyPagination()     -> LIMIT/OFFSET
```

This is why grouping by `["Region"]` alone always returns exactly 4 rows
(one per region, summed across every product/month), and grouping by
`["Region", "Product"]` returns up to 12 rows (one per region+product pair) —
identical behavior to what a real database would give back.

---

## Swapping in the real API

Only `stack-chart-data.service.ts` changes:

```ts
// before (dummy)
fetchChartData(config: StackChartConfig): Observable<StackChartData> {
  const rawRows = this.getRawFacts(config.dataset);
  const filteredRows = this.applyFilters(rawRows, config);
  const groupedRows = this.groupAndAggregate(filteredRows, config.dimensions, config.measures);
  const sortedRows = this.applySorting(groupedRows, config);
  const paginatedRows = this.applyPagination(sortedRows, config);
  return of({ data: paginatedRows, metadata: {...} }).pipe(delay(500));
}

// after (real API)
fetchChartData(config: StackChartConfig): Observable<StackChartData> {
  return this.http.post<StackChartData>('/api/chart/data', config);
}
```

Requirement: the response's `data` array must be flat rows keyed by the
requested dimension field(s) + measure alias(es) — standard GROUP BY output.
Nothing in the component, template, or transform service needs to change.

---

**Status:** Verified end-to-end with real Chart.js rendering against the dummy
GROUP BY engine (both single-dimension and multi-dimension/breakdown modes).
