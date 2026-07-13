# Test Case 5: Separate Versions Verification

## Quick Summary

This test case verifies that the **versioning fix is working correctly** by uploading 3 different datasets to the same schema and confirming that:
- ✅ Each upload creates a **SEPARATE physical table** (v1, v2, v3)
- ✅ Each version gets **unique metadata** in data_versions table
- ✅ Data is **NOT merged** between versions
- ✅ Users can **select any version** in dashboard
- ✅ Each version shows **correct isolated data**

---

## Test Files

### Schema Definition
**File:** `product_schema.json`
- Schema Name: `product_catalog`
- Primary Key: `product_id`
- 6 fields (ID, name, category, price, stock, date)

### Data Versions

**Version 1:** `product_data_v1.json`
- Records: 7 products
- Prices: $12.99 - $1,299.99
- Date: 2026-01-15
- Checksum: Different from v2 and v3

**Version 2:** `product_data_v2.json`
- Records: 9 products (added 2 new items)
- Prices: $11.99 - $1,199.99 (price reductions)
- Date: 2026-02-20
- Checksum: Different from v1 and v3

**Version 3:** `product_data_v3.json`
- Records: 6 products (different subset)
- Prices: $16.99 - $1,349.99 (price increases)
- Date: 2026-03-25
- Checksum: Different from v1 and v2

### Test Results
**File:** `test_results_template.txt`
- Print and fill in as you test
- Track all verification steps
- Record pass/fail status

---

## How to Run This Test

### 1. Register Schema
```bash
POST /api/schema/register
Body: product_schema.json
```
✓ Should succeed

### 2. Upload Version 1
```bash
POST /api/schema/ingest
File: product_data_v1.json
Schema ID: product_schema_005
```
✓ Should create: `product_catalog_v1` table
✓ Should insert: 7 rows
✓ Should register: Version 1 in data_versions

### 3. Upload Version 2
```bash
POST /api/schema/ingest
File: product_data_v2.json
Schema ID: product_schema_005
```
✓ Should create: `product_catalog_v2` table (DIFFERENT!)
✓ Should insert: 9 rows (to NEW table)
✓ Should register: Version 2 in data_versions
✓ Should keep: Version 1 untouched

### 4. Upload Version 3
```bash
POST /api/schema/ingest
File: product_data_v3.json
Schema ID: product_schema_005
```
✓ Should create: `product_catalog_v3` table (DIFFERENT!)
✓ Should insert: 6 rows (to NEW table)
✓ Should register: Version 3 in data_versions
✓ Should keep: Versions 1 and 2 untouched

### 5. Verify API
```bash
GET /api/data/versions/schema/product_schema_005
```
✓ Should return: 3 version objects
✓ Each should have: different checksum, correct row count, correct table name

### 6. Test Dashboard
- Open: Dashboard Builder
- Select: product_catalog schema
- Verify: Version dropdown shows v1, v2, v3
- Test: Click each version, confirm data changes

---

## Expected Database State

### Tables Created
```
product_catalog_v1 (7 rows)
product_catalog_v2 (9 rows)
product_catalog_v3 (6 rows)
```

### Versions Registered
```
data_versions table:
version_number | row_count | table_name         | checksum
1              | 7         | product_catalog_v1 | abc123...
2              | 9         | product_catalog_v2 | def456...
3              | 6         | product_catalog_v3 | ghi789...
```

### Key Differences to Verify

**Price of Laptop Pro 15:**
- Version 1: $1,299.99
- Version 2: $1,199.99 (reduced 7.7%)
- Version 3: $1,349.99 (increased 3.8%)

**Product Count:**
- Version 1: 7 products
- Version 2: 9 products (+2 new)
- Version 3: 6 products (different subset)

---

## Success Criteria

| Item | Expected | Status |
|------|----------|--------|
| 3 tables created | product_catalog_v1, v2, v3 | ✓ |
| Row counts | 7, 9, 6 | ✓ |
| Data isolation | No mixing | ✓ |
| Checksums different | All 3 unique | ✓ |
| API returns 3 versions | Version objects with metadata | ✓ |
| Dashboard dropdown | Shows v1, v2, v3 | ✓ |
| Dashboard data | Changes correctly per version | ✓ |

**ALL MUST PASS FOR TEST SUCCESS**

---

## Quick Database Queries

### Check tables created
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name LIKE 'product_catalog_v%' ORDER BY table_name;
```
Expected:
```
product_catalog_v1
product_catalog_v2
product_catalog_v3
```

### Check versions registered
```sql
SELECT version_number, row_count, table_name, checksum FROM data_versions 
WHERE schema_id = 'product_schema_005' ORDER BY version_number;
```
Expected: 3 rows with different checksums

### Check price differences
```sql
SELECT version_number, 
       (SELECT unit_price FROM product_catalog_v1 WHERE product_id = 1001) as v1_price,
       (SELECT unit_price FROM product_catalog_v2 WHERE product_id = 1001) as v2_price,
       (SELECT unit_price FROM product_catalog_v3 WHERE product_id = 1001) as v3_price;
```
Expected:
```
v1: 1299.99
v2: 1199.99
v3: 1349.99
```

### Check row counts
```sql
SELECT COUNT(*) as v1_rows FROM product_catalog_v1
UNION ALL
SELECT COUNT(*) as v2_rows FROM product_catalog_v2
UNION ALL
SELECT COUNT(*) as v3_rows FROM product_catalog_v3;
```
Expected:
```
7
9
6
```

---

## Troubleshooting

### Problem: Only 1 table created (v1)
**Cause:** Fix not applied or merge logic still active
**Solution:** Check SchemaBasedIngestionService.java line 100-104
- Should have: `int nextVersionNum = nextVersionNumber(schemaId)`
- Should have: `tableName = schema.schemaName() + "_v" + nextVersionNum`

### Problem: Checksums are the same
**Cause:** Data is identical between versions
**Solution:** Verify files have different data:
- v1 JSON has 7 records
- v2 JSON has 9 records
- v3 JSON has 6 records

### Problem: Dashboard shows only 1 version
**Cause:** API not returning all versions
**Solution:** Check data_versions table:
```sql
SELECT COUNT(*) FROM data_versions WHERE schema_id = 'product_schema_005';
```
Should return: 3

### Problem: Version data is mixed
**Cause:** Tables are being merged instead of isolated
**Solution:** Verify merge logic is disabled:
- Check line 128-141 in SchemaBasedIngestionService.java
- Should be commented out: `if (!latest.isEmpty()) { applyIncrementalUpload(...)`

---

## Test Output Example

```
✓ Schema registered: product_schema_005

✓ Version 1 uploaded:
  - Table: product_catalog_v1
  - Rows: 7
  - Checksum: a3f5d8e2c9b1e4f7...

✓ Version 2 uploaded:
  - Table: product_catalog_v2
  - Rows: 9
  - Checksum: def456a1b2c3d4e5...

✓ Version 3 uploaded:
  - Table: product_catalog_v3
  - Rows: 6
  - Checksum: ghi789jkl012mnop...

✓ All 3 tables exist and isolated
✓ All checksums different
✓ API returns 3 versions
✓ Dashboard shows v1, v2, v3 in dropdown
✓ Each version displays correct data

FINAL RESULT: ✅ PASSED
```

---

## Notes

- This test case specifically validates the **versioning fix**
- Compares 3 versions with **clear, measurable differences**
- Includes **sample product data** with price variations
- Provides **detailed SQL queries** for verification
- Includes **template for recording results**

**Use this test to confirm the fix is working before deploying to production!**
