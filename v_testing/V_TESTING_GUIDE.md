# Data Versioning (v_testing) - Complete Testing Guide

## Overview
This folder contains test cases and data for validating the data versioning system with checksum-based deduplication.

## Folder Structure

```
v_testing/
├── sample_data/                           # All test data files
│   ├── clinic_data.json & clinic_schema.json
│   ├── customer_data.json & customer_schema.json
│   ├── marketing_data.json & marketing_schema.json
│   ├── multi_table_data.json & multi_table_schema.json
│   └── sales_data.json & sales_schema.json
│
├── test_case_1_duplicate_detection/       # Test duplicate detection
│   ├── primary_upload/                    # First upload
│   ├── duplicate_upload/                  # Identical second upload
│   └── test_scenario.md
│
├── test_case_2_multiple_versions/         # Test version numbering
│   ├── version_1/                         # Initial data
│   ├── version_2/                         # Modified data
│   ├── version_3/                         # Different data
│   └── test_scenario.md
│
├── test_case_3_different_schemas/         # Test schema isolation
│   ├── schema_a/                          # Customer schema
│   ├── schema_b/                          # Sales schema
│   └── test_scenario.md
│
├── test_case_4_version_comparison/        # Test version overlay
│   ├── primary_version/                   # Main version
│   ├── compare_version/                   # Compare against
│   └── test_scenario.md
│
└── results/                               # Test execution logs
    ├── checksums.log
    ├── api_responses.log
    └── test_summary.txt
```

## Available Test Data

### 1. Customer Data
**Files**: `sample_data/customer_data.json`, `sample_data/customer_schema.json`
- **Schema**: Customer information with fields like name, email, address
- **Records**: Multiple customer records
- **Use Case**: Testing user/customer data versioning

### 2. Sales Data
**Files**: `sample_data/sales_data.json`, `sample_data/sales_schema.json`
- **Schema**: Sales transactions with amount, date, customer
- **Records**: Sales order records
- **Use Case**: Testing transaction data versioning

### 3. Clinic Data
**Files**: `sample_data/clinic_data.json`, `sample_data/clinic_schema.json`
- **Schema**: Patient and appointment records
- **Records**: Healthcare data
- **Use Case**: Testing medical data versioning

### 4. Marketing Data
**Files**: `sample_data/marketing_data.json`, `sample_data/marketing_schema.json`
- **Schema**: Campaign and lead information
- **Records**: Marketing campaign data
- **Use Case**: Testing campaign data versioning

### 5. Multi-Table Data
**Files**: `sample_data/multi_table_data.json`, `sample_data/multi_table_schema.json`
- **Schema**: Complex nested structure with multiple tables
- **Records**: Hierarchical data
- **Use Case**: Testing complex nested data versioning

---

## Test Cases

### Test Case 1: Duplicate Detection ✓

**Purpose**: Verify that uploading identical data is detected and reused

**Steps**:
```
1. Upload customer_schema.json
2. Upload customer_data.json
3. Record checksum and version number (should be v1)
4. Upload same customer_data.json again
5. Verify: Duplicate detected, version reused
```

**Expected Results**:
```
First Upload:
- Status: SUCCESS
- Version: 1
- Checksum: abc123def456...
- Rows Ingested: [count]
- Message: "Successfully ingested X rows"

Second Upload (Same Data):
- Status: DUPLICATE_DETECTED
- Version: 1 (reused)
- Message: "Data matches version 1. Using existing version."
- Rows Ingested: 0 (no re-ingest)
```

**Files to Use**:
- `sample_data/customer_schema.json`
- `sample_data/customer_data.json` (upload twice)

---

### Test Case 2: Multiple Versions ✓

**Purpose**: Verify version numbering and sequential versioning

**Steps**:
```
1. Upload schema
2. Upload data version 1
3. Modify data (add/change records)
4. Upload data version 2
5. Modify data differently
6. Upload data version 3
7. Verify: Each version has unique number
```

**Expected Results**:
```
Upload 1:
- Version Number: 1
- Checksum: hash1

Upload 2 (Different Data):
- Version Number: 2
- Checksum: hash2
- Previous Version: 1

Upload 3 (Different Data):
- Version Number: 3
- Checksum: hash3
- Previous Version: 2
```

**Files to Use**:
- Primary: `sample_data/customer_schema.json`
- Data Versions: `sample_data/customer_data.json` (create variations)

---

### Test Case 3: Different Schemas ✓

**Purpose**: Verify that versions are tracked per-schema independently

**Steps**:
```
1. Upload customer schema + data
2. Upload sales schema + data
3. Verify customer version = v1
4. Verify sales version = v1 (independent)
5. Upload customer data again
6. Verify customer version = v2
7. Verify sales version still = v1
```

**Expected Results**:
```
Customer Schema:
- Version 1: customer_data.json (checksum: xxx)
- Version 2: customer_data_modified.json (checksum: yyy)

Sales Schema (independent):
- Version 1: sales_data.json (checksum: aaa)
- Version 1 still exists (no v2 created)
```

**Files to Use**:
- Customer: `sample_data/customer_schema.json` + `customer_data.json`
- Sales: `sample_data/sales_schema.json` + `sales_data.json`

---

### Test Case 4: Version Comparison ✓

**Purpose**: Verify version comparison and overlay functionality

**Steps**:
```
1. Upload schema and version 1 data
2. Upload modified data as version 2
3. In builder, select version 1 as primary
4. Select version 2 as compare
5. View chart with both versions overlaid
6. Verify data points from both versions visible
```

**Expected Results**:
```
Primary Version: v1
Compare Version: v2

Chart Display:
- v1 data: Series 1 (color: blue)
- v2 data: Series 2 (color: orange)
- Both visible on same chart
- Allows comparison of changes
```

**Files to Use**:
- Primary: Create v1 data
- Compare: Create v2 data (modified version)

---

## Running the Tests

### Manual Testing Flow

#### Step 1: Upload Schema
```bash
curl -X POST http://localhost:8080/api/schemas/upload \
  -H "Content-Type: application/json" \
  -d @sample_data/customer_schema.json
```

#### Step 2: Check Duplicate (Before Upload)
```bash
# Calculate checksum first
CHECKSUM=$(cat sample_data/customer_data.json | sha256sum | cut -d' ' -f1)

curl -X POST http://localhost:8080/api/data/versions/check-duplicate \
  -H "Content-Type: application/json" \
  -d "{\"schemaId\":\"schema_123\",\"checksum\":\"$CHECKSUM\"}"
```

#### Step 3: Upload Data
```bash
curl -X POST http://localhost:8080/api/data/ingest-with-schema \
  -H "Content-Type: application/json" \
  -d @sample_data/customer_data.json
```

#### Step 4: Register Version
```bash
curl -X POST http://localhost:8080/api/data/versions/register \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\":\"schema_123\",
    \"schemaName\":\"customer_data\",
    \"tableName\":\"customer_data_v1\",
    \"checksum\":\"$CHECKSUM\",
    \"rowCount\":100,
    \"fileName\":\"customer_data.json\",
    \"isDuplicate\":false,
    \"createdBy\":\"test_user\"
  }"
```

#### Step 5: Get All Versions
```bash
curl http://localhost:8080/api/data/versions/schema/schema_123
```

#### Step 6: Upload Duplicate
```bash
curl -X POST http://localhost:8080/api/data/ingest-with-schema \
  -H "Content-Type: application/json" \
  -d @sample_data/customer_data.json
```

Verify: Returns UNCHANGED or DUPLICATE status

---

## Test Data Specifications

### Customer Data
```json
{
  "schema": "customer",
  "records": [
    { "id": 1, "name": "John Doe", "email": "john@example.com" },
    { "id": 2, "name": "Jane Smith", "email": "jane@example.com" },
    ...
  ]
}
```
- **Size**: Small (~10KB)
- **Records**: Multiple customer entries
- **Use Case**: Quick testing

### Sales Data
```json
{
  "schema": "sales",
  "records": [
    { "id": 1, "amount": 1000, "date": "2026-07-01", "customerId": 1 },
    { "id": 2, "amount": 2500, "date": "2026-07-02", "customerId": 2 },
    ...
  ]
}
```
- **Size**: Medium (~25KB)
- **Records**: Sales transactions
- **Use Case**: Performance testing

### Multi-Table Data
```json
{
  "orders": [
    { "id": 1, "total": 150, "items": [...] }
  ],
  "customers": [
    { "id": 1, "name": "John" }
  ]
}
```
- **Size**: Large (~50KB)
- **Structure**: Nested/hierarchical
- **Use Case**: Complex data testing

---

## Expected Checksum Values

### Customer Data
```
Simple Hash (Frontend):   a3f5d8e2
SHA-256 (Backend):        a3f5d8e2b9c1d4e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9
```

### Sales Data
```
Simple Hash (Frontend):   e7a2f1b3
SHA-256 (Backend):        e7a2f1b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0
```

### Multi-Table Data
```
Simple Hash (Frontend):   b4c9d2e1
SHA-256 (Backend):        b4c9d2e1f2g3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8w9x0y1z2a3b4c5d6e7f8
```

---

## Verification Checklist

### ✓ Test Case 1: Duplicate Detection
- [ ] First upload creates version 1
- [ ] Second identical upload detected as duplicate
- [ ] Same checksum returned
- [ ] Version ID reused
- [ ] No additional rows ingested

### ✓ Test Case 2: Multiple Versions
- [ ] Version numbers increment sequentially
- [ ] Each version has unique checksum
- [ ] Version list shows all versions
- [ ] Oldest to newest ordering correct
- [ ] Row counts correct for each version

### ✓ Test Case 3: Schema Isolation
- [ ] Different schemas have independent versions
- [ ] Customer v2 doesn't affect Sales v1
- [ ] Each schema starts at v1
- [ ] Cross-schema queries isolated

### ✓ Test Case 4: Version Comparison
- [ ] Both versions load in builder
- [ ] Overlay works on compatible charts
- [ ] Data points visible for both
- [ ] Comparison version optional

---

## Troubleshooting

### Checksum Mismatch
**Issue**: Frontend checksum doesn't match backend
**Solution**: 
- Ensure same data content
- Check for trailing newlines
- Verify JSON formatting identical

### Duplicate Not Detected
**Issue**: Identical data not recognized as duplicate
**Solution**:
- Check schemaId is correct
- Verify checksum matches exactly
- Check database table exists
- Review logs for errors

### Version Not Incrementing
**Issue**: Version number stays same
**Solution**:
- Ensure data is actually different
- Check for previous version in database
- Verify database transaction completed

### Comparison Overlay Not Working
**Issue**: Second version doesn't appear on chart
**Solution**:
- Verify both versions exist
- Check chart type compatible (not pie/table)
- Ensure version ID correct

---

## Success Criteria

✅ **All Tests Passing When**:
1. Duplicate detection works (identical uploads reused)
2. Versions number correctly (1, 2, 3...)
3. Schemas isolated (customer v1/v2, sales v1)
4. Comparison overlay displays both versions
5. All checksums consistent (frontend & backend)
6. No breaking changes to existing functionality

---

## Reporting Results

### Save Results to: `results/test_summary.txt`

```
Date: [date]
Time: [time]
Tester: [name]

Test Case 1: Duplicate Detection
  Status: PASS/FAIL
  Details: [any issues]

Test Case 2: Multiple Versions
  Status: PASS/FAIL
  Details: [any issues]

Test Case 3: Schema Isolation
  Status: PASS/FAIL
  Details: [any issues]

Test Case 4: Version Comparison
  Status: PASS/FAIL
  Details: [any issues]

Overall Result: PASS/FAIL
Notes: [any additional notes]
```

---

## Performance Benchmarks

Expected performance:
- **Checksum Calculation**: < 100ms
- **Duplicate Check**: < 50ms (indexed query)
- **Version Registration**: < 100ms
- **Version List Retrieval**: < 50ms
- **Total Upload Time**: < 500ms

---

## Files Reference

| File | Purpose | Size |
|------|---------|------|
| customer_data.json | Customer records | ~10KB |
| customer_schema.json | Customer schema | ~2KB |
| sales_data.json | Sales transactions | ~25KB |
| sales_schema.json | Sales schema | ~2KB |
| clinic_data.json | Healthcare data | ~15KB |
| clinic_schema.json | Healthcare schema | ~2KB |
| marketing_data.json | Campaign data | ~12KB |
| marketing_schema.json | Campaign schema | ~2KB |
| multi_table_data.json | Nested data | ~50KB |
| multi_table_schema.json | Complex schema | ~5KB |

---

## Next Steps

1. Run all 4 test cases
2. Document results in `results/test_summary.txt`
3. Fix any failing tests
4. Re-run failing tests
5. Mark as production-ready

---

**Ready to start testing!** 🚀
