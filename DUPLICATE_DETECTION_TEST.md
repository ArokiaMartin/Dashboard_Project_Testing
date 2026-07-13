# Duplicate Detection Test - Quick Verification

## Test Scenario
Upload the SAME data twice and verify:
1. Second upload gets "DUPLICATE" response
2. No second version/table is created
3. No rows are wasted in database

## Test Files Already Available
- Schema: `v_testing/test_case_5_separate_versions_verification/product_schema.json`
- Data: `v_testing/test_case_5_separate_versions_verification/product_data_v1.json`

## Quick Test Steps

### 1. Build Backend
```bash
cd backend
./mvnw clean package -DskipTests
```

### 2. Start Backend
```bash
java -jar target/dashboard-backend-*.jar
```

### 3. Register Schema
```bash
POST http://localhost:8080/api/schema/register
Body: Copy from product_schema.json
```

### 4. Upload v1 (First Time)
```bash
POST http://localhost:8080/api/schema/ingest
Body: {
  "schemaId": "product_schema_005",
  "data": [products from product_data_v1.json],
  "originalFilename": "product_data_v1.json",
  "userId": "test_user"
}
```

**Expected Response:**
```json
{
  "uploadId": "uuid-1",
  "tableName": "product_catalog_v1",
  "rowsInserted": 7,
  "status": "SUCCESS"
}
```

**Check Logs for:**
```
✓ Checksum calculated for schema product_catalog: a3f5d8e2...
✓ Checking for duplicate: schemaId=product_schema_005, checksum=a3f5d8e2...
✓ No duplicate found - this is new data, will create version
✓ Version 1 REGISTERED successfully
```

### 5. Upload v1 Again (SAME Data)
```bash
POST http://localhost:8080/api/schema/ingest
Body: {
  "schemaId": "product_schema_005",
  "data": [SAME products from product_data_v1.json],
  "originalFilename": "product_data_v1.json",
  "userId": "test_user"
}
```

**Expected Response:**
```json
{
  "uploadId": "uuid-1",  // Same as first upload
  "tableName": "product_catalog_v1",
  "status": "DUPLICATE",
  "message": "This data already exists. Duplicate of version: v_abc123",
  "rowsInserted": 0
}
```

**Check Logs for:**
```
✓ Checksum calculated for schema product_catalog: a3f5d8e2...
✓ Checking for duplicate: schemaId=product_schema_005, checksum=a3f5d8e2...
✓ DUPLICATE DETECTED! Schema: product_catalog, Checksum: a3f5d8e2..., Existing Version: v_abc123
```

## Verify in Database

### Check Only 1 Version Exists
```sql
SELECT COUNT(*) FROM data_versions WHERE schema_id = 'product_schema_005';
-- Expected: 1 (not 2!)
```

### Check Only 1 Table Created
```sql
SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'product_catalog_v%';
-- Expected: product_catalog_v1 (only one table!)
```

### Check Row Count Stayed Same
```sql
SELECT COUNT(*) FROM product_catalog_v1;
-- Expected: 7 (not 14, no duplication!)
```

### Check Checksum is Stored
```sql
SELECT version_number, checksum FROM data_versions WHERE schema_id = 'product_schema_005';
-- Should show v1 with checksum a3f5d8e2c9b1e4f7...
```

## Success Criteria

✅ **TEST PASSES IF:**
1. First upload returns SUCCESS with 7 rows inserted
2. Second upload returns DUPLICATE with 0 rows
3. Database shows only 1 version in data_versions
4. Database shows only 1 table (product_catalog_v1)
5. product_catalog_v1 contains exactly 7 rows (not 14)
6. Logs show checksum matching and duplicate detection

❌ **TEST FAILS IF:**
1. Second upload returns SUCCESS instead of DUPLICATE
2. New v2 table is created
3. data_versions table has 2 entries
4. product_catalog_v1 has 14 rows
5. Logs show duplicate check throwing error

## Troubleshooting

### If logs show error during duplicate check
Check error message - it will tell you exactly what failed

### If second upload creates v2 instead of detecting duplicate
This means:
1. First upload's checksum wasn't registered (version registration failed)
2. OR checksum is being calculated differently on second upload

### If build fails
```bash
./mvnw clean compile -DskipTests
```

---

**This test confirms the duplicate detection system is working correctly!**
