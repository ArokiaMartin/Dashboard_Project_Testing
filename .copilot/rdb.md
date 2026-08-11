# Real-Time Data Source — Implementation Specification

**Audience:** an AI coding agent with write access to this repository.
**Status:** backend skeleton partially implemented and compiling; frontend connection UI does not exist yet.
**Your job:** finish the backend, fix the listed defects, and build the new frontend pages in Part B.

---

## 0. Read this first

This document is prescriptive. Where it says MUST, that constraint was derived from reading this
specific codebase and a violation will cause a real defect, not a style disagreement. Where it says
DO NOT BUILD, a previous analysis concluded the component is wrong for this codebase — do not
reintroduce it because it appears in reference architectures.

Before writing any code, read these files. Do not skim them:

| File | Why |
|---|---|
| `backend/src/main/java/com/example/dashboard_backend/controller/QueryController.java` | `generateSql` is the single SQL compiler. It is public, static and pure. Everything routes through it. |
| `backend/src/main/java/com/example/dashboard_backend/query/QueryConfigNormalizer.java` | The one public normalizer. Security-critical. |
| `backend/src/main/java/com/example/dashboard_backend/live/` | The partially built live package (5 classes). |
| `backend/src/main/java/com/example/dashboard_backend/drilldown/DrilldownCandidateSelector.java` | Already solves "which dimension is legitimate to group by". Reuse it, do not reinvent it. |
| `frontend/src/app/features/dashboard-builder/widget-tile.component.ts` | Holds the Chart.js instance; contains `updateInPlace()`. |
| `frontend/src/app/features/dashboard-builder/dashboard-builder.component.ts` | Contains the opt-in live refresh driver. |
| `frontend/src/app/features/schema-data-upload/schema-data-upload.component.ts` | **Copy this page's structure and visual language** for the new Live Source pages. |

### Environment facts you must respect

- Backend: Spring Boot 3.5.16, Java 17, `spring-boot-starter-web` + `starter-jdbc`. **No JPA. No Kafka. No WebSocket starter. No Redis.**
- Frontend: Angular 17.3 standalone components, Chart.js 4.5 imported **directly** (`import { Chart } from 'chart.js'`). `ng2-charts` has been removed — do not reintroduce it.
- Database: **PostgreSQL 12.** This matters. `percentile_cont(...) WITHIN GROUP (...) OVER (...)` as a window function requires PG14+. On PG12 you MUST use a two-pass CTE instead. Verify every window function against PG12 before shipping it.
- There is **no authentication anywhere**. `AppConstants.USER_123` is hardcoded; `SchemaController` accepts `userId` as a defaulted request param, so any caller can assert any identity. Every endpoint you add is unauthenticated. Design accordingly and say so in the UI where it matters.
- No Docker, no CI, no actuator, no Micrometer, no structured logging. A failure you do not surface in the UI is invisible.
- Build/verify commands:
  ```
  mvn -f backend/pom.xml -DskipTests compile
  npx tsc -p frontend/tsconfig.app.json --noEmit
  ```

---

## 1. Architecture: what to build and what not to

### Build this

```
PRODUCER (external, or the built-in simulator you will write)
   │  HTTP POST, NDJSON or JSON array
   ▼
POST /api/live/{sourceId}/events
   │  streamed via JsonRecordStreamer, bounded queue, 250ms batched flush
   ▼
ONE STORE: the existing PostgreSQL
   live_<source>_v1  —  ts TIMESTAMPTZ, row_id BIGSERIAL, typed NUMERIC/TEXT columns
   │
   ▼
READ PATH: server-injected bucketed derived table  →  QueryController.generateSql  (UNCHANGED)
   │
   ▼
Angular: poll on an interval  →  chart.update('none') on the retained Chart instance
```

### Do NOT build

| Component | Why not |
|---|---|
| Apache Kafka | One consumer, one node, no replay requirement. An in-process bounded queue covers it. Revisit only when a second independent consumer exists, or the producer cannot tolerate backpressure. |
| Redis | "Last 100 points" is 100 indexed rows. Postgres answers that in microseconds. |
| TimescaleDB | A hypertable cannot carry the `PRIMARY KEY (upload_id, row_id)` / `FOREIGN KEY (upload_id, parent_row_id)` that nested child tables depend on — the feature the README leads with. Revisit only above ~2000 events/sec **and** >30 day retention **and** >100M rows. |
| Windowed aggregation written in Java | A live widget would then only display what a developer hard-coded, while every batch widget is analyst-configured. That splits the product into a self-service mode and a developer-only mode with no path between them. Aggregate in SQL through `generateSql`. |
| STOMP / SockJS / `@stomp/rx-stomp` | One destination, one direction, no auth to scope a subscription with. If you later need push, use SSE, not WebSocket. |
| A second `DataSource` | 158 `jdbcTemplate` call sites across 13 files; the first missed `@Qualifier` silently writes control-plane data to the wrong store, and there is no CI to catch it. |

### The one rule that overrides convenience

> **Exactly one thing computes an aggregate, and it is `QueryController.generateSql`.**

A live widget and a batch widget over the same data MUST produce the same number. Do not add a second
aggregation implementation anywhere, in any language, for any reason.

---

## 2. Current state: what exists, and what you MUST fix

### Already implemented and verified compiling

**Backend** — `backend/src/main/java/com/example/dashboard_backend/live/`
- `LiveSourceRegistrar` — hand-written typed DDL, `row_id BIGSERIAL`, registers synthetic `data_uploads` + `field_metadata` rows so a live source appears in the existing dataset/dimension/measure pickers.
- `LiveEventWriter` — `ArrayBlockingQueue` + `@Scheduled(fixedDelay = 250)` batch flush via `TransactionTemplate`.
- `LiveIngestController` — `POST /api/live/sources`, `POST /api/live/{sourceId}/events`.
- `LiveWindowedFromProvider` — builds the bucketed/windowed derived table, injected as a **trusted** `datasetFromSql` after the client-supplied one is stripped. Enforces zero bind params via `assertNoBinds`.
- `LiveSchedulingConfig` — `@EnableScheduling`.
- `QueryConfigNormalizer` is now the single public normalizer: it strips client `datasetFromSql` and applies `upload_id` scoping on **both** branches.
- `DatasetController` — `DELETE /api/datasets/{id}` returns 409 for a live source unless `?force=true`.

**Frontend**
- `widget-tile.component.ts` — `updateInPlace()`, a sibling of `render()`, mutates `chart.data` and calls `chart.update('none')` inside `runOutsideAngular`. Gated behind `@Input() liveUpdates`.
- `dashboard-builder.component.ts` — opt-in `setLiveRefresh(ms)` driver: one interval per dashboard, serialized through `refreshPromise`, skipped (never queued) while busy or `document.hidden`, full refresh on tab resume.

### MUST FIX — known defects, in priority order

1. **`DrilldownService.java:176` and `DashboardService.java:396,417` still call the 1-arg `normalize`.**
   Only `QueryController` passes the trusted provider. Consequence: drilling into a live-source chart
   queries **raw per-event rows over all history** instead of the bucketed window, so a drill filter of
   `ts = '2026-08-11 14:03:00'` matches zero rows (raw values carry seconds). `generated_sql` stored by
   `DashboardService` also stops matching what `/execute-query` runs. Route every call site through the
   same trusted provider.

2. **The closed-bucket cut and 60-minute window are applied to every query on a live source**, including
   KPIs and tables. A KPI labelled "Total revenue" silently means "revenue in the last hour, minus the
   current minute". Make the window a per-widget setting (Part B, Step 4) and **display the effective
   window in the widget subtitle** whenever it is not "all time".

3. **`LiveEventWriter` has no `@PreDestroy` drain.** Up to `app.live.queue-capacity` (50,000) accepted
   events are lost on restart after the endpoint already answered `202 Accepted`. Add a drain, and note
   `spring-boot-devtools` is a runtime dependency so **every file save restarts the JVM**.

4. **A failing flush batch is logged and dropped** — one NUMERIC overflow discards up to 5000 events with
   no counter and nothing surfaced. Add a dead-letter table or at minimum a monotonic failure counter
   exposed on the source detail page.

5. **`LiveSourceRegistrar.resolve` caches negative results unboundedly** — `computeIfAbsent` stores
   `Optional.empty()` for every normal upload ever queried, and only `DatasetController.deleteDataset`
   prunes. Bound the cache or invalidate on all delete paths.

6. **Validation throws `IllegalArgumentException` from inside `normalize`**, which runs at the top of
   `/execute-query` and `/generate-query`. There is no `@ControllerAdvice` for it, so a bad `bucket`
   returns 500 with a stack trace. Add a handler returning 400 with the message.

7. **No tests exist for any of this.** Every SQL string in `backend/live` has never been executed.
   See §5 for the minimum test set.

---

## 3. Part A — Backend contract

### A.1 Live source model

Persist live source definitions. Reuse the existing metadata tables where possible; a live source MUST
appear in `data_uploads` (with `source_kind = 'live'`) and `field_metadata` so the existing builder
pickers work with no changes.

```
live_source
  id              uuid primary key
  name            text not null
  slug            text not null unique      -- used to derive the physical table name
  table_name      text not null             -- via SqlIdentifier.validate
  ts_column       text not null default 'ts'
  timezone        text not null             -- IANA, e.g. 'Asia/Kolkata'
  default_bucket  text not null             -- whitelist: second|minute|five_minute|hour|day
  default_window_minutes int not null
  exclude_open_bucket    boolean not null default true
  retention_days  int
  created_at      timestamptz not null
  ingest_token_hash text                    -- see A.4

live_source_field
  source_id   uuid references live_source
  name        text        -- as it arrives in the JSON
  column_name text        -- via IdentifierNaming.uniqueNormalizedNames
  role        text        -- 'timestamp' | 'measure' | 'dimension'
  sql_type    text        -- 'TIMESTAMPTZ' | 'NUMERIC' | 'BIGINT' | 'DOUBLE PRECISION' | 'TEXT'
  default_agg text        -- measures only: SUM|AVG|COUNT|MIN|MAX
  nullable    boolean
```

**Types are DECLARED, never inferred.** `DynamicTableManager` defaults inferred columns to TEXT and
there is no `ALTER COLUMN TYPE` anywhere in the codebase, so a wrong inference is permanent. Do not
route live DDL through `DynamicTableManager`.

### A.2 Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/live/sources` | List sources with liveness summary |
| `POST` | `/api/live/sources` | Create (body = the wizard's output, §B.6) |
| `GET` | `/api/live/sources/{id}` | Detail incl. field list and effective settings |
| `PATCH` | `/api/live/sources/{id}` | Edit window/bucket/retention/timezone only — **not** the schema |
| `DELETE` | `/api/live/sources/{id}` | Requires `?force=true`; drops the physical table |
| `POST` | `/api/live/sources/preview-ddl` | Returns the DDL that *would* be created. No side effects. |
| `POST` | `/api/live/sources/{id}/test-event` | Accepts one sample event, validates against the declared schema, returns per-field coercion results **without inserting** |
| `POST` | `/api/live/{id}/events` | The ingest hot path |
| `GET` | `/api/live/sources/{id}/health` | `{state, last_event_at, lag_seconds, events_last_minute, queue_depth, failed_batches}` |

`POST /events` response contract:
- `202` with `{accepted, rejected, dropped_buffer_full, queue_depth, retry_from_offset}` on full or partial acceptance.
- `429` **only when `accepted == 0`**. Returning 429 after a partial accept causes duplicate inserts, because `row_id` is a BIGSERIAL and nothing would reject the copies.

### A.3 The read path

On a query whose dataset token resolves to a live source, inject a **trusted, server-built**
`datasetFromSql` after the client's is stripped. It MUST contribute zero bind parameters.

```sql
(SELECT *,
        date_trunc('minute', ts AT TIME ZONE 'Asia/Kolkata') AS ts_bucket
   FROM live_orders_v1
  WHERE ts >= now() - interval '15 minutes'
    AND ts <  date_trunc('minute', now())     -- excludes the OPEN bucket
) AS t
```

Three invariants, all load-bearing:
1. **Exclude the open bucket.** At second 3 of a 60-second bucket you hold ~5% of the traffic, and every
   downstream reader sees that as a 95% crash. This is the single largest source of false "metric is
   collapsing" signals.
2. **`AT TIME ZONE` before `date_trunc`.** Otherwise bucket boundaries drift and "today so far" is wrong
   for half of every day.
3. **Gap-fill with `generate_series`** where a series is consumed by a rolling window. A missing bucket is
   a zero, not an absent row.

Whitelist `bucket`. Integer-bound `windowMinutes`. Regex-validate `timezone` (`^[A-Za-z0-9_+/-]{1,64}$`).
Quote every identifier via `SqlIdentifier`.

### A.4 Ingest authentication

There is no auth in this app, and the ingest endpoint **creates and writes database tables**. Do not
ship it wide open silently.

- Generate a per-source ingest token on creation. Store only a hash. Show the plaintext **once**, at
  creation time, and never again.
- Require it as `Authorization: Bearer <token>` on `/api/live/{id}/events`.
- Rate-limit per source.
- **The UI must state plainly that this endpoint is unauthenticated at the network level** and should not
  be exposed publicly. `README.md` already says not to deploy without auth.

---

## 4. Part B — The new frontend pages

This is the primary new work. Build it as standalone Angular 17 components, following the structure and
visual language of `features/schema-data-upload/`. Add a "Live Sources" entry to
`layout/sidebar/sidebar.component.ts`.

Routes to add in `app.routes.ts`:

```
/live-sources            LiveSourceListComponent
/live-sources/new        LiveSourceWizardComponent
/live-sources/:id        LiveSourceDetailComponent
```

### B.1 `/live-sources` — list

A table: **Name · State · Last event · Events/min · Rows · Bucket · Window · Retention**.

`State` is a pill, and its color carries meaning:
- **LIVE** (green) — last event within the freshness threshold
- **SLOW** (amber) — beyond threshold but under 3×
- **STALLED** (red) — beyond 3×, or no events at all
- **NEVER CONNECTED** (grey) — created but zero events received

Empty state: a short explanation of what a live source is plus a primary **Connect a live source** button.

> A stalled feed renders as a flat line, and users read a flat line as "business is quiet" rather than
> "the pipe is dead". The state pill is not decoration — it is the only thing that distinguishes the two.

### B.2 The wizard — six steps

Use a stepper. **Every step must be re-editable before submit.** Nothing is created server-side until
Step 6 is confirmed.

---

#### Step 1 — How does data arrive?

Radio cards, one selected by default:

| Option | Label | Sub-label | State |
|---|---|---|---|
| `http_push` | **Push events to this app** (recommended) | Your system POSTs JSON to a URL we give you. Nothing to install. | Enabled |
| `simulator` | **Generate sample events** | A built-in simulator so you can try live dashboards without wiring a real producer. | Enabled |
| `external_pg` | **Read from another Postgres table** | We poll a table you already have. Requires connection details. | Enabled |
| `kafka` | **Kafka topic** | Not available. | **Disabled**, with tooltip: "Not needed at this scale — add a second consumer or a replay requirement first." |

Selecting `external_pg` reveals Step 2. Otherwise Step 2 is skipped.

---

#### Step 2 — Connection (only for `external_pg`)

| Field | Type | Validation | Notes |
|---|---|---|---|
| Host | text | required | |
| Port | number | required, default 5432 | |
| Database | text | required | |
| Schema | text | default `public` | |
| Table or view | text | required | Populate a dropdown after a successful test |
| Username | text | required | |
| Password | password | required | **See the rule below** |
| SSL mode | select | `disable` / `require` / `verify-full`; default `require` | |
| Poll interval | number (sec) | 5–300, default 15 | |

**Credential handling — MUST:**
- The password field is **write-only**. `POST` it once; never return it from any endpoint, never place it
  in a widget config, never log it, never echo it into the DOM.
- Store it server-side only (environment variable or secret store reference). It MUST NOT be written into
  `database_config_json`, which is returned to the browser with every widget.
- On edit, show `••••••••` with a "Replace password" action. Never pre-fill the real value.
- If you cannot meet these, do not build `external_pg` — ship `http_push` only and say why.

**Test connection** button: calls a validate-only endpoint and reports one of
*connected · host unreachable · authentication failed · table not found · permission denied*.
Do not let the user proceed on a failed test.

---

#### Step 3 — Describe the events (the most important step)

Two-pane layout: paste a sample event on the left, declare the schema on the right.

**Left:** a textarea, "Paste one sample event (JSON)", plus a **Detect fields** button. Detection
**suggests** rows in the right pane — it never commits them.

**Right:** one row per field.

| Column | Control | Rules |
|---|---|---|
| Field name | text (read-only when detected) | As it appears in the JSON. Nested paths flattened with `_`. |
| Role | select: `Timestamp` / `Measure` / `Dimension` / `Ignore` | **Exactly one Timestamp is required.** Block submit otherwise, with the message "Pick which field is the event timestamp — a live source needs to know when each event happened." |
| Type | select | Timestamp → `TIMESTAMPTZ` only. Measure → `NUMERIC` (default) / `BIGINT` / `DOUBLE PRECISION`. Dimension → `TEXT`. |
| Default aggregation | select: `SUM`/`AVG`/`COUNT`/`MIN`/`MAX` | Measures only. Default `SUM`. |
| Nullable | checkbox | Default on |

Show a persistent inline warning above the table:

> **Types are permanent.** A live source's columns cannot be re-typed later. If a measure is declared as
> text, it can never be aggregated. Check the Type column before continuing.

That warning is factual: there is no `ALTER COLUMN TYPE` anywhere in this codebase.

Also warn, per row, when a field declared as a Dimension looks like an identifier (name matches
`(^|_)(id|key|uuid|guid)$`, or the sample value is a UUID):

> This looks like an identifier. Grouping a chart by it would produce one bar per event.

---

#### Step 4 — Time and window semantics

| Field | Control | Default | Help text to show |
|---|---|---|---|
| Timezone | searchable IANA select | browser timezone | "Buckets and day boundaries are computed in this timezone." |
| Bucket size | select: 1s / 1min / 5min / 1hr / 1day | 1min | "Events are grouped into buckets of this size before charting." |
| Default window | number + unit (min/hr/day) | 60 min | "How far back a live widget looks by default. Each widget can override this." |
| Exclude the current, incomplete bucket | toggle | **ON** | "The bucket still filling up is only partly counted, so including it makes every metric look like it just dropped. Leave this on unless you need the partial value." |
| Retention | number of days + `Delete oldest automatically` toggle | 7 days, on | "Older events are removed. Without this the table grows forever." |

**A KPI or table over a live source is still subject to the window.** Whenever the effective window is
not "all time", the widget MUST render a subtitle such as *"last 60 minutes"*. A KPI reading
"last hour minus the current minute" while labelled "Total revenue" is a reporting bug, not a nuance.

---

#### Step 5 — How the dashboard updates

| Field | Control | Default | Notes |
|---|---|---|---|
| Refresh interval | select: Off / 5s / 15s / 30s / 1min / 5min | 15s | Drives `setLiveRefresh(ms)`. |
| Freshness threshold | number (sec) or `Auto` | Auto | Auto = p95 of inter-arrival gaps over 24h, floored at 3 buckets. |
| Pause when tab is hidden | toggle, disabled-on | ON | Explain it cannot be turned off. |

Show a computed note: *"About N requests per minute with M widgets on this dashboard."* If the interval is
shorter than the bucket size, warn:

> Refreshing every 5s when buckets are 1 minute means 12 identical results per bucket. Consider matching
> the refresh to the bucket size.

Do **not** offer sub-second refresh. Do **not** offer a WebSocket option.

---

#### Step 6 — Review and create

Show three read-only blocks:
1. **Summary** — every choice from Steps 1–5.
2. **Table that will be created** — the real DDL, fetched from `POST /api/live/sources/preview-ddl`.
3. **How to send events** — a copyable `curl` with the actual URL and a sample body built from the declared schema.

On confirm: create the source, then show the **ingest token exactly once** in a dismissible panel:

> Copy this token now. It will not be shown again. Anyone with this token and network access to this
> server can write events to this source.

Then redirect to `/live-sources/:id`.

---

### B.3 `/live-sources/:id` — detail

Sections:
- **Header** — name, state pill, last event ("4s ago"), events/min, total rows.
- **Connection** — ingest URL, `curl` snippet, **Send test event** button (uses `/test-event`, shows per-field coercion results, inserts nothing), **Regenerate token**.
- **Schema** — the field table, read-only, each row showing name → column → type → role → default aggregation. An explicit note that schema is immutable after creation.
- **Settings** — the Step 4 and 5 values, editable via `PATCH`.
- **Recent activity** — last 20 buckets as a sparkline, plus counters for accepted / rejected-shape / dropped-buffer-full / failed batches. Surface the failed-batch counter: a dropped flush is currently invisible.
- **Danger zone** — delete, with a typed confirmation of the source name, and an explicit warning that the physical table and all events are dropped.

### B.4 Builder integration

- The live source appears in the existing dataset picker with a **LIVE** badge (`source_kind = 'live'` is already returned by `listDatasets`).
- When a live dataset is selected, show a compact live strip in the widget config panel: **Bucket · Window · Refresh**, each overridable per widget, defaulting to the source's values.
- Bind the existing input: `<app-widget-tile [liveUpdates]="!!liveRefreshMs" ...>` in
  `dashboard-canvas.component.ts`. Without this binding the in-place update path never activates.
- Wire the refresh control to `setLiveRefresh(ms)` / `stopLiveRefresh()`.
- Show the effective window as the widget subtitle whenever it is not "all time".

### B.5 States and error copy

Every one of these must be a distinct visible state. Failures are swallowed in several places in this
codebase (`DashboardService.attachHydratedData` returns empty, `generateSqlForWidget` returns `""`), so
**a dead stream currently renders identically to an empty result set.**

| Condition | UI |
|---|---|
| Source created, zero events | "No events received yet." + the `curl` snippet |
| Feed stalled | Amber banner on every widget over that source: "No new data for 6 minutes." Suppress all insights. |
| Query failed this tick | Keep the last good data, show a small "last updated 14:03" marker. Do not blank the chart. |
| Window excludes everything | "No events in the last 60 minutes." + a "Widen window" action |
| Token invalid on ingest | 401 with "Ingest token is invalid or has been regenerated." |

### B.6 Wizard submit payload

```json
{
  "name": "Orders stream",
  "arrival": "http_push",
  "connection": null,
  "timestampField": { "name": "ts", "type": "TIMESTAMPTZ" },
  "measures": [ { "name": "amount", "type": "NUMERIC", "defaultAgg": "SUM", "nullable": true } ],
  "dimensions": [ { "name": "region", "type": "TEXT", "nullable": true } ],
  "time": {
    "timezone": "Asia/Kolkata",
    "bucket": "minute",
    "defaultWindowMinutes": 60,
    "excludeOpenBucket": true,
    "retentionDays": 7
  },
  "refresh": { "intervalMs": 15000, "freshnessSeconds": null }
}
```

---

## 5. Acceptance criteria

Do not report this complete until every box holds.

**Correctness**
- [ ] A live widget and a batch widget configured identically over the same rows return the **same number**. Write this as an automated test — it protects the one property the whole architecture rests on.
- [ ] Drilling into a live-source chart returns rows consistent with the bar clicked (fixes MUST FIX #1).
- [ ] The open bucket is excluded on every path, verified by a test that inserts an event and asserts it does not appear until its bucket closes.
- [ ] A gap in the data renders as a zero, not a shortened window.
- [ ] Two identical `POST /events` calls with the same body do not double-count when the first returned 202 with a partial accept.

**Safety**
- [ ] Client-supplied `datasetFromSql` is stripped on **every** path reaching `generateSql`. Add a test that posts one and asserts it is absent from the generated SQL.
- [ ] No credential appears in any GET response, any log line, or `database_config_json`.
- [ ] A dashboard with no live source behaves **byte-for-byte** as before. Verify by loading a saved dashboard and confirming `initRender()` still runs.
- [ ] `mvn compile` and `tsc --noEmit` both exit 0.

**Operability**
- [ ] A stalled feed is visibly distinct from an empty result set in the UI.
- [ ] Dropped/failed events are counted and surfaced on the detail page.
- [ ] Buffered events are drained on shutdown, or the endpoint stops answering 202 for events it may lose.
- [ ] An 8-hour idle tab does not grow memory without bound and does not accumulate queued ticks.

**Not acceptable as "done"**
- Code that compiles but has never executed a single SQL statement against a real database.
- A feature with no way for a user to turn it on.
- Any new aggregation implementation outside `generateSql`.

---

## 6. Phase 2 — the insights layer (do not start until §5 passes)

Build in this order. Each makes the next cheaper.

1. **Feed liveness gate** (~1 day). `max(ts)`, a LIVE/SLOW/STALLED state machine, and an `InsightGate` that suppresses every other insight while STALLED. Without this gate, your own outage emits "revenue dropped 100%" on every widget at once — the fastest way to get the whole insight layer muted.
2. **Period-over-period delta with a named baseline** (~1 day). Always print the basis of comparison. Guard `prev = 0` (show the absolute delta, never `+∞%`). Both windows equal length, both ending on a closed bucket. The `.tk-trend` CSS class already exists and is unused in `widget-tile.component.ts`.
3. **Contribution / attribution** (~1 week) — the flagship. "Orders fell 12%; North America −140, Enterprise −55, everything else +27." Use `FULL OUTER JOIN ... ON a.k IS NOT DISTINCT FROM b.k` — an INNER JOIN drops members that appeared or vanished, which are usually the whole story. Reuse `DrilldownCandidateSelector.analyze()` verbatim to choose the dimension; its fan-out guard is mandatory, because a fanned-out join multiplies the measure and the contributions stop summing. Rank by **absolute** delta, never percent. Refuse MIN/MAX — they are not decomposable. Gate AVG until mix/rate decomposition exists. Render through the existing `showDrillTable()` and make clicking a contributor emit `drillChange`, so attribution becomes the entry point to drilldown.
4. **Rolling band** (~3 days). `RANGE BETWEEN INTERVAL`, not `ROWS BETWEEN n PRECEDING` — ROWS silently changes the window length when buckets are missing. Prefer `median ± 1.4826·MAD` over `mean ± 2σ`. **On PG12, `percentile_cont` cannot be used as a window function — use a two-pass CTE.**
5. **New-member and silence detection** (~2 days). A `dim_member_seen` upsert table. Silence is the most under-built insight in BI: absence produces no rows, so no chart moves and no detector fires.

**Antipatterns — do not ship:** top-N movers ranked by percent change (0→2 is +∞% and outranks a real −140); a tick-by-tick delta badge (differencing doubles the noise variance — the sign flips about half the time); automatic correlation discovery (spurious by multiplicity); confidence percentages that were never calibrated; an insight feed with no episode dedup.

---

## 7. Hard invariants — violating any of these is a defect

1. Exactly one aggregation implementation: `QueryController.generateSql`.
2. Live schemas are declared, never inferred. Never route live DDL through `DynamicTableManager`.
3. The injected `datasetFromSql` is server-built and contributes zero bind parameters.
4. Client-supplied `datasetFromSql` is always stripped before `generateSql`.
5. `row_id` comes from the BIGSERIAL sequence, never from a request-relative index.
6. `AT TIME ZONE` precedes `date_trunc`, always.
7. The open bucket is never read.
8. `429` only when nothing was accepted.
9. A live refresh replaces a series wholesale; it never appends. The payload is a full `GROUP BY` snapshot, so appending duplicates every bucket.
10. Live data never flows through the tile's `spec` `@Input` as a fresh object expecting an incremental update — `ngOnChanges` schedules `initRender()` on any spec reference change, so that path is destroy-and-recreate by construction.
11. Never mutate arrays owned by the parent's committed widgets. Those references are shared with the draft service and undo snapshots.
12. No new npm or Maven dependency without stating why an existing one cannot do the job.

---

## 8. Notes on this repository

- **`spring-boot-devtools` is a runtime dependency.** Every file save restarts the JVM and discards in-heap state. Anything you keep only in memory will appear to lose data at random during development.
- **`DELETE /api/datasets/{uploadId}` drops physical tables by name**, including prefix-matched children, with no auth. A live source registered in `data_uploads` is droppable by any caller — the `?force=true` guard is the only protection.
- **The `type:'date'` filter truncates to whole days** (`CAST(left(trim("ts"::text), 10) AS DATE)`). It cannot express a sub-day window, and the wrapper is non-sargable so it defeats any index on `ts`. Put the window in `datasetFromSql`, never in the filter grammar.
- **There is no git history in this working tree** and more than one agent may be editing it. Check `git status` before you start and again before you finish; do not revert files you did not touch.
- Test coverage is 3 backend test methods and 0 frontend tests. There is no CI. If you do not write the test, nothing will catch the regression.