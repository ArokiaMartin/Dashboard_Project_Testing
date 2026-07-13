# Versioning Fix: Separate Tables for Each Version (v1, v2, v3)

## Problem Statement

**Before Fix:**
- Upload 1 (sales_data_v1.json) → Table: `sales_data_v1`
- Upload 2 (sales_data_v2.json) → Table: `sales_data_v1` (SAME TABLE!)
- Upload 3 (sales_data_v3.json) → Table: `sales_data_v1` (SAME TABLE!)
- **Result:** Data was merged/modified instead of creating separate versions

**What User Wanted:**
- Upload 1 → Version 1 (complete snapshot)
- Upload 2 → Version 2 (complete snapshot, separate)
- Upload 3 → Version 3 (complete snapshot, separate)

---

## Solution: Separate Tables per Version

**After Fix:**
- Upload 1 → Table: `sales_data_v1` (9 rows)
- Upload 2 → Table: `sales_data_v2` (9 rows, separate table)
- Upload 3 → Table: `sales_data_v3` (6 rows, separate table)
- **Result:** Each version gets its own table with complete snapshot

---

## Code Changes

### File: `SchemaBasedIngestionService.java`

#### Change 1: Calculate Version Number First (Lines 100-104)

**BEFORE:**
```java
String tableName = IdentifierNaming.sanitizeIdentifier(
    schema.schemaName() + "_v1",  // Always v1!
    "schema_" + IdentifierNaming.shortId(schema.id(), 8)
);
```

**AFTER:**
```java
// Get the next version number FIRST to determine table name
int nextVersionNum = nextVersionNumber(request.schemaId());
String tableName = IdentifierNaming.sanitizeIdentifier(
    schema.schemaName() + "_v" + nextVersionNum,  // Creates: v1, v2, v3, etc.
    "schema_" + IdentifierNaming.shortId(schema.id(), 8)
);
```

**Why:** 
- Before: Hardcoded to `_v1` always
- After: Dynamic based on upload sequence (1, 2, 3...)
- Result: Creates `sales_data_v1`, `sales_data_v2`, `sales_data_v3` (separate tables)

---

#### Change 2: Update data_uploads with Version Number (Lines 122-126)

**ADDED:**
```java
// Update data_uploads with schema_id, version_number, and fingerprint
String fingerprint = computeFingerprint(request.data());
jdbcTemplate.update(
    "UPDATE data_uploads SET schema_id = ?, version_number = ?, data_fingerprint = ? WHERE id = ?",
    request.schemaId(), nextVersionNum, fingerprint, uploadId
);
```

**Why:**
- Records which version number this upload is
- Links upload to correct version
- Used for tracking and comparison

---

#### Change 3: Disable Merge Logic (Lines 128-141)

**BEFORE:**
```java
if (!latest.isEmpty()) {
    IngestResponse merged = applyIncrementalUpload(
        latest.get(0), uploadId, tableName, fingerprint, ingestResponse, schema, request
    );
    if (merged != null) {
        return merged;  // Try to merge with previous version
    }
}
```

**AFTER:**
```java
// NOTE: Disabled incremental merge logic (applyIncrementalUpload) to ensure
// every different dataset creates a new version. Users want explicit versions (v1, v2, v3),
// not automatic merging of incremental changes.
//
// if (!latest.isEmpty()) {
//     IngestResponse merged = applyIncrementalUpload(...);
//     if (merged != null) return merged;
// }
```

**Why:**
- Old logic tried to be "smart" and merge data
- New logic: Every upload = New version (simple, predictable)
- No more automatic appending or modifications

---

#### Change 4: Simplify Version Registration (Lines 154-182)

**BEFORE:**
```java
int versionNumber = nextVersionNumber(request.schemaId());
// ... duplicate version number call
dataVersioningService.registerVersion(versionRequest);
log.info("Version {} registered...", versionNumber, ...);
```

**AFTER:**
```java
// Use nextVersionNum calculated at the start
dataVersioningService.registerVersion(versionRequest);
log.info("Version {} registered successfully for schema: {}, Table: {}",
    nextVersionNum, schema.schemaName(), tableName);
```

**Why:**
- Consistent version number throughout
- Uses the same version that was used for table naming
- No race conditions or mismatches

---

## How It Works Now

### Step-by-Step Flow

```
USER UPLOADS sales_data_v1.json (9 rows)
    ↓
1. Calculate version number
   └─ Query: SELECT MAX(version_number) FROM data_uploads WHERE schema_id='sales'
   └─ Result: NULL (no previous uploads)
   └─ Calculation: COALESCE(NULL, 0) + 1 = 1
   └─ nextVersionNum = 1
    ↓
2. Create table name
   └─ tableName = "sales_data_v1"
    ↓
3. Ingest data
   └─ INSERT 9 rows into sales_data_v1
   └─ uploadId = UUID generated
    ↓
4. Update metadata
   └─ UPDATE data_uploads SET version_number=1, schema_id='sales', fingerprint=...
    ↓
5. Register version
   └─ INSERT into data_versions:
      ├─ version_number: 1
      ├─ table_name: sales_data_v1
      ├─ checksum: abc123...
      └─ row_count: 9
    ↓
✓ VERSION 1 CREATED

---

USER UPLOADS sales_data_v2.json (9 rows, modified data)
    ↓
1. Calculate version number
   └─ Query: SELECT MAX(version_number) FROM data_uploads WHERE schema_id='sales'
   └─ Result: 1 (from previous upload)
   └─ Calculation: 1 + 1 = 2
   └─ nextVersionNum = 2
    ↓
2. Create table name
   └─ tableName = "sales_data_v2" ← DIFFERENT TABLE!
    ↓
3. Ingest data
   └─ INSERT 9 rows into sales_data_v2 ← NEW TABLE!
   └─ uploadId = NEW UUID
    ↓
4. Update metadata
   └─ UPDATE data_uploads SET version_number=2, schema_id='sales', fingerprint=...
    ↓
5. Register version
   └─ INSERT into data_versions:
      ├─ version_number: 2
      ├─ table_name: sales_data_v2 ← NEW!
      ├─ checksum: def456... ← DIFFERENT!
      └─ row_count: 9
    ↓
✓ VERSION 2 CREATED (separate from v1)

---

USER UPLOADS sales_data_v3.json (6 rows, different data)
    ↓
1. Calculate version number: 3
2. Create table name: sales_data_v3
3. Ingest 6 rows into sales_data_v3
4. Update metadata with version_number=3
5. Register version in data_versions
    ↓
✓ VERSION 3 CREATED (completely separate)
```

---

## Database State After 3 Uploads

### Physical Tables

```
sales_data_v1 (version 1)
├─ 9 rows from upload 1
├─ month: 2026-01-01, 2026-02-01, 2026-03-01 (repeated for each region)
├─ region: North, South, East
└─ sales_amount: 50000-60000 range

sales_data_v2 (version 2)
├─ 9 rows from upload 2 (different values)
├─ month: 2026-01-01, 2026-02-01, 2026-03-01
├─ region: North, South, East
└─ sales_amount: 55000-70000 range (higher by ~10%)

sales_data_v3 (version 3)
├─ 6 rows from upload 3 (different records)
├─ Different schema or subset of records
└─ Complete separate snapshot
```

### data_versions Metadata Table

```
version_id    | version_number | schema_id  | table_name    | checksum       | row_count
v_abc12345   | 1              | sales_id   | sales_data_v1 | abc123def456   | 9
v_def67890   | 2              | sales_id   | sales_data_v2 | def456ghi789   | 9
v_ghi13579   | 3              | sales_id   | sales_data_v3 | ghi789jkl012   | 6
```

---

## User Experience in Dashboard

### Step 1: Select Schema
```
Dashboard Builder
├─ Available Schemas:
│  ├─ customers
│  ├─ sales ← User selects this
│  └─ clinic
```

### Step 2: Version Dropdown Appears
```
Versions for "sales":
├─ Version 1 (9 rows, checksum: abc123...)
├─ Version 2 (9 rows, checksum: def456...)
└─ Version 3 (6 rows, checksum: ghi789...)
```

### Step 3: User Selects Version
```
User clicks: "Version 2 (9 rows)"
    ↓
Frontend calls: GET /api/data/versions/schema/sales_id
    ↓
Backend loads: all rows from sales_data_v2
    ↓
Dashboard displays: Version 2 data
    ├─ Can create widgets from v2
    ├─ Can compare v1 vs v2
    └─ Can overlay on charts
```

---

## Testing the Fix

### Test Case: Multiple Versions (From v_testing)

**Files:**
- `sales_schema.json` - Schema definition
- `sales_data_v1.json` - 9 records
- `sales_data_v2.json` - 9 records (modified)
- `sales_data_v3.json` - 6 records (different)

**Test Steps:**

1. **Upload Version 1**
   ```bash
   POST /api/schema/ingest
   {
     "schemaId": "sales_schema",
     "data": [... 9 records from sales_data_v1.json ...]
   }
   ```
   **Expected:**
   - ✓ Creates table: `sales_data_v1`
   - ✓ Inserts 9 rows
   - ✓ Version 1 in data_versions
   - ✓ Checksum: abc123...

2. **Upload Version 2**
   ```bash
   POST /api/schema/ingest
   {
     "schemaId": "sales_schema",
     "data": [... 9 records from sales_data_v2.json ...]
   }
   ```
   **Expected:**
   - ✓ Creates table: `sales_data_v2` (NEW TABLE!)
   - ✓ Inserts 9 rows
   - ✓ Version 2 in data_versions
   - ✓ Checksum: def456... (DIFFERENT!)
   - ✓ sales_data_v1 still exists untouched

3. **Upload Version 3**
   ```bash
   POST /api/schema/ingest
   {
     "schemaId": "sales_schema",
     "data": [... 6 records from sales_data_v3.json ...]
   }
   ```
   **Expected:**
   - ✓ Creates table: `sales_data_v3` (NEW TABLE!)
   - ✓ Inserts 6 rows
   - ✓ Version 3 in data_versions
   - ✓ Checksum: ghi789... (DIFFERENT!)
   - ✓ All previous tables still exist

4. **Check Available Versions**
   ```bash
   GET /api/data/versions/schema/sales_schema
   ```
   **Expected Response:**
   ```json
   [
     {
       "versionNumber": 1,
       "checksum": "abc123...",
       "rowCount": 9,
       "tableName": "sales_data_v1"
     },
     {
       "versionNumber": 2,
       "checksum": "def456...",
       "rowCount": 9,
       "tableName": "sales_data_v2"
     },
     {
       "versionNumber": 3,
       "checksum": "ghi789...",
       "rowCount": 6,
       "tableName": "sales_data_v3"
     }
   ]
   ```

5. **Open Dashboard Builder**
   ```
   Expected:
   - Version 1 (9 rows) ← Selectable
   - Version 2 (9 rows) ← Selectable
   - Version 3 (6 rows) ← Selectable
   
   All versions show in dropdown with row counts
   ```

---

## Summary of Fix

| Aspect | Before | After |
|--------|--------|-------|
| Table Naming | Always `_v1` | `_v1`, `_v2`, `_v3` (dynamic) |
| Data Storage | Same table (merged) | Separate tables (isolated) |
| Versions Created | 1 (merged all data) | 3 (one per upload) |
| Version Snapshots | No | Yes (complete per version) |
| Data Modification | Yes (appended/merged) | No (each is separate snapshot) |
| User Selection | Only 1 version | All 3 versions available |
| Checksums | Same for similar data | Unique per version |
| Table Names in DB | sales_data_v1 | sales_data_v1, sales_data_v2, sales_data_v3 |

---

## What Changed in Logic

**Old Logic (Buggy):**
```
Try to merge new data with existing version
  ├─ If same schema AND same primary keys → Append or modify
  ├─ If modifications detected → Create "snapshot"
  └─ Result: Confusing mix of merging and versioning
```

**New Logic (Fixed):**
```
Every upload = New Version, Period
  ├─ Get next version number (1, 2, 3...)
  ├─ Create new table: schema_name_v{number}
  ├─ Ingest complete dataset to new table
  ├─ Register version metadata
  └─ Result: Clear, predictable v1, v2, v3
```

---

## Building & Testing

1. **Build:**
   ```bash
   mvn clean build
   ```

2. **Run Application:**
   ```bash
   java -jar dashboard-backend.jar
   npm run start  # Frontend
   ```

3. **Test with v_testing Data:**
   - Upload 3 files from `v_testing/test_case_2_multiple_versions/`
   - Verify 3 separate tables created
   - Verify dashboard shows 3 version options
   - Verify checksums are different

4. **Verify in Database:**
   ```sql
   -- Check tables created
   SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'sales_data_%';
   -- Expected: sales_data_v1, sales_data_v2, sales_data_v3
   
   -- Check versions registered
   SELECT version_number, table_name, checksum, row_count FROM data_versions WHERE schema_id = 'sales_schema';
   -- Expected: 3 rows with different checksums
   ```

---

## Conclusion

✅ **Fixed:** Each upload now creates a separate version (v1, v2, v3)
✅ **Simple:** No complex merge logic, just straightforward versioning
✅ **Clear:** Users see all versions and can select any one
✅ **Isolated:** Each version has its own table, no data mixing
✅ **Ready:** Test and deploy to production
