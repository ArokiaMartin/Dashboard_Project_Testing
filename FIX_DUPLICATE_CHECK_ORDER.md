# Fix: Move Duplicate Check BEFORE Ingestion

## The Problem (FIXED!)

**Old (Wrong) Order:**
```
1. Calculate version number
2. Create table
3. Ingest data ← Data inserted here
4. Calculate checksum
5. Check if duplicate ← TOO LATE!
```

**Issue:** If data was duplicate, we'd already:
- Created a new table
- Wasted a version number
- Ingested duplicate data

---

## The Solution (NEW)

**New (Correct) Order:**
```
1. Calculate checksum FIRST
2. Check if duplicate EXISTS
   ├─ IF YES → STOP! Return duplicate response
   └─ IF NO → Continue...
3. Calculate version number
4. Create table
5. Ingest data
6. Register version
```

---

## What Changed

### File: SchemaBasedIngestionService.java

#### STEP 1: Calculate Checksum FIRST
```java
// Calculate checksum from actual data content
String jsonData = new ObjectMapper().writeValueAsString(request.data());
String checksum = VersioningUtil.calculateChecksumFromString(jsonData);
```

#### STEP 2: Check for Duplicates BEFORE Ingesting
```java
// Query database BEFORE doing anything else
VersionCheckResult duplicateCheck = dataVersioningService.checkDuplicate(
    new CheckDuplicateRequest(request.schemaId().toString(), checksum)
);

// If duplicate, STOP immediately
if (duplicateCheck.isDuplicate()) {
    log.info("Duplicate upload detected for version: {}", 
             duplicateCheck.getOriginalVersionId());
    
    // Return response without ingesting
    return new IngestResponse(
        duplicateCheck.getOriginalVersionId(),
        schema.schemaName() + "_v1",
        0,  // No rows inserted
        schema.fields().size(),
        "DUPLICATE",
        null,
        "This data already exists as version: " + duplicateCheck.getOriginalVersionId()
    );
}
```

#### STEP 3: Only if NOT Duplicate, Calculate Version Number
```java
// If we reach here, data is NEW
int nextVersionNum = nextVersionNumber(request.schemaId());
String tableName = schema.schemaName() + "_v" + nextVersionNum;
```

#### STEP 4: Ingest Data
```java
// Safe to ingest - we know it's not a duplicate
IngestResponse ingestResponse = jsonIngestionService.ingest(ingestRequest);
```

#### STEP 5: Register Version
```java
// Register with checksum we calculated earlier
dataVersioningService.registerVersion(
    new RegisterVersionRequest(
        request.schemaId().toString(),
        schema.schemaName(),
        tableName,
        checksum,  // Use checksum from STEP 1
        ingestResponse.rowsInserted(),
        request.originalFilename(),
        false,  // isDuplicate = false (we verified!)
        null,   // originalVersionId = null (it's new!)
        request.userId()
    )
);
```

---

## Example: How It Works Now

### Upload 1: sales_data_v1.json
```
1. Checksum: a3f5d8e2c9b1e4f7...
2. Check database: NOT FOUND
3. Decision: NEW DATA ✓
4. Version: 1 ✓
5. Table: sales_data_v1 ✓
6. Ingest 9 rows ✓
7. Register Version 1 ✓

Result: ✓ Version 1 created
```

### Upload 2: sales_data_v2.json (Different)
```
1. Checksum: def456a1b2c3d4e5... (DIFFERENT!)
2. Check database: NOT FOUND
3. Decision: NEW DATA ✓
4. Version: 2 ✓
5. Table: sales_data_v2 ✓
6. Ingest 9 rows ✓
7. Register Version 2 ✓

Result: ✓ Version 2 created
```

### Upload 3: sales_data_v2.json again (Same)
```
1. Checksum: def456a1b2c3d4e5... (SAME!)
2. Check database: FOUND (matches Version 2)
3. Decision: DUPLICATE! ✗
4. STOP HERE! ← Don't create version, table, or ingest!
5. Return: "Duplicate of Version 2"

Result: ✗ Duplicate detected! No new table, no ingestion
```

---

## Key Improvements

| Aspect | Before | After |
|--------|--------|-------|
| Check for duplicates | After ingesting | Before ingesting |
| Resources wasted on duplicates | Yes (new table, version number) | No (stopped early) |
| Data isolation | Mixed versions | Clean separation |
| Performance | Slower (unnecessary ingestion) | Faster (early exit) |
| Correctness | Can create duplicate tables | Prevents duplicate ingestion |

---

## Added Imports

```java
import com.example.dashboard_backend.model.CheckDuplicateRequest;
import com.example.dashboard_backend.model.VersionCheckResult;
```

---

## Testing This Fix

### Test Case: Upload Same Data Twice

**Upload 1:**
```
POST /api/schema/ingest
Body: sales_data_v1.json

Expected Response:
{
  "uploadId": "uuid_1",
  "tableName": "sales_data_v1",
  "rowsInserted": 9,
  "status": "SUCCESS"
}
```

**Upload 2 (Same File):**
```
POST /api/schema/ingest
Body: sales_data_v1.json (SAME)

Expected Response:
{
  "uploadId": "uuid_1",  // Same as first upload
  "tableName": "sales_data_v1",
  "rowsInserted": 0,     // No new rows inserted!
  "status": "DUPLICATE",
  "message": "This data already exists as version: v_abc123"
}
```

**Verification:**
```sql
-- Check database state
SELECT COUNT(*) FROM sales_data_v1;
-- Expected: 9 (not 18, because second upload was rejected)

SELECT COUNT(*) FROM data_versions WHERE schema_id = 'sales_schema';
-- Expected: 1 (only one version, not two)
```

---

## Summary

✅ **Checksum calculated FIRST** (from actual data values)
✅ **Duplicate check happens BEFORE ingestion** (saves resources)
✅ **If duplicate detected → STOP immediately** (no version created)
✅ **Only if new data → version auto-increments** (correct flow)

**Result:** Clean, efficient versioning system that prevents duplicate ingestion!
