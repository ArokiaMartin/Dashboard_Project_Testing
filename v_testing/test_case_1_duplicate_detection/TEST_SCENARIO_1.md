# Test Case 1: Duplicate Detection

## Objective
Verify that uploading identical data is detected as a duplicate and the existing version is reused without re-ingestion.

## Prerequisites
- Backend running on http://localhost:8080
- Database with schemas table created
- Test data files available

## Test Scenario

### Phase 1: Initial Setup

**Step 1**: Create Schema
```bash
SCHEMA_ID="customer_schema_001"

curl -X POST http://localhost:8080/api/schemas/upload \
  -H "Content-Type: application/json" \
  -d '{
    "id": "'$SCHEMA_ID'",
    "schemaName": "customer_data",
    "description": "Customer information",
    "fields": [
      {"fieldName": "id", "fieldType": "INTEGER", "isRequired": true},
      {"fieldName": "name", "fieldType": "STRING", "isRequired": true},
      {"fieldName": "email", "fieldType": "STRING", "isRequired": false}
    ]
  }'
```

**Expected Response**:
```json
{
  "id": "customer_schema_001",
  "schemaName": "customer_data",
  "status": "CREATED",
  "message": "Schema created successfully"
}
```

### Phase 2: First Upload

**Step 2**: Read and Calculate Checksum
```bash
DATA_FILE="../sample_data/customer_data.json"
CHECKSUM=$(cat $DATA_FILE | sha256sum | cut -d' ' -f1)
echo "Checksum: $CHECKSUM"
```

**Step 3**: Check for Duplicates (Should be None)
```bash
curl -X POST http://localhost:8080/api/data/versions/check-duplicate \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"customer_schema_001\",
    \"checksum\": \"$CHECKSUM\"
  }"
```

**Expected Response**:
```json
{
  "isDuplicate": false,
  "existingVersion": null,
  "newChecksum": "abc123def456..."
}
```

**Step 4**: Upload Data
```bash
curl -X POST http://localhost:8080/api/data/ingest-with-schema \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"customer_schema_001\",
    \"tableName\": \"customer_data_v1\",
    \"data\": $(cat $DATA_FILE),
    \"userId\": \"test_user_001\",
    \"skipValidation\": false
  }"
```

**Expected Response**:
```json
{
  "uploadId": "upload_001",
  "tableName": "customer_data_v1",
  "rowsInserted": 100,
  "columnCount": 3,
  "status": "SUCCESS",
  "message": "Successfully ingested 100 rows"
}
```

**Step 5**: Register Version
```bash
curl -X POST http://localhost:8080/api/data/versions/register \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"customer_schema_001\",
    \"schemaName\": \"customer_data\",
    \"tableName\": \"customer_data_v1\",
    \"checksum\": \"$CHECKSUM\",
    \"rowCount\": 100,
    \"fileName\": \"customer_data.json\",
    \"isDuplicate\": false,
    \"originalVersionId\": null,
    \"createdBy\": \"test_user_001\"
  }"
```

**Expected Response**:
```json
{
  "versionId": "v_abc12345",
  "schemaId": "customer_schema_001",
  "schemaName": "customer_data",
  "tableName": "customer_data_v1",
  "checksum": "abc123def456...",
  "rowCount": 100,
  "uploadedAt": "2026-07-13T10:15:30",
  "fileName": "customer_data.json",
  "versionNumber": 1,
  "isDuplicate": false,
  "originalVersionId": null,
  "createdBy": "test_user_001"
}
```

**Record**: 
- Version ID: v_abc12345
- Version Number: 1
- Checksum: abc123def456...

### Phase 3: Duplicate Upload

**Step 6**: Check for Duplicates (Should Find Match)
```bash
# Use same data file - same checksum
curl -X POST http://localhost:8080/api/data/versions/check-duplicate \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"customer_schema_001\",
    \"checksum\": \"$CHECKSUM\"
  }"
```

**Expected Response** (Duplicate Found!):
```json
{
  "isDuplicate": true,
  "existingVersion": {
    "versionId": "v_abc12345",
    "versionNumber": 1,
    "checksum": "abc123def456...",
    "rowCount": 100,
    "uploadedAt": "2026-07-13T10:15:30",
    "fileName": "customer_data.json",
    "isDuplicate": false,
    "originalVersionId": null,
    "createdBy": "test_user_001"
  },
  "newChecksum": "abc123def456..."
}
```

**Step 7**: DO NOT Ingest (Reuse Existing Version)
```
Based on isDuplicate=true response:
- Skip ingest step
- Use existing versionId: v_abc12345
- Register as duplicate
```

**Step 8**: Register as Duplicate
```bash
curl -X POST http://localhost:8080/api/data/versions/register \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"customer_schema_001\",
    \"schemaName\": \"customer_data\",
    \"tableName\": \"customer_data_v1\",
    \"checksum\": \"$CHECKSUM\",
    \"rowCount\": 100,
    \"fileName\": \"customer_data.json\",
    \"isDuplicate\": true,
    \"originalVersionId\": \"v_abc12345\",
    \"createdBy\": \"test_user_001\"
  }"
```

**Expected Response**:
```json
{
  "versionId": "v_xyz67890",
  "schemaId": "customer_schema_001",
  "versionNumber": 2,
  "isDuplicate": true,
  "originalVersionId": "v_abc12345",
  "message": "This is a duplicate of version 1"
}
```

### Phase 4: Verification

**Step 9**: Get All Versions
```bash
curl http://localhost:8080/api/data/versions/schema/customer_schema_001
```

**Expected Response** (2 Versions, Same Data):
```json
[
  {
    "versionId": "v_abc12345",
    "versionNumber": 1,
    "isDuplicate": false,
    "rowCount": 100,
    "checksum": "abc123def456..."
  },
  {
    "versionId": "v_xyz67890",
    "versionNumber": 2,
    "isDuplicate": true,
    "originalVersionId": "v_abc12345",
    "rowCount": 100,
    "checksum": "abc123def456..."
  }
]
```

---

## Verification Points

✅ **Duplicate Detection**
- [ ] First upload creates version 1
- [ ] Second upload checksum matches exactly
- [ ] Duplicate flag is detected correctly
- [ ] Existing version returned in response

✅ **No Re-ingestion**
- [ ] Table not modified on duplicate
- [ ] Row count unchanged
- [ ] No additional data insertion
- [ ] Same upload_id reused

✅ **Version Metadata**
- [ ] Both versions have same checksum
- [ ] Version 2 marked as isDuplicate=true
- [ ] Version 2 originalVersionId points to v1
- [ ] Filenames match

✅ **Database State**
- [ ] Only one physical data copy
- [ ] Two version records created
- [ ] Checksum index populated
- [ ] Foreign key relationships correct

---

## Success Criteria

**PASS** if:
1. ✅ First upload succeeds, version 1 created
2. ✅ Duplicate detected on second upload
3. ✅ No re-ingestion occurs (rowsInserted = 0)
4. ✅ Both versions have identical checksum
5. ✅ isDuplicate flag = true for v2
6. ✅ originalVersionId points to v1

**FAIL** if:
- ❌ Duplicate not detected
- ❌ Second ingest occurs (rowsInserted > 0)
- ❌ Different checksums returned
- ❌ Version number increments without duplicate flag
- ❌ Database has duplicate data

---

## Expected Outcomes

### Success Case
```
Upload 1: customer_data.json
├─ Status: SUCCESS
├─ Version: 1
├─ Rows: 100
└─ Checksum: abc123def456...

Upload 2: customer_data.json (same)
├─ Status: DUPLICATE_DETECTED
├─ Version: 2 (isDuplicate=true)
├─ Rows: 0 (no re-ingest)
├─ Checksum: abc123def456... (same)
└─ Original: v_abc12345
```

### Failure Case (No Duplicate Detection)
```
Upload 2: Would create Version 2 with different checksum
├─ Status: SUCCESS
├─ Version: 2
├─ Rows: 100 (re-ingested!)
└─ Checksum: different...
```

---

## Troubleshooting

### Issue: Duplicate not detected
**Cause**: Checksum mismatch
**Solution**: 
- Verify same file uploaded
- Check for encoding differences
- Confirm SHA-256 calculation

### Issue: Version not created
**Cause**: Schema doesn't exist
**Solution**:
- Verify schemaId correct
- Check schema creation successful
- Review database for schema record

### Issue: Different checksums same file
**Cause**: Content variation (whitespace, formatting)
**Solution**:
- Normalize JSON format
- Remove trailing newlines
- Use canonical JSON representation

---

## Files Used

- **Schema**: `../sample_data/customer_schema.json`
- **Data**: `../sample_data/customer_data.json` (same file, 2x)

## Time Estimate

- Setup: 5 minutes
- Testing: 10 minutes
- Verification: 5 minutes
- **Total**: ~20 minutes

---

**Test Case 1 Status**: [PASS / FAIL]  
**Tester**: _______________  
**Date**: _______________  
**Notes**: _______________
