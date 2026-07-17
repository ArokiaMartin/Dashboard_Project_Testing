# Sample data for drilldown testing

The app upload is **two steps**: Step 1 = a schema definition file, Step 2 = the data file.
Upload them as pairs.

## Pair A — fan-out demo (main test)
- **Step 1 (schema):** `transactions.schema.json`
- **Step 2 (data):**   `transactions-fanout.json`

Produces a parent table `transactions_v1` (txn_id, name, region, cost) and a child table
`transactions_v1_products` (product) linked by parent_row_id. `cost` is on the parent and
transactions T-1 / T-5 each have two products, so breaking cost down by product **fans out**
(Alice would sum to 130 vs. her real 100) — this is the case the fan-out guard must catch.

Expected base chart: name vs SUM(cost) -> Alice 100, Bob 100.

## Pair B — safe grain demo
- **Step 1 (schema):** `orders.schema.json`
- **Step 2 (data):**   `orders-safe.json`

Here `cost` lives per-product on the child `items`, so grouping child cost by child product is
many-to-one (no inflation). Alice 100, Bob 100.

## Notes
- The nested array (`products` / `items`) is intentionally NOT declared in the schema. Validation
  will emit a harmless warning ("field not defined in schema, will be ignored") but still ingest it
  as a child table.
- After ingesting Pair A, the DATASET dropdown in the builder should list both `transactions_v1`
  and `transactions_v1_products`.
