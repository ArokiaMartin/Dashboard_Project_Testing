# UI Updates — `yukthi-updatedui`

Changes made on top of the **`kishore-11-07-26`** branch (base commit `0fa0fef`).
Everything here is **frontend-only and additive** — no backend files, API endpoints, query
methods, or existing data flow were changed. Charts still fetch data through the existing
`backend.executeQuery()` → `POST /execute-query`.

## Commits

| Commit | Summary |
|--------|---------|
| `7cae908` | Add chart hover tooltip and click-to-drill-down in dashboard builder |
| `bb981cd` | Extend hover tooltip to all category chart types |
| `c29b7e7` | Add column enable/disable and recommended-visual tag in builder |

## Files changed (vs base `0fa0fef`)

| File | +/- |
|------|-----|
| `frontend/src/app/components/dashboard-builder/widget-tile.component.ts` | +323 |
| `frontend/src/app/components/dashboard-builder/dashboard-builder.component.ts` | +88 |
| `frontend/src/app/components/dashboard-builder/dashboard-builder.component.html` | +22 |
| `frontend/src/app/components/dashboard-builder/dashboard-builder.component.css` | +16 |
| `frontend/src/app/services/chart-compatibility.service.ts` | +57 |

---

## Feature 1 — Hover tooltip

A custom hover tooltip on every category chart (bar, line, radar, pie, doughnut, polar) showing
the dimension, value, and `measure + aggregation` (e.g. `SUM(Sales)`), plus share-of-total for
part-to-whole charts. Scatter keeps Chart.js's default (its points are x/y pairs, not a
dimension + measure). Reads only data the chart already holds — no raw records exposed.

**`widget-tile.component.ts`**
- `buildChartConfig()` — enables the custom external tooltip for all chart types except `scatter`
  (`plugins.tooltip = { enabled:false, external: renderMetaTooltip }`).
- `measureCaption()` *(new)* — formats `AGG(measure)`, e.g. `SUM(Sales)`.
- `escapeHtml()` *(new)* — escapes tooltip text.
- `ensureTooltipStyles()` *(new)* — injects the tooltip's CSS once (namespaced `.wt-*`).
- `renderMetaTooltip()` *(new)* — Chart.js external-tooltip handler. Builds/positions an HTML
  popup inside the chart's own container (never `position: fixed`); shows dimension, value,
  measure + aggregation, and `% of total` for pie/doughnut/polar. Uses `tooltip.labelColors`
  for the correct per-slice swatch, reads the measure name from the spec for part-to-whole
  charts, and clamps the popup horizontally so edge points don't spill outside the tile.

---

## Feature 2 — Click-to-drill-down

Click a data point to drill into a finer grain (e.g. Region → Category → Product). The drill
path is configured per widget in the builder. Each level re-queries through the existing
`executeQuery` with a single `groupBy` plus one `=` filter per ancestor; a breadcrumb navigates
back up. Works for bar, line, pie, doughnut, polar, and radar.

**`widget-tile.component.ts`**
- `DrillStep` interface *(new)* — `{ field, value }`, one hop in the drill path.
- `WidgetEditState.drillPath?: string[]` *(new field)* — persists the drill path for editing.
- Drill state fields *(new)* — `drillStack`, `renderedStack`, `drillLabels`, `drillDatasets`,
  `drillLoading`, `drillError`.
- `initRender()` *(new)* — first paint, then loads the base level for drillable widgets.
- `hierarchy()` — returns the plotted dimension (level 0) followed by the widget's `drillPath`.
- `measureDefs()` *(new)* — reads `{field, alias}` measures from the saved query config.
- `isDrillable()` / `canDrillDown()` *(new)* — whether the widget/level can drill.
- `baseDimLabel()` / `currentDimLabel()` *(new)* — breadcrumb labels (`currentDimLabel` names
  the next-finer dimension a click descends into).
- `onPointClick()` *(new)* — click handler; resolves the clicked label and drills one level.
- `drillUpTo()` / `resetDrill()` / `resetDrillState()` *(new)* — breadcrumb up-navigation.
- `loadLevel()` *(new)* — re-queries one level via `backend.executeQuery` and re-renders.
- `buildLevelConfig()` *(new)* — clones the saved config with a single `groupBy` and one `=`
  filter per ancestor; strips the client-only `drillPath` before sending.
- `currentSpec()` *(new)* — swaps in the drilled labels/datasets for rendering.
- `render()` — attaches `options.onClick` only when the widget is drillable.
- Template — adds the `.tile-drill` breadcrumb block and its styles.

**`dashboard-builder.component.ts`**
- `drillPathNames: string[]` *(new state)* — the chosen drill columns, in order.
- `buildQueryBuilderConfig()` — adds `drillPath` (db field names) to the saved config.
- `drillCandidates()` *(new)* — dataset dimension columns eligible to drill into.
- `showDrillPicker()` *(new)* — whether to show the picker (chart viz with a plotted dimension).
- `isDrillSelected()` / `drillOrder()` / `toggleDrill()` *(new)* — picker selection + ordering.
- `pruneDrillPath()` / `validDrillNames()` *(new)* — keep the path valid for the selection.
- `startOver()` — resets `drillPathNames`.
- `captureEditState()` / `editWidget()` / `reconstructEditState()` — persist & restore the path.

**`dashboard-builder.component.html`** — adds the "Drill-down path" picker section.

---

## Feature 3 — Column enable/disable + recommended visual

Columns in the "Available columns" list grey out when they can't be added to the current
selection, and a Power BI-style "Recommended" badge marks the best-fit chart. All derived from
the existing chart-compatibility rules (now a single shared count-based check).

**`chart-compatibility.service.ts`**
- `isAllowed()` — refactored to delegate to `isAllowedCounts()` (one source of truth).
- `isAllowedCounts()` *(new)* — the chart rules expressed on `(dim, num)` counts, so
  hypothetical selections can be tested.
- `canAddColumn()` *(new)* — whether adding a candidate column can still lead to a valid
  selection for the chosen chart (drives column enable/disable).
- `recommend()` *(new)* — best-fit chart for the current columns (date dimension favors line);
  returns `null` when only a table fits.

**`dashboard-builder.component.ts`**
- `colDisabled()` *(new)* — is a column disabled (selected columns stay enabled to remove).
- `colDisabledReason()` *(new)* — tooltip text explaining why.
- `recommendedViz()` *(new)* — the recommended chart key.
- `toggleCol()` — guard so a disabled column can't be added.

**`dashboard-builder.component.html`**
- Available-column button: `disabled` state + tooltip.
- Visualization card: "Recommended" badge + `recommended` class.

**`dashboard-builder.component.css`** — styles for `.col-item.disabled`,
`.viz-card.recommended`, `.vc-badge`, and the drill picker (`.drill-block`, `.d-chip`, `.d-order`).

### Rule set (column enable/disable)

Chart validity (dimensions = text + date, measures = numbers):

| Chart | Dimensions | Measures |
|-------|-----------|----------|
| KPI | 0 | exactly 1 |
| Bar / Horizontal bar / Line / Area | exactly 1 | ≥ 1 |
| Pie / Doughnut / Polar | exactly 1 | exactly 1 |
| Stacked bar / Radar | exactly 1 | ≥ 2 |
| Scatter | 0 | exactly 2 |
| Table | any | any (≥ 1 total) |

A column disables when: the 4-column cap is reached; or a chart is chosen and adding the column
could never satisfy that chart (dimension slot full, or measure slot full). Selected columns are
never disabled. Before a chart is chosen, only the 4-column cap applies.
