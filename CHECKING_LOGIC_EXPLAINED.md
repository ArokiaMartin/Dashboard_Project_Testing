# Checking Logic: How Different Versions Are Detected

## Overview

The system uses a **simple but effective 8-step process** to:
1. ✅ Validate schema and data
2. ✅ Calculate version numbers (1, 2, 3...)
3. ✅ Create separate tables per version
4. ✅ Calculate checksums for comparison
5. ✅ Detect duplicates vs new versions
6. ✅ Register metadata
7. ✅ Return version information to user

---

## Complete Checking Flow

### STEP 1: Schema Validation

**Input:** User sends schemaId: 'sales_schema'

**Check:**
```java
Schema schema = schemaRepository.findById(request.schemaId())
    .orElseThrow(() -> new IllegalArgumentException("Schema not found"));
```

**Logic:**
```
IF schema exists in database → Continue
IF NOT found → Throw error: "Schema not found"
```

**Result:** Schema loaded with all field definitions

---

### STEP 2: Data Validation Against Schema

**Check:** For each row in incoming data:
```
✓ All required fields present?
✓ All field types correct (STRING, INTEGER, NUMERIC, DATE)?
✓ No unexpected fields?
```

**Code:**
```java
SchemaValidationService.ValidationResult validationResult = 
    validationService.validateDataAgainstSchema(schema, request.data());

if (!validationResult.isValid()) {
    throw new IllegalArgumentException(
        "Data validation failed: " + validationResult.errors()
    );
}
```

**Example:**
```
Upload: product_data_v2.json
Schema: product_catalog

Field Checks:
├─ product_id (INTEGER, required) → ✓ Present, correct type
├─ product_name (STRING, required) → ✓ Present, correct type
├─ unit_price (NUMERIC, required) → ✓ Present, correct type
├─ category (STRING, required) → ✓ Present, correct type
├─ stock_quantity (INTEGER, optional) → ✓ Present, correct type
└─ last_updated (DATE, optional) → ✓ Present, correct type

Result: ✓ All rows valid
```

---

### STEP 3: Calculate Next Version Number

**Key Logic:**
```java
int nextVersionNum = nextVersionNumber(request.schemaId());

// Queries database:
// SELECT COALESCE(MAX(version_number), 0) + 1 
// FROM data_uploads 
// WHERE schema_id = ?
```

**Examples:**

**First Upload:**
```
data_uploads table: EMPTY (no previous versions)
MAX(version_number): NULL
COALESCE(NULL, 0): 0
Result: 0 + 1 = 1 ✓
→ nextVersionNum = 1
```

**Second Upload:**
```
data_uploads table: 1 row with version_number=1
MAX(version_number): 1
COALESCE(1, 0): 1
Result: 1 + 1 = 2 ✓
→ nextVersionNum = 2
```

**Third Upload:**
```
data_uploads table: 2 rows with version_number=1,2
MAX(version_number): 2
COALESCE(2, 0): 2
Result: 2 + 1 = 3 ✓
→ nextVersionNum = 3
```

---

### STEP 4: Create Table Name Using Version Number

**Logic:**
```java
String tableName = schema.schemaName() + "_v" + nextVersionNum;
```

**Transformation:**

| nextVersionNum | Table Name | Result |
|---|---|---|
| 1 | 'sales' + '_v' + 1 | sales_data_v1 ✓ |
| 2 | 'sales' + '_v' + 2 | sales_data_v2 ✓ |
| 3 | 'sales' + '_v' + 3 | sales_data_v3 ✓ |

**Key Point:** Each version gets a **SEPARATE physical table** with unique name!

---

### STEP 5: Ingest Data to Correct Table

**Action:**
```java
IngestResponse ingestResponse = jsonIngestionService.ingest(ingestRequest);
```

**What Happens:**

**Upload 1:**
```sql
INSERT INTO sales_data_v1 (product_id, product_name, unit_price, category, stock_quantity, last_updated)
VALUES (1001, 'Laptop Pro 15', 1299.99, 'Electronics', 45, '2026-01-15'),
       (1002, 'USB-C Cable', 15.99, 'Accessories', 250, '2026-01-15'),
       ...
       (1007, 'Phone Stand', 19.99, 'Accessories', 200, '2026-01-15')
-- 7 rows inserted
```

**Upload 2:**
```sql
INSERT INTO sales_data_v2 (product_id, product_name, unit_price, category, stock_quantity, last_updated)
VALUES (1001, 'Laptop Pro 15', 1199.99, 'Electronics', 35, '2026-02-20'),
       (1002, 'USB-C Cable', 14.99, 'Accessories', 180, '2026-02-20'),
       ...
       (1009, 'Laptop Stand Adjustable', 59.99, 'Accessories', 50, '2026-02-20')
-- 9 rows inserted (to DIFFERENT table!)
```

**Result:** Each table has only its own version's data!

---

### STEP 6: Calculate Checksum

**Purpose:** Create unique fingerprint to identify duplicate uploads

**Code:**
```java
String jsonData = new ObjectMapper().writeValueAsString(request.data());
String checksum = VersioningUtil.calculateChecksumFromString(jsonData);
```

**Process:**

```
1. Convert data to JSON string
   Input: [
     {product_id: 1001, product_name: 'Laptop Pro 15', unit_price: 1299.99, ...},
     {product_id: 1002, product_name: 'USB-C Cable', unit_price: 15.99, ...},
     ...
   ]
   
   JSON String: 
   "[{\"product_id\":1001,\"product_name\":\"Laptop Pro 15\",\"unit_price\":1299.99,...}]"

2. Calculate SHA-256 hash of JSON string
   SHA-256("{"product_id":1001,...}") 
   → Complex algorithm producing 256-bit hash

3. Convert to 64-character hex string
   Result: a3f5d8e2c9b1e4f7a2d5c8b1e4f7a2d5c8b1e4f7a2d5c8b1e4f7a2d5c8b1e4
```

**Key Properties:**
```
Same data    → Same checksum (always)
Different data → Different checksum (guaranteed)
Tiny change  → Completely different checksum

Example:
Data v1: unit_price: 1299.99
Data v2: unit_price: 1199.99 (changed)
Checksum v1: a3f5d8e2c9b1e4f7...
Checksum v2: def456a1b2c3d4e5... ← COMPLETELY DIFFERENT!
```

---

### STEP 7: ⭐ Check If Duplicate (KEY DECISION)

**Purpose:** Determine if this data already exists in system

**Code:**
```java
VersionCheckResult duplicateCheck = dataVersioningService.checkDuplicate(
    request.schemaId(),
    checksum
);

// Inside checkDuplicate():
Optional<DataVersion> existing = repository.findByChecksumAndSchema(
    request.schemaId(), 
    checksum
);
```

**Database Query:**
```sql
SELECT * FROM data_versions 
WHERE schema_id = 'sales_schema' 
AND checksum = 'a3f5d8e2c9b1e4f7a2d5c8b1e4f7a2d5c8b1e4f7a2d5c8b1e4f7a2d5c8b1e4'
```

**Decision Logic:**

#### Scenario 1: First Upload
```
Query Result: NO ROWS FOUND
↓
isDuplicate = false
↓
Action: CREATE NEW VERSION (v1)
```

#### Scenario 2: Upload Different Data
```
Query Result: NO ROWS FOUND (checksum is different!)
↓
isDuplicate = false
↓
Action: CREATE NEW VERSION (v2)
```

#### Scenario 3: Upload Same Data Again
```
Query Result: FOUND (checksum matches existing version 2)
↓
isDuplicate = true
originalVersionId = 'v_def456' (reference to version 2)
↓
Action: SKIP INGESTION (don't create duplicate)
```

---

### STEP 8: Register Version in Metadata

**Code:**
```java
RegisterVersionRequest versionRequest = new RegisterVersionRequest(
    request.schemaId(),
    schema.schemaName(),
    tableName,                    // sales_data_v2
    checksum,                     // def456a1b2c3d4e5...
    ingestResponse.rowsInserted(), // 9
    request.originalFilename(),   // sales_data_v2.json
    isDuplicate,                  // false
    originalVersionId,            // null
    request.userId()
);

dataVersioningService.registerVersion(versionRequest);
```

**Database Insert:**
```sql
INSERT INTO data_versions (
    version_id,
    schema_id,
    schema_name,
    table_name,
    checksum,
    row_count,
    version_number,
    is_duplicate,
    original_version_id,
    created_by,
    uploaded_at
) VALUES (
    'v_def456',                      -- Generated UUID
    'sales_schema',                  -- From request
    'sales',                         -- From schema
    'sales_data_v2',                 -- Calculated in Step 4
    'def456a1b2c3d4e5f6a7...',      -- Calculated in Step 6
    9,                               -- Row count from ingestion
    2,                               -- Version number from Step 3
    false,                           -- Not a duplicate
    NULL,                            -- No original version (it's new)
    'user123',                       -- From request
    CURRENT_TIMESTAMP                -- Now
)
```

---

## Summary: The Decision Tree

```
Upload Data
    ↓
[Step 1] Schema Valid?
    YES → Continue
    NO  → ERROR: Schema not found
    ↓
[Step 2] Data Valid?
    YES → Continue
    NO  → ERROR: Validation failed
    ↓
[Step 3] Calculate Version Number
    Result: 1, 2, or 3
    ↓
[Step 4] Create Table Name
    Result: sales_data_v1, v2, or v3
    ↓
[Step 5] Ingest Data to Table
    Result: Rows inserted
    ↓
[Step 6] Calculate Checksum
    Result: 64-char hex string
    ↓
[Step 7] ⭐ CHECK DUPLICATE
    ├─ Checksum NOT in DB?
    │  └─ isDuplicate = false
    │  └─ ACTION: Register version
    │
    └─ Checksum in DB?
       └─ isDuplicate = true
       └─ ACTION: Mark as duplicate
    ↓
[Step 8] Register Version Metadata
    ✓ Done!
```

---

## Real Example: 3 Uploads

### Upload 1: product_data_v1.json

```
Input: 7 products, Laptop @ $1,299.99

Step 1: Schema 'product_catalog' ✓ Found
Step 2: Data validation ✓ All valid
Step 3: Version = 1 (no previous uploads)
Step 4: Table = product_catalog_v1
Step 5: Ingest 7 rows to product_catalog_v1
Step 6: Checksum = a3f5d8e2c9b1e4f7...
Step 7: Check duplicate
        Query: SELECT * WHERE checksum='a3f5d8e2c9b1e4f7...'
        Result: NOT FOUND
        → isDuplicate = false
Step 8: Register v1 metadata
        version_number=1, table_name=product_catalog_v1

Result: ✓ Version 1 created
```

### Upload 2: product_data_v2.json (Modified)

```
Input: 9 products, Laptop @ $1,199.99 (DIFFERENT!)

Step 1: Schema 'product_catalog' ✓ Found
Step 2: Data validation ✓ All valid
Step 3: Version = 2 (1 previous upload, MAX=1 → 1+1=2)
Step 4: Table = product_catalog_v2 ← DIFFERENT TABLE!
Step 5: Ingest 9 rows to product_catalog_v2
Step 6: Checksum = def456a1b2c3d4e5... ← DIFFERENT!
Step 7: Check duplicate
        Query: SELECT * WHERE checksum='def456a1b2c3d4e5...'
        Result: NOT FOUND (different from v1)
        → isDuplicate = false
Step 8: Register v2 metadata
        version_number=2, table_name=product_catalog_v2

Result: ✓ Version 2 created (SEPARATE from v1)
```

### Upload 3: product_data_v2.json Again (SAME as Upload 2)

```
Input: 9 products, Laptop @ $1,199.99 (SAME AS UPLOAD 2!)

Step 1: Schema 'product_catalog' ✓ Found
Step 2: Data validation ✓ All valid
Step 3: Version = 3 (2 previous uploads, MAX=2 → 2+1=3)
Step 4: Table = product_catalog_v3
Step 5: [SKIPPED] Don't ingest yet
Step 6: Checksum = def456a1b2c3d4e5... ← SAME AS UPLOAD 2!
Step 7: ⭐ Check duplicate
        Query: SELECT * WHERE checksum='def456a1b2c3d4e5...'
        Result: ✓ FOUND (Version 2 has this checksum!)
        → isDuplicate = true
        → originalVersionId = 'v_def456'
Step 8: Register as duplicate
        isDuplicate=true, originalVersionId='v_def456'

Result: ✓ Duplicate detected! No new version created
```

---

## Key Insights

### 1. Version Numbers are Independent Per Schema
```
Schema A (sales):        Schema B (customers):
├─ Version 1            ├─ Version 1
├─ Version 2            ├─ Version 2
└─ Version 3            ├─ Version 3
                        └─ Version 4

Each schema has independent counter!
```

### 2. Checksums Enable Duplicate Detection
```
Same data uploaded twice
  → Same checksum
  → System detects duplicate
  → No new version created
  → Saves storage!

Different data uploaded
  → Different checksum
  → System recognizes new version
  → Creates new version, new table
  → Data preserved
```

### 3. Table Names Are Dynamic Per Version
```
Before (wrong):     After (correct):
├─ v1 only         ├─ v1, v2, v3 (separate tables)
└─ Data mixed      └─ Data isolated per version
```

### 4. No Merge Logic
```
Before: "Smart" merging (buggy)
  ├─ Append if new rows
  ├─ Create snapshot if modified
  └─ Complex, error-prone

After: Simple versioning
  ├─ Calculate version number
  ├─ Create table with version
  ├─ Ingest complete snapshot
  └─ Register metadata
```

---

## Verification: How to Confirm It Works

### Check 1: Verify Version Numbers
```sql
SELECT version_number FROM data_uploads 
WHERE schema_id = 'product_schema' 
ORDER BY version_number;

Expected: 1, 2, 3 (consecutive, no gaps)
```

### Check 2: Verify Table Names
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name LIKE 'product_catalog_v%' 
ORDER BY table_name;

Expected: product_catalog_v1, product_catalog_v2, product_catalog_v3
```

### Check 3: Verify Checksums Are Different
```sql
SELECT version_number, SUBSTR(checksum, 1, 10) as checksum_start
FROM data_versions 
WHERE schema_id = 'product_schema'
ORDER BY version_number;

Expected: 
version_number | checksum_start
1              | a3f5d8e2c9
2              | def456a1b2  ← DIFFERENT!
3              | ghi789jkl0  ← DIFFERENT!
```

### Check 4: Verify Data Isolation
```sql
SELECT COUNT(*) FROM product_catalog_v1; -- 7
SELECT COUNT(*) FROM product_catalog_v2; -- 9
SELECT COUNT(*) FROM product_catalog_v3; -- 6

Expected: Different counts, no mixing
```

---

## Conclusion

The checking logic is **simple yet powerful**:
1. ✅ **Calculate version number** based on previous uploads
2. ✅ **Create unique table** for each version
3. ✅ **Calculate checksum** to identify duplicates
4. ✅ **Query database** to detect if checksum exists
5. ✅ **Make decision**: new version or duplicate?
6. ✅ **Register metadata** with all information

**Result:** Clean, isolated, comparable versions (v1, v2, v3) that users can select from!
