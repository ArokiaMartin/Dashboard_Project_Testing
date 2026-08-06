# Comprehensive Code Review — Dashboard Project

**Stack:** Spring Boot 3.5.16 (Java 17, raw JdbcTemplate, no ORM) · Angular 17.3 (standalone) · PostgreSQL
**Scale:** ~8K lines Java (60 files) · ~11.5K lines TS/HTML (39 TS files) · 3 backend tests · **0** frontend tests
**Review date:** 2026-08-06

---

## Verdict

This is a **capable, well-documented single-user prototype** with genuinely good instincts in isolated
places — parameterized query values, centralized SQL-identifier quoting (unit-tested), an
info-disclosure-safe global exception handler, environment-driven CORS, strong TypeScript strict mode,
and a memory-efficient streaming ingestion pipeline. But it is **not production-ready**.

The gaps cluster into five themes:

1. Zero authentication/authorization
2. Non-transactional ingestion that can corrupt/orphan data
3. A systemic table-name collision bug
4. A frontend god-component with real leaks and performance cliffs
5. No CI/CD, containerization, observability, migrations, or test coverage

---

## 🔴 P0 — Hard Blockers (do not deploy)

### 1. No authentication or authorization anywhere
`pom.xml` has no Spring Security. Every endpoint — upload, query execution, delete, Swagger UI — is
fully open. All data is attributed to a hardcoded user (`AppConstants.USER_123` =
`00000000-…-000000000123`), and `SchemaController` takes `@RequestParam(defaultValue="user_123") String userId`,
so **any caller can impersonate any user via a query param**. The README itself admits this.

- **IDOR everywhere:** `DatasetController` operates on any `uploadId` with no ownership check;
  `listDatasets()` is commented "uploaded by user_123" but the SQL has **no `WHERE user_id`** — it
  returns everyone's datasets. `deleteDataset` can `DROP` a physical table.
- **Frontend has two conflicting fake identities:** dashboards save under `'anonymous'`, schemas/uploads
  under `'user_123'`; the "share" URL leaks a guessable `userId` path with no access control.
- **Fix:** Add Spring Security (OIDC/JWT resource server). Derive `userId` from the authenticated
  principal — never a request param. Enforce per-user ownership on every dataset/schema/dashboard
  operation. Add an Angular `HttpInterceptor` for the token and a single source of truth for the current
  user. Lock down Swagger in non-dev.

### 2. Ingestion pipeline is not transactional → orphaned tables & partial writes
Neither `JsonIngestionService.ingest()` nor `CsvIngestionService.uploadCsv()` is `@Transactional`, yet
each performs a sequence of auto-committing writes across multiple tables (DDL → data → `data_uploads`
→ `field_metadata`). A mid-sequence failure leaves committed physical tables/rows with no metadata, or a
`data_uploads` row stuck at `status='processing'` with a half-loaded table. PostgreSQL DDL is
transactional, so this is fixable by wrapping the whole operation in one transaction (or compensating on
failure). `SchemaBasedIngestionService.ingestWithSchema` has the same problem across ingest +
version-tagging: a crash before the `UPDATE data_uploads SET schema_id/version_number` leaves an
**untagged upload** that breaks later version numbering and dedup.

---

## 🟠 P1 — High Priority

### 3. Systemic child-table prefix-collision bug (data loss / cross-tenant data mixing)
Child tables are discovered *everywhere* with `tableName.startsWith(rootTable + "_")` — in
`DatasetController` (delete, getTables, getFlatRows), `QueryController.buildFlatFromClause`, and
`QueryConfigNormalizer`. Datasets named **`sales`** and **`sales_2024`** collide:

- Deleting `sales` runs `DELETE`/`DROP` against `sales_2024`'s child tables.
- Flat-row queries on `sales` LEFT JOIN `sales_2024`'s children, inflating/corrupting results.
- Combined with name truncation to 55 chars (`SchemaBasedIngestionService`) and `CREATE TABLE IF NOT
  EXISTS`, two different schemas sharing a long prefix silently share one physical table.
- **Fix:** Track the parent/child relationship explicitly (a metadata column or a registry table), not
  by string prefix. Add an upload/schema discriminator to physical names.

### 4. Unbounded `stagedUploads` cache → memory + disk leak / DoS
`JsonIngestionService.stagedUploads` (a `ConcurrentHashMap`) is populated on every `/api/upload` analyze
and only evicted when a matching `/ingest` arrives. Abandoned analyses (user navigates away) retain the
full schema + sample data in heap and leave temp CSVs on disk indefinitely (`deleteOnExit` only fires at
JVM shutdown and itself leaks references). **Fix:** Caffeine cache with `expireAfterWrite` +
`maximumSize` + a removal listener that deletes staged files.

### 5. Frontend: leaked Chart.js instance + subscription leaks
- **`DashboardBuilderComponent.ngOnDestroy` never calls `destroyChart()`** — every builder visit orphans
  a live Chart with its own `ResizeObserver` and `requestAnimationFrame` loop. Memory and CPU climb
  across a session.
- **`HomeComponent` `families$` subscription never unsubscribed** — since `ActiveDatasetService` is a
  root singleton, each Home visit leaks the whole component; stale callbacks then render onto a dead view.
- Also: dangling 30s `setTimeout` per query (never cleared), `shareTimeout` not cleared on destroy.
- **Fix:** `takeUntilDestroyed()` / `async` pipe for subscriptions; destroy chart + clear all timers in
  `ngOnDestroy`.

### 6. Frontend: CSV parser corrupts data before ingestion
`schema-data-upload.component.ts parseCSV` uses naive `line.split(',')` with no quote handling — while
the repo *already has* a correct quote-aware `UploadService.splitCsvLine`. A cell like `"Smith, John"`
or `"1,000"` shifts every subsequent column, and the mis-parsed rows are POSTed to the DB. **Fix:** reuse
`splitCsvLine` / a real CSV parser; don't parse twice with two algorithms.

### 7. Broken checksum branch defeats duplicate detection
`SchemaBasedIngestionService` L179 decides how to serialize data for the dedup checksum based on
`ObjectMapper.class.getClassLoader().getResourceAsStream("") != null` — an implementation-defined
condition with **no logical relation** to serialization, producing non-deterministic checksums across
environments. Related: `computeFingerprint`/`canonicalizeRow` uses `JsonNode.asText()`, which returns
`""` for nested objects/arrays — so a record whose only change is inside a nested field gets an identical
fingerprint and is falsely skipped as `"UNCHANGED"` (silent data loss). **Fix:** serialize the whole node
deterministically with an injected `ObjectMapper`.

### 8. No schema-migration tooling; dead migration file
Flyway/Liquibase is **not** a dependency, and there are no `spring.flyway.*` properties — so
`V3__CreateSchemaTables.sql` is **never executed** (that's why there's no V1/V2). The real schema is
built imperatively via `@PostConstruct CREATE TABLE IF NOT EXISTS` + inline `ALTER` in the repositories,
giving **two drifting definitions of the same tables**. **Fix:** adopt Flyway, move all DDL into ordered
immutable migrations, delete the orphaned file, disable startup DDL.

### 9. No CI/CD, no containerization, no observability
No `.github/`, `Dockerfile`, `docker-compose`, or logging config. Health check is `GET /api/hello` →
`"Hello World"` (doesn't verify the DB). No actuator, Micrometer metrics, structured logging, or
readiness/liveness probes. **Fix:** CI pipeline (`mvn verify` + Testcontainers, `ng lint/test/build`,
`npm audit`/OWASP dependency-check); multi-stage Dockerfiles + compose; `spring-boot-actuator` +
`micrometer-registry-prometheus` + JSON logging with correlation IDs.

### 10. Near-zero test coverage
3 backend test files for 60 sources (only the SQL-generation path — which *is* well-tested); **0
frontend spec files** despite Karma/Jasmine being fully configured. The most complex code (streaming
ingestion, dynamic DDL, nested flattening, versioning, drilldown, the 2,468-line builder) is entirely
unverified. The committed debug scripts (below) are evidence bugs are being chased by hand instead of by
tests.

### 11. Vulnerable/EOL dependencies
- **`xlsx@0.18.5`** (client-side Excel parsing of untrusted uploads) has known Prototype Pollution +
  ReDoS advisories; SheetJS no longer publishes fixes to npm. Move to the vendor CDN build or `exceljs`.
- **Angular 17.3** is past end-of-life (no security patches); TypeScript 5.2 is old. Plan an LTS upgrade.

### 12. Committed debug artifacts & production placeholders
- Git-tracked junk at repo root: `browser_console_test.js`, `test_filter_bug.js`, `test_filter_bug2.js`,
  and a stray root `package.json`/`package-lock.json` (named `martin-updated-saturday`) existing only to
  pull in Playwright for those scripts; plus `backend/combo-test.ps1`. **Remove or relocate to a proper
  `e2e/`.**
- **`environment.prod.ts` ships `apiUrl: 'https://api.example.com/api'`** — a placeholder that makes
  every prod call fail.

---

## 🟡 P2 — Medium (hardening & correctness)

- **Info disclosure:** `/execute-query`, `/generate-query`, `/aggregate`, and drilldown all return the
  generated raw SQL to the client, exposing internal table/column structure. Gate behind a debug flag.
  (Note: the `GlobalExceptionHandler` correctly hides SQL on *errors* — good — but
  `DrilldownCandidateSelector` L115 and `handleBadRequest` echo raw `e.getMessage()`, which can leak DB
  detail.)
- **Wrong HTTP status:** "Schema not found" throws `IllegalArgumentException` → **400** everywhere in
  `SchemaManagementService`/`SchemaBasedIngestionService`, contradicting the Swagger-documented 404.
  `ResourceNotFoundException` (→404) already exists and is used correctly elsewhere.
- **Concurrency races:** `nextVersionNumber` and `appendNewKeys` do read-then-write `SELECT MAX(...)+1`
  outside a transaction — concurrent uploads to one schema can collide on `version_number` or
  `(upload_id, row_id)`. Use a DB sequence or atomic `INSERT…SELECT`.
- **Missing input validation → 500s:** `SchemaManagementService.uploadSchema` (null `fields`/`schemaName`
  → NPE/constraint 500); `DatasetController.aggregate` (unchecked `(List)` casts → `ClassCastException`;
  duplicate measure `field`s → duplicate SQL alias → 500).
- **No connection-pool / statement timeouts** (no HikariCP or `statement_timeout` config) — a large
  dynamic JOIN query can exhaust connections or hang threads.
- **No Spring profiles** — dev defaults (localhost DB/CORS) baked into a single `application.properties`.
- **N+1 queries:** `DashboardService.getDashboards` (one widget query per dashboard);
  `CsvIngestionService.insertRow` (row-by-row INSERT while JSON path uses `COPY`); drilldown resolves the
  dataset twice per request.
- **Frontend performance cliff:** **no `OnPush` anywhere** + heavy work in template bindings called every
  CD tick — `new Fuse(...)` rebuilt per tick in a getter (`filteredVisibleDatasets`), O(rows)
  distinct-label scans over up to 10K rows (`currentAllLabels`), `colDisabled`'s combinatorial
  compatibility search per column per tick. **50 `*ngFor` loops, only 1 with `trackBy`.** Adopt `OnPush`
  + signals, memoize, add `trackBy`.
- **Frontend correctness:** parallel widget hydration mutates `committedWidgets` with no
  destroy-guard/cancellation (stale responses overwrite state); swallowed errors (`catch(() => {})`)
  leave blank widgets with no feedback; up to 10K rows × N datasets held in browser memory for
  client-side aggregation that the server already supports.
- **Fat controller:** `DatasetController` (566 lines) embeds SQL building, join-topology discovery, and
  multi-step delete/rename that belong in a service and duplicate `QueryConfigNormalizer`'s join logic;
  its `deleteDataset` multi-table drop is itself non-transactional.

---

## ⚪ P3 — Low (hygiene)

- **Silent error swallowing:** `SchemaRepositoryImpl` row mappers swallow JSON parse errors;
  `DashboardService.generateSqlForWidget` returns `""` on any failure with no log; `attachHydratedData`
  is dead code still running queries.
- **Dead frontend code:** 5 unused widget components, `VisualizationService` (394 lines),
  `WidgetVersionService`, `FileSizePipe`, and a **second incompatible `WidgetSpec`** model that shadows
  the real one.
- **Accessibility:** custom dropdowns are `<div (click)>` with no roles/keyboard support; modals lack
  `role="dialog"`, focus trap, Escape handling.
- 45 `console.*` calls ship to production; `settings.component.ts` is entirely mock (hardcoded
  `alexander@hyland.com`, no-op buttons); direct `document.querySelector` from components; duplicated
  palette/gradient constants; wrong ports and dead links throughout `files/*.md` and `v_testing/*.md`
  docs; unused imports; `spring-boot-devtools` present (confirm excluded from prod); empty `pom.xml`
  metadata.

---

## ✅ Strengths worth preserving

Externalized DB secret (`${DB_PASSWORD}`); **injection-safe dynamic SQL** — identifiers validated +
double-quoted via `SqlIdentifier`, all values bound, inlined UUIDs validated (no SQLi hole found, and
`QueryControllerTest`/`SqlIdentifierTest` cover it well); credential-safe, env-driven CORS (no `*`,
credentials off); info-disclosure-safe `GlobalExceptionHandler`; memory-efficient streaming ingestion
(`JsonRecordStreamer → CsvStagingWriter → COPY`); strong TS strict mode + build budgets; safe
`innerHTML` usage (all sinks escape or use static SVG — no XSS found). `localStorage` holds only benign
UI prefs (favorites, view mode, drafts) — no tokens.

---

## 🚀 Suggested new features & improvements

### Platform / enterprise-readiness (unlock the "enterprise" claim)
1. **Multi-tenancy + RBAC** — real users, orgs, roles (viewer/editor/admin), row-level dataset sharing.
   This is the foundation everything else needs.
2. **Dashboard sharing & collaboration** — signed share links, public/embed tokens, view-only vs. edit,
   real-time co-editing.
3. **Scheduled refresh & alerting** — cron-driven data refresh, threshold alerts ("revenue < X →
   email/Slack"), export-to-PDF/email digests.
4. **Query result caching** — cache `/execute-query` results keyed by config hash + dataset version (you
   already compute fingerprints) to cut DB load.
5. **Audit & governance** — you have `audit_log`/`schema_audit_log` tables; actually populate them (who
   queried/edited/deleted what, when) and expose an admin audit view.

### Product / UX
6. More chart types (scatter, heatmap, treemap, combo/dual-axis, funnel) and **calculated fields / custom
   measures** (e.g. `profit = revenue - cost`).
7. **Cross-filtering** — clicking a bar filters other widgets on the same dashboard (extends your
   drilldown engine).
8. **Templates & theming** — starter dashboard templates, per-dashboard color themes, dark mode.
9. **Incremental / connector ingestion** — connect to a live Postgres/BigQuery/S3 source instead of only
   file upload; scheduled sync.
10. **Data quality panel** — surface the `null_count`/`distinct_count`/min/max you already compute as a
    profiling view on upload.

### Engineering quality (prerequisites for the above)
11. Decompose `DashboardBuilderComponent` into `QueryBuilderService` + `DimensionBucketingService` +
    `FuzzySearchService`; move to `OnPush` + signals. *(The single highest-leverage refactor — it fixes
    the leak, the perf cliff, and testability at once.)*
12. Server-side pagination/aggregation as the default (stop pulling 10K raw rows to the browser).
13. Testcontainers integration tests for ingestion/query + MockMvc for controllers + a frontend unit/E2E
    baseline with a coverage gate.

---

## Suggested fix order

P0 #1 (auth) and #2 (transactions) first — they gate everything and prevent data corruption; then #3
(table collisions) and #4 (staging leak) since they cause silent data loss; then stand up #8–#10
(migrations, CI, tests) so the remaining fixes can be made safely; then the frontend refactor (#5/#11)
and the P2/P3 cleanup.
