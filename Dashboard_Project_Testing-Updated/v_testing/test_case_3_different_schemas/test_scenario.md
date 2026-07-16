# Test Case 3: Different Schemas

## Objective
Verify that different schemas maintain independent version numbers (each schema starts at v1 and increments separately).

## Prerequisites
- Backend running on http://localhost:8080
- Database with schemas table created
- Test data files available
- Test Cases 1 & 2 preferably completed first

## Test Scenario

### Phase 1: Setup Schema A (Customer)

**Step 1**: Create Customer Schema
```bash
SCHEMA_A_ID="customer_schema_001"

curl -X POST http://localhost:8080/api/schemas/upload \
  -H "Content-Type: application/json" \
  -d '{
    "id": "'$SCHEMA_A_ID'",
    "schemaName": "customer_data",
    "description": "Customer information schema",
    "fields": [
      {"fieldName": "id", "fieldType": "INTEGER", "isRequired": true},
      {"fieldName": "name", "fieldType": "STRING", "isRequired": true},
      {"fieldName": "email", "fieldType": "STRING", "isRequired": false}
    ]
  }'
```

**Step 2**: Upload Customer Data v1
```bash
CUST_DATA_V1="../sample_data/customer_data.json"
CUST_CHECKSUM_V1=$(cat $CUST_DATA_V1 | sha256sum | cut -d' ' -f1)
echo "Customer V1 Checksum: $CUST_CHECKSUM_V1"

curl -X POST http://localhost:8080/api/data/ingest-with-schema \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"$SCHEMA_A_ID\",
    \"tableName\": \"customer_data_v1\",
    \"data\": $(cat $CUST_DATA_V1),
    \"userId\": \"test_user_001\",
    \"skipValidation\": false
  }"
```

**Step 3**: Register Customer v1
```bash
curl -X POST http://localhost:8080/api/data/versions/register \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"$SCHEMA_A_ID\",
    \"schemaName\": \"customer_data\",
    \"tableName\": \"customer_data_v1\",
    \"checksum\": \"$CUST_CHECKSUM_V1\",
    \"rowCount\": 100,
    \"fileName\": \"customer_data.json\",
    \"isDuplicate\": false,
    \"originalVersionId\": null,
    \"createdBy\": \"test_user_001\"
  }"
```

**Record**: Customer Schema v1
- Schema ID: customer_schema_001
- Version: 1
- Checksum: CUST_CHECKSUM_V1
- Rows: 100

### Phase 2: Setup Schema B (Sales)

**Step 4**: Create Sales Schema (INDEPENDENT)
```bash
SCHEMA_B_ID="sales_schema_001"

curl -X POST http://localhost:8080/api/schemas/upload \
  -H "Content-Type: application/json" \
  -d '{
    "id": "'$SCHEMA_B_ID'",
    "schemaName": "sales_data",
    "description": "Sales transaction schema",
    "fields": [
      {"fieldName": "id", "fieldType": "INTEGER", "isRequired": true},
      {"fieldName": "amount", "fieldType": "NUMERIC", "isRequired": true},
      {"fieldName": "date", "fieldType": "DATE", "isRequired": false},
      {"fieldName": "customer_id", "fieldType": "INTEGER", "isRequired": false}
    ]
  }'
```

**Step 5**: Upload Sales Data v1
```bash
SALES_DATA_V1="../sample_data/sales_data.json"
SALES_CHECKSUM_V1=$(cat $SALES_DATA_V1 | sha256sum | cut -d' ' -f1)
echo "Sales V1 Checksum: $SALES_CHECKSUM_V1"

curl -X POST http://localhost:8080/api/data/ingest-with-schema \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"$SCHEMA_B_ID\",
    \"tableName\": \"sales_data_v1\",
    \"data\": $(cat $SALES_DATA_V1),
    \"userId\": \"test_user_001\",
    \"skipValidation\": false
  }"
```

**Step 6**: Register Sales v1
```bash
curl -X POST http://localhost:8080/api/data/versions/register \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"$SCHEMA_B_ID\",
    \"schemaName\": \"sales_data\",
    \"tableName\": \"sales_data_v1\",
    \"checksum\": \"$SALES_CHECKSUM_V1\",
    \"rowCount\": 500,
    \"fileName\": \"sales_data.json\",
    \"isDuplicate\": false,
    \"originalVersionId\": null,
    \"createdBy\": \"test_user_001\"
  }"
```

**Record**: Sales Schema v1
- Schema ID: sales_schema_001
- Version: 1 (INDEPENDENT from Customer!)
- Checksum: SALES_CHECKSUM_V1
- Rows: 500

### Phase 3: Verify Isolation So Far

**Step 7**: Check Customer Versions
```bash
curl http://localhost:8080/api/data/versions/schema/$SCHEMA_A_ID
```

**Expected Response**:
```json
[
  {
    "versionId": "v_abc...",
    "schemaId": "customer_schema_001",
    "versionNumber": 1,
    "rowCount": 100
  }
]
```

**Step 8**: Check Sales Versions
```bash
curl http://localhost:8080/api/data/versions/schema/$SCHEMA_B_ID
```

**Expected Response**:
```json
[
  {
    "versionId": "v_def...",
    "schemaId": "sales_schema_001",
    "versionNumber": 1,
    "rowCount": 500
  }
]
```

**Key Point**: Both have version 1, but DIFFERENT schema IDs

### Phase 4: Upload Customer v2 (Should NOT affect Sales)

**Step 9**: Create Customer Data v2
```bash
cat > customer_data_v2.json << 'EOF'
[
  {"id": 101, "name": "New Customer 1", "email": "new1@example.com"},
  {"id": 102, "name": "New Customer 2", "email": "new2@example.com"},
  {"id": 103, "name": "New Customer 3", "email": "new3@example.com"}
]
EOF

CUST_CHECKSUM_V2=$(cat customer_data_v2.json | sha256sum | cut -d' ' -f1)
echo "Customer V2 Checksum: $CUST_CHECKSUM_V2"
```

**Step 10**: Upload Customer v2
```bash
curl -X POST http://localhost:8080/api/data/ingest-with-schema \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"$SCHEMA_A_ID\",
    \"tableName\": \"customer_data_v1\",
    \"data\": $(cat customer_data_v2.json),
    \"userId\": \"test_user_001\",
    \"skipValidation\": false
  }"
```

**Step 11**: Register Customer v2
```bash
curl -X POST http://localhost:8080/api/data/versions/register \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"$SCHEMA_A_ID\",
    \"schemaName\": \"customer_data\",
    \"tableName\": \"customer_data_v1\",
    \"checksum\": \"$CUST_CHECKSUM_V2\",
    \"rowCount\": 103,
    \"fileName\": \"customer_data_v2.json\",
    \"isDuplicate\": false,
    \"originalVersionId\": null,
    \"createdBy\": \"test_user_001\"
  }"
```

**Record**: Customer Schema v2 Created
- Schema ID: customer_schema_001
- Version: 2 (incremented from 1!)
- Rows: 103

### Phase 5: Critical Verification - Schema Isolation

**Step 12**: Check Customer Versions (Should be v1, v2)
```bash
curl http://localhost:8080/api/data/versions/schema/$SCHEMA_A_ID
```

**Expected Response**:
```json
[
  {
    "versionId": "v_abc...",
    "schemaId": "customer_schema_001",
    "versionNumber": 1,
    "rowCount": 100
  },
  {
    "versionId": "v_xyz...",
    "schemaId": "customer_schema_001",
    "versionNumber": 2,
    "rowCount": 103
  }
]
```

**Step 13**: Check Sales Versions (Should STILL be v1!)
```bash
curl http://localhost:8080/api/data/versions/schema/$SCHEMA_B_ID
```

**CRITICAL VERIFICATION**:
```json
[
  {
    "versionId": "v_def...",
    "schemaId": "sales_schema_001",
    "versionNumber": 1,
    "rowCount": 500
  }
]
```

**KEY POINT**: Sales still at version 1, NOT incremented to version 2!
This proves schema isolation is working.

### Phase 6: Add Third Schema (Clinic)

**Step 14**: Create Clinic Schema
```bash
SCHEMA_C_ID="clinic_schema_001"

curl -X POST http://localhost:8080/api/schemas/upload \
  -H "Content-Type: application/json" \
  -d '{
    "id": "'$SCHEMA_C_ID'",
    "schemaName": "clinic_data",
    "description": "Healthcare clinic schema",
    "fields": [
      {"fieldName": "id", "fieldType": "INTEGER", "isRequired": true},
      {"fieldName": "patient_name", "fieldType": "STRING", "isRequired": true},
      {"fieldName": "appointment_date", "fieldType": "DATE", "isRequired": false}
    ]
  }'
```

**Step 15**: Upload Clinic Data v1
```bash
CLINIC_DATA_V1="../sample_data/clinic_data.json"
CLINIC_CHECKSUM_V1=$(cat $CLINIC_DATA_V1 | sha256sum | cut -d' ' -f1)
echo "Clinic V1 Checksum: $CLINIC_CHECKSUM_V1"

curl -X POST http://localhost:8080/api/data/ingest-with-schema \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"$SCHEMA_C_ID\",
    \"tableName\": \"clinic_data_v1\",
    \"data\": $(cat $CLINIC_DATA_V1),
    \"userId\": \"test_user_001\",
    \"skipValidation\": false
  }"
```

**Step 16**: Register Clinic v1
```bash
curl -X POST http://localhost:8080/api/data/versions/register \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"$SCHEMA_C_ID\",
    \"schemaName\": \"clinic_data\",
    \"tableName\": \"clinic_data_v1\",
    \"checksum\": \"$CLINIC_CHECKSUM_V1\",
    \"rowCount\": 200,
    \"fileName\": \"clinic_data.json\",
    \"isDuplicate\": false,
    \"originalVersionId\": null,
    \"createdBy\": \"test_user_001\"
  }"
```

### Phase 7: Final Verification

**Step 17**: Verify All Three Schemas
```bash
echo "=== Customer Schema Versions ==="
curl http://localhost:8080/api/data/versions/schema/$SCHEMA_A_ID
echo -e "\n=== Sales Schema Versions ==="
curl http://localhost:8080/api/data/versions/schema/$SCHEMA_B_ID
echo -e "\n=== Clinic Schema Versions ==="
curl http://localhost:8080/api/data/versions/schema/$SCHEMA_C_ID
```

**Expected Complete Result**:
```
Customer Schema:
  Version 1 (v_abc...) - 100 rows
  Version 2 (v_xyz...) - 103 rows

Sales Schema:
  Version 1 (v_def...) - 500 rows

Clinic Schema:
  Version 1 (v_ghi...) - 200 rows
```

---

## Verification Points

✅ **Schema Isolation**
- [ ] Customer schema versions: 1, 2
- [ ] Sales schema versions: 1 (NOT 2!)
- [ ] Clinic schema versions: 1
- [ ] Each schema independent

✅ **Version Numbering**
- [ ] Customer: v1, v2 (incremented correctly)
- [ ] Sales: v1 (NOT affected by Customer v2)
- [ ] Clinic: v1 (starts at 1)

✅ **Schema IDs**
- [ ] Customer has schema_id: customer_schema_001
- [ ] Sales has schema_id: sales_schema_001
- [ ] Clinic has schema_id: clinic_schema_001
- [ ] All different, properly stored

✅ **Data Isolation**
- [ ] Customer data separate from Sales
- [ ] Sales data separate from Clinic
- [ ] No cross-schema interference

---

## Success Criteria

**PASS** if:
1. ✅ Customer has v1 and v2
2. ✅ Sales stays at v1 (NOT v2)
3. ✅ Clinic starts at v1
4. ✅ Each schema has independent counter
5. ✅ Schema IDs properly stored
6. ✅ No data interference between schemas

**FAIL** if:
- ❌ Sales incremented to v2 when Customer got v2
- ❌ Version counters not independent
- ❌ Schema IDs mixed up
- ❌ Data from different schemas conflicting

---

## Expected Outcomes

### Success Case
```
SCHEMA A (Customer):
  v1: 100 rows
  v2: 103 rows (version number incremented)

SCHEMA B (Sales):
  v1: 500 rows (STILL v1, not affected!)

SCHEMA C (Clinic):
  v1: 200 rows (starts fresh at v1)
```

### Failure Case (No Isolation)
```
Would show:
SCHEMA A: v1, v2
SCHEMA B: v2, v3 (WRONG! Should be v1, v2)
SCHEMA C: v3 (WRONG! Should be v1)
```

---

## Files Used

- **Customer**: `../sample_data/customer_data.json`
- **Sales**: `../sample_data/sales_data.json`
- **Clinic**: `../sample_data/clinic_data.json`
- **Schemas**: Respective `.json` files from sample_data/

## Time Estimate

- Setup: 10 minutes
- Upload all schemas: 10 minutes
- Add Customer v2: 5 minutes
- Verification: 5 minutes
- **Total**: ~25 minutes

---

**Test Case 3 Status**: [PASS / FAIL]  
**Tester**: _______________  
**Date**: _______________  
**Notes**: _______________
