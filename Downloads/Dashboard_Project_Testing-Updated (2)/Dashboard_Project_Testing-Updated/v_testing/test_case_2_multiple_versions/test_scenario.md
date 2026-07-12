# Test Case 2: Multiple Versions

## Objective
Verify that multiple versions of the same schema are numbered sequentially (v1, v2, v3...) and each has a unique checksum.

## Prerequisites
- Backend running on http://localhost:8080
- Database with schemas table created
- Test data files available
- Test Case 1 (Duplicate Detection) preferably completed first

## Test Scenario

### Phase 1: Initial Setup

**Step 1**: Create Schema
```bash
SCHEMA_ID="version_test_schema"

curl -X POST http://localhost:8080/api/schemas/upload \
  -H "Content-Type: application/json" \
  -d '{
    "id": "'$SCHEMA_ID'",
    "schemaName": "customer_data",
    "description": "Customer information for version testing",
    "fields": [
      {"fieldName": "id", "fieldType": "INTEGER", "isRequired": true},
      {"fieldName": "name", "fieldType": "STRING", "isRequired": true},
      {"fieldName": "email", "fieldType": "STRING", "isRequired": false},
      {"fieldName": "amount", "fieldType": "NUMERIC", "isRequired": false}
    ]
  }'
```

**Expected Response**:
```json
{
  "id": "version_test_schema",
  "schemaName": "customer_data",
  "status": "CREATED"
}
```

### Phase 2: Upload Version 1

**Step 2**: Upload First Dataset
```bash
# Use original customer data
DATA_FILE_V1="../sample_data/customer_data.json"
CHECKSUM_V1=$(cat $DATA_FILE_V1 | sha256sum | cut -d' ' -f1)
echo "V1 Checksum: $CHECKSUM_V1"

curl -X POST http://localhost:8080/api/data/ingest-with-schema \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"version_test_schema\",
    \"tableName\": \"customer_data_v1\",
    \"data\": $(cat $DATA_FILE_V1),
    \"userId\": \"test_user_001\",
    \"skipValidation\": false
  }"
```

**Expected Response**:
```json
{
  "uploadId": "upload_v1",
  "tableName": "customer_data_v1",
  "rowsInserted": 100,
  "status": "SUCCESS",
  "message": "Successfully ingested 100 rows"
}
```

**Step 3**: Register Version 1
```bash
curl -X POST http://localhost:8080/api/data/versions/register \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"version_test_schema\",
    \"schemaName\": \"customer_data\",
    \"tableName\": \"customer_data_v1\",
    \"checksum\": \"$CHECKSUM_V1\",
    \"rowCount\": 100,
    \"fileName\": \"customer_data_v1.json\",
    \"isDuplicate\": false,
    \"originalVersionId\": null,
    \"createdBy\": \"test_user_001\"
  }"
```

**Expected Response**:
```json
{
  "versionId": "v_abc12345",
  "versionNumber": 1,
  "checksum": "CHECKSUM_V1_VALUE",
  "rowCount": 100,
  "isDuplicate": false
}
```

**Record**: Version 1 Created
- Version ID: v_abc12345
- Version Number: 1
- Checksum: CHECKSUM_V1_VALUE
- Rows: 100

### Phase 3: Upload Version 2 (Modified Data)

**Step 4**: Create Modified Data for V2
```bash
# Create modified version by adding/changing records
# Option 1: Copy and modify existing
cp ../sample_data/customer_data.json version_2_data.json

# Option 2: Create new data with different records
cat > version_2_data.json << 'EOF'
[
  {"id": 1, "name": "John Doe", "email": "john@example.com", "amount": 1000},
  {"id": 2, "name": "Jane Smith", "email": "jane@example.com", "amount": 2500},
  {"id": 3, "name": "Bob Johnson", "email": "bob@example.com", "amount": 3000},
  {"id": 4, "name": "Alice Brown", "email": "alice@example.com", "amount": 1500},
  {"id": 5, "name": "Charlie Wilson", "email": "charlie@example.com", "amount": 2000},
  {"id": 101, "name": "Diana Lee", "email": "diana@example.com", "amount": 2200},
  {"id": 102, "name": "Edward Davis", "email": "edward@example.com", "amount": 1800},
  {"id": 103, "name": "Fiona Martinez", "email": "fiona@example.com", "amount": 2800},
  {"id": 104, "name": "George Taylor", "email": "george@example.com", "amount": 3200},
  {"id": 105, "name": "Hannah Anderson", "email": "hannah@example.com", "amount": 2100}
]
EOF

CHECKSUM_V2=$(cat version_2_data.json | sha256sum | cut -d' ' -f1)
echo "V2 Checksum: $CHECKSUM_V2"
```

**Step 5**: Check Duplicate (Should NOT match V1)
```bash
curl -X POST http://localhost:8080/api/data/versions/check-duplicate \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"version_test_schema\",
    \"checksum\": \"$CHECKSUM_V2\"
  }"
```

**Expected Response**:
```json
{
  "isDuplicate": false,
  "existingVersion": null,
  "newChecksum": "CHECKSUM_V2_VALUE"
}
```

**Step 6**: Upload Version 2 Data
```bash
curl -X POST http://localhost:8080/api/data/ingest-with-schema \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"version_test_schema\",
    \"tableName\": \"customer_data_v1\",
    \"data\": $(cat version_2_data.json),
    \"userId\": \"test_user_001\",
    \"skipValidation\": false
  }"
```

**Expected Response**:
```json
{
  "uploadId": "upload_v2",
  "tableName": "customer_data_v1",
  "rowsInserted": 10,
  "status": "SUCCESS",
  "message": "Successfully ingested 10 rows"
}
```

**Step 7**: Register Version 2
```bash
curl -X POST http://localhost:8080/api/data/versions/register \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"version_test_schema\",
    \"schemaName\": \"customer_data\",
    \"tableName\": \"customer_data_v1\",
    \"checksum\": \"$CHECKSUM_V2\",
    \"rowCount\": 110,
    \"fileName\": \"customer_data_v2.json\",
    \"isDuplicate\": false,
    \"originalVersionId\": null,
    \"createdBy\": \"test_user_001\"
  }"
```

**Expected Response**:
```json
{
  "versionId": "v_def67890",
  "versionNumber": 2,
  "checksum": "CHECKSUM_V2_VALUE",
  "rowCount": 110,
  "isDuplicate": false
}
```

**Record**: Version 2 Created
- Version ID: v_def67890
- Version Number: 2
- Checksum: CHECKSUM_V2_VALUE (Different from V1!)
- Rows: 110

### Phase 4: Upload Version 3 (Different Data)

**Step 8**: Create V3 Data
```bash
cat > version_3_data.json << 'EOF'
[
  {"id": 201, "name": "Isabella Garcia", "email": "isabella@example.com", "amount": 4000},
  {"id": 202, "name": "James Rodriguez", "email": "james@example.com", "amount": 3500},
  {"id": 203, "name": "Karen White", "email": "karen@example.com", "amount": 2700},
  {"id": 204, "name": "Leonardo Martin", "email": "leonardo@example.com", "amount": 3100},
  {"id": 205, "name": "Maria Lopez", "email": "maria@example.com", "amount": 2900}
]
EOF

CHECKSUM_V3=$(cat version_3_data.json | sha256sum | cut -d' ' -f1)
echo "V3 Checksum: $CHECKSUM_V3"
```

**Step 9**: Check Duplicate (Should NOT match V1 or V2)
```bash
curl -X POST http://localhost:8080/api/data/versions/check-duplicate \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"version_test_schema\",
    \"checksum\": \"$CHECKSUM_V3\"
  }"
```

**Expected Response**:
```json
{
  "isDuplicate": false,
  "existingVersion": null,
  "newChecksum": "CHECKSUM_V3_VALUE"
}
```

**Step 10**: Upload Version 3 Data
```bash
curl -X POST http://localhost:8080/api/data/ingest-with-schema \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"version_test_schema\",
    \"tableName\": \"customer_data_v1\",
    \"data\": $(cat version_3_data.json),
    \"userId\": \"test_user_001\",
    \"skipValidation\": false
  }"
```

**Expected Response**:
```json
{
  "uploadId": "upload_v3",
  "tableName": "customer_data_v1",
  "rowsInserted": 5,
  "status": "SUCCESS"
}
```

**Step 11**: Register Version 3
```bash
curl -X POST http://localhost:8080/api/data/versions/register \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"version_test_schema\",
    \"schemaName\": \"customer_data\",
    \"tableName\": \"customer_data_v1\",
    \"checksum\": \"$CHECKSUM_V3\",
    \"rowCount\": 115,
    \"fileName\": \"customer_data_v3.json\",
    \"isDuplicate\": false,
    \"originalVersionId\": null,
    \"createdBy\": \"test_user_001\"
  }"
```

**Expected Response**:
```json
{
  "versionId": "v_ghi13579",
  "versionNumber": 3,
  "checksum": "CHECKSUM_V3_VALUE",
  "rowCount": 115,
  "isDuplicate": false
}
```

**Record**: Version 3 Created
- Version ID: v_ghi13579
- Version Number: 3
- Checksum: CHECKSUM_V3_VALUE (Different from V1 & V2!)
- Rows: 115

### Phase 5: Verification

**Step 12**: Get All Versions
```bash
curl http://localhost:8080/api/data/versions/schema/version_test_schema
```

**Expected Response** (3 Versions, Unique Checksums):
```json
[
  {
    "versionId": "v_abc12345",
    "versionNumber": 1,
    "checksum": "CHECKSUM_V1",
    "rowCount": 100,
    "isDuplicate": false
  },
  {
    "versionId": "v_def67890",
    "versionNumber": 2,
    "checksum": "CHECKSUM_V2",
    "rowCount": 110,
    "isDuplicate": false
  },
  {
    "versionId": "v_ghi13579",
    "versionNumber": 3,
    "checksum": "CHECKSUM_V3",
    "rowCount": 115,
    "isDuplicate": false
  }
]
```

---

## Verification Points

✅ **Version Numbering**
- [ ] Version 1 created with number 1
- [ ] Version 2 created with number 2 (not 1)
- [ ] Version 3 created with number 3 (not 1 or 2)
- [ ] Numbers are sequential (1, 2, 3)

✅ **Unique Checksums**
- [ ] V1 checksum: CHECKSUM_V1
- [ ] V2 checksum: CHECKSUM_V2 (DIFFERENT from V1)
- [ ] V3 checksum: CHECKSUM_V3 (DIFFERENT from V1 & V2)
- [ ] All three are unique

✅ **Version Metadata**
- [ ] Each version has unique ID
- [ ] Row counts accurate (100, 110, 115)
- [ ] isDuplicate = false for all
- [ ] originalVersionId = null for all

✅ **Database State**
- [ ] 3 version records created
- [ ] All checksums in database
- [ ] Version numbers correct
- [ ] Foreign key relationships valid

---

## Success Criteria

**PASS** if:
1. ✅ 3 versions created (v1, v2, v3)
2. ✅ Version numbers are 1, 2, 3
3. ✅ All checksums unique
4. ✅ No duplicates detected between versions
5. ✅ Row counts correct for each
6. ✅ Version list returns all 3 versions ordered

**FAIL** if:
- ❌ Wrong version numbers (e.g., v1, v1, v2)
- ❌ Same checksum for different data
- ❌ Versions not in order
- ❌ Missing any version records
- ❌ Wrong row counts

---

## Expected Outcomes

### Success Case
```
Version 1: customer_data_v1.json
├─ Version Number: 1
├─ Checksum: abc123...
├─ Rows: 100
└─ Status: SUCCESS

Version 2: customer_data_v2.json (Different Data)
├─ Version Number: 2
├─ Checksum: def456... (DIFFERENT!)
├─ Rows: 110
└─ Status: SUCCESS

Version 3: customer_data_v3.json (Different Data)
├─ Version Number: 3
├─ Checksum: ghi789... (DIFFERENT!)
├─ Rows: 115
└─ Status: SUCCESS
```

### Failure Case (No Sequential Numbering)
```
Would result in duplicate version numbers or wrong checksums
```

---

## Files Used

- **Schema**: `../sample_data/customer_schema.json`
- **Data V1**: `../sample_data/customer_data.json`
- **Data V2**: `version_2_data.json` (created during test)
- **Data V3**: `version_3_data.json` (created during test)

## Time Estimate

- Setup: 5 minutes
- Version 1: 5 minutes
- Version 2: 10 minutes
- Version 3: 10 minutes
- Verification: 5 minutes
- **Total**: ~30 minutes

---

**Test Case 2 Status**: [PASS / FAIL]  
**Tester**: _______________  
**Date**: _______________  
**Notes**: _______________
