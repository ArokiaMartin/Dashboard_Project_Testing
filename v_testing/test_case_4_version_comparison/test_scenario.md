# Test Case 4: Version Comparison & Overlay

## Objective
Verify that different versions can be compared in the dashboard builder with overlay on compatible charts.

## Prerequisites
- Backend running on http://localhost:8080
- Database with schemas table created
- Test data files available
- Test Cases 1-3 preferably completed
- Dashboard builder accessible

## Test Scenario

### Phase 1: Setup Schema with Two Versions

**Step 1**: Create Schema
```bash
SCHEMA_ID="comparison_schema"

curl -X POST http://localhost:8080/api/schemas/upload \
  -H "Content-Type: application/json" \
  -d '{
    "id": "'$SCHEMA_ID'",
    "schemaName": "sales_analytics",
    "description": "Sales data for comparison testing",
    "fields": [
      {"fieldName": "month", "fieldType": "DATE", "isRequired": true},
      {"fieldName": "region", "fieldType": "STRING", "isRequired": true},
      {"fieldName": "sales_amount", "fieldType": "NUMERIC", "isRequired": true},
      {"fieldName": "quantity", "fieldType": "INTEGER", "isRequired": false}
    ]
  }'
```

**Step 2**: Create and Upload Version 1 Data
```bash
# Create V1 data (Q1 Sales)
cat > sales_v1.json << 'EOF'
[
  {"month": "2026-01-01", "region": "North", "sales_amount": 50000, "quantity": 100},
  {"month": "2026-01-01", "region": "South", "sales_amount": 45000, "quantity": 90},
  {"month": "2026-01-01", "region": "East", "sales_amount": 55000, "quantity": 110},
  {"month": "2026-02-01", "region": "North", "sales_amount": 52000, "quantity": 105},
  {"month": "2026-02-01", "region": "South", "sales_amount": 48000, "quantity": 95},
  {"month": "2026-02-01", "region": "East", "sales_amount": 58000, "quantity": 115},
  {"month": "2026-03-01", "region": "North", "sales_amount": 55000, "quantity": 110},
  {"month": "2026-03-01", "region": "South", "sales_amount": 50000, "quantity": 100},
  {"month": "2026-03-01", "region": "East", "sales_amount": 60000, "quantity": 120}
]
EOF

CHECKSUM_V1=$(cat sales_v1.json | sha256sum | cut -d' ' -f1)
echo "V1 Checksum: $CHECKSUM_V1"

# Upload V1
curl -X POST http://localhost:8080/api/data/ingest-with-schema \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"$SCHEMA_ID\",
    \"tableName\": \"sales_analytics_v1\",
    \"data\": $(cat sales_v1.json),
    \"userId\": \"test_user\",
    \"skipValidation\": false
  }"

# Register V1
curl -X POST http://localhost:8080/api/data/versions/register \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"$SCHEMA_ID\",
    \"schemaName\": \"sales_analytics\",
    \"tableName\": \"sales_analytics_v1\",
    \"checksum\": \"$CHECKSUM_V1\",
    \"rowCount\": 9,
    \"fileName\": \"sales_v1.json\",
    \"isDuplicate\": false,
    \"originalVersionId\": null,
    \"createdBy\": \"test_user\"
  }"
```

**Record**: Version 1 Created
- Version ID: v_v1_id
- Version Number: 1
- Data: Q1 2026 sales (North: 50k, South: 45k, East: 55k)

**Step 3**: Create and Upload Version 2 Data (Updated Sales)
```bash
# Create V2 data (Q1 Sales with increased figures)
cat > sales_v2.json << 'EOF'
[
  {"month": "2026-01-01", "region": "North", "sales_amount": 60000, "quantity": 120},
  {"month": "2026-01-01", "region": "South", "sales_amount": 55000, "quantity": 110},
  {"month": "2026-01-01", "region": "East", "sales_amount": 65000, "quantity": 130},
  {"month": "2026-02-01", "region": "North", "sales_amount": 62000, "quantity": 125},
  {"month": "2026-02-01", "region": "South", "sales_amount": 58000, "quantity": 115},
  {"month": "2026-02-01", "region": "East", "sales_amount": 68000, "quantity": 135},
  {"month": "2026-03-01", "region": "North", "sales_amount": 65000, "quantity": 130},
  {"month": "2026-03-01", "region": "South", "sales_amount": 60000, "quantity": 120},
  {"month": "2026-03-01", "region": "East", "sales_amount": 70000, "quantity": 140}
]
EOF

CHECKSUM_V2=$(cat sales_v2.json | sha256sum | cut -d' ' -f1)
echo "V2 Checksum: $CHECKSUM_V2"

# Upload V2
curl -X POST http://localhost:8080/api/data/ingest-with-schema \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"$SCHEMA_ID\",
    \"tableName\": \"sales_analytics_v1\",
    \"data\": $(cat sales_v2.json),
    \"userId\": \"test_user\",
    \"skipValidation\": false
  }"

# Register V2
curl -X POST http://localhost:8080/api/data/versions/register \
  -H "Content-Type: application/json" \
  -d "{
    \"schemaId\": \"$SCHEMA_ID\",
    \"schemaName\": \"sales_analytics\",
    \"tableName\": \"sales_analytics_v1\",
    \"checksum\": \"$CHECKSUM_V2\",
    \"rowCount\": 9,
    \"fileName\": \"sales_v2.json\",
    \"isDuplicate\": false,
    \"originalVersionId\": null,
    \"createdBy\": \"test_user\"
  }"
```

**Record**: Version 2 Created
- Version ID: v_v2_id
- Version Number: 2
- Data: Q1 2026 sales with INCREASED amounts (North: 60k, South: 55k, East: 65k)

### Phase 2: Verify Both Versions Exist

**Step 4**: Get All Versions
```bash
curl http://localhost:8080/api/data/versions/schema/$SCHEMA_ID
```

**Expected Response**:
```json
[
  {
    "versionId": "v_v1_id",
    "versionNumber": 1,
    "checksum": "CHECKSUM_V1",
    "rowCount": 9
  },
  {
    "versionId": "v_v2_id",
    "versionNumber": 2,
    "checksum": "CHECKSUM_V2",
    "rowCount": 9
  }
]
```

### Phase 3: Test in Dashboard Builder UI

**Step 5**: Open Dashboard Builder
```
1. Navigate to: http://localhost:4200/builder
2. Load dataset with this schema
3. Observe: Version selector should appear (2 versions exist)
```

**Expected UI**:
```
SCHEMA VERSION
─────────────
Version: [v1 · 9 rows ▼]
Compare: [None ▼]
```

**Step 6**: Select Version 1 as Primary
```
In Dashboard Builder:
1. Click Version dropdown
2. Select: v1 · 9 rows
3. Observe: Data loads for version 1
```

**Expected Result**:
```
Version 1 Data Loaded:
- North Sales: 50000
- South Sales: 45000
- East Sales: 55000
- All region data from V1
```

**Step 7**: Select Version 2 as Compare
```
In Dashboard Builder:
1. Click Compare dropdown
2. Select: v2 · 9 rows
3. Observe: Message about overlay
```

**Expected Result**:
```
Message: "Overlaying v2 on bar/line/radar charts."
Compare version selected successfully
```

### Phase 4: Test Chart Overlay

**Step 8**: Create Bar Chart (Compatible for Overlay)
```
1. Select columns:
   - Dimension: month
   - Measure: sales_amount
2. Select visualization: Bar Chart
3. Observe: Chart appears with data
```

**Expected Chart V1**:
```
Bar Chart - Sales by Month (Version 1)
January:   150000 (50k+45k+55k)
February:  158000
March:     165000
```

**Step 9**: Enable Comparison Overlay
```
1. Version dropdown still shows: v1 · 9 rows
2. Compare dropdown shows: v2 · 9 rows
3. Chart should now display BOTH series
```

**Expected Chart Overlay**:
```
Bar Chart - Sales by Month (V1 vs V2)
─────────────────────────────────────
         V1 (Blue)    V2 (Orange)
Jan:     150000       180000
Feb:     158000       188000
Mar:     165000       195000

Legend shows:
  ■ v1
  ■ v2
```

**Visual Verification**:
- ✅ V1 bars visible (lower values: 150k, 158k, 165k)
- ✅ V2 bars visible (higher values: 180k, 188k, 195k)
- ✅ Both overlaid on same chart
- ✅ Different colors for each version
- ✅ Legend shows both versions

**Step 10**: Test Line Chart (Also Compatible)
```
1. Change visualization: Line Chart
2. Keep same dimensions/measures
3. Observe: Both series as lines
```

**Expected Result**:
```
Line Chart - Sales Trend (V1 vs V2)
─────────────────────────────────
    V1 (Blue line)
    /
   /
  /────
       V2 (Orange line)
```

**Step 11**: Test Pie Chart (NOT Compatible for Overlay)
```
1. Change visualization: Pie Chart
2. Observe: Compare version selector disabled or ignored
```

**Expected Result**:
```
Message: "Comparison not available for pie/table/KPI charts"
Only V1 data shown
V2 compare option disabled
```

### Phase 5: Switch Primary Version

**Step 12**: Switch to Version 2 as Primary
```
In Dashboard Builder:
1. Click Version dropdown
2. Select: v2 · 9 rows (NEW primary)
3. Observe: Data refreshes to V2
```

**Expected Result**:
```
Chart Data Now Shows V2:
- North Sales: 60000 (increased)
- South Sales: 55000 (increased)
- East Sales: 65000 (increased)
All values higher than V1
```

**Step 13**: Set Version 1 as Compare
```
1. Click Compare dropdown
2. Select: v1 · 9 rows (now comparison)
3. Observe: Overlay shows V1 + V2
```

**Expected Chart**:
```
Bar Chart - Sales by Month (V2 Primary, V1 Compare)
─────────────────────────────────────────────────
         V2 (Blue)    V1 (Orange)
Jan:     180000       150000
Feb:     188000       158000
Mar:     195000       165000
```

**Key Point**: Primary and compare roles reversed, but both versions visible

### Phase 6: Verification Points

**Step 14**: Version Selection
- [ ] Version selector appears when 2+ versions exist
- [ ] Can switch between v1 and v2
- [ ] Data refreshes when version changes
- [ ] Current version shows in dropdown

**Step 15**: Comparison Selection
- [ ] Compare dropdown available
- [ ] Can select different version for comparison
- [ ] Message shown about overlay
- [ ] Can change compare version

**Step 16**: Overlay Functionality
- [ ] Works on bar charts ✓
- [ ] Works on line charts ✓
- [ ] Works on radar charts ✓
- [ ] Does NOT work on pie charts ✓
- [ ] Does NOT work on table ✓
- [ ] Does NOT work on KPI ✓

**Step 17**: Data Correctness
- [ ] V1 values correct: North=50k, South=45k, East=55k
- [ ] V2 values correct: North=60k, South=55k, East=65k
- [ ] Overlay shows both series
- [ ] Legend identifies each series
- [ ] Different colors for each

---

## Verification Points

✅ **UI Elements**
- [ ] Version selector appears with 2+ versions
- [ ] Compare dropdown available
- [ ] Both dropdowns have correct options
- [ ] Messages displayed appropriately

✅ **Data Display**
- [ ] V1 data loads correctly
- [ ] V2 data loads correctly
- [ ] Both visible in overlay
- [ ] Values accurate for each version

✅ **Chart Compatibility**
- [ ] Bar chart overlay works ✓
- [ ] Line chart overlay works ✓
- [ ] Radar chart overlay works ✓
- [ ] Pie chart overlay blocked ✓
- [ ] Table version locked ✓
- [ ] KPI version locked ✓

✅ **Version Switching**
- [ ] Can switch primary version
- [ ] Data refreshes on switch
- [ ] Compare version updates correctly
- [ ] Chart re-renders

---

## Success Criteria

**PASS** if:
1. ✅ Both versions created (v1, v2)
2. ✅ Version selector appears in builder
3. ✅ Can select v1 and v2 independently
4. ✅ Data loads correctly for each version
5. ✅ Overlay works on bar/line/radar charts
6. ✅ Overlay disabled for pie/table/KPI
7. ✅ Different values visible for each version
8. ✅ Can switch between versions

**FAIL** if:
- ❌ Version selector doesn't appear
- ❌ Can't select different versions
- ❌ Same data shown for both versions
- ❌ Overlay not working
- ❌ Wrong values displayed
- ❌ Chart doesn't update on version change

---

## Expected Data Values

### Version 1 (Lower Sales)
```
North: 50k, 52k, 55k
South: 45k, 48k, 50k
East:  55k, 58k, 60k
```

### Version 2 (Higher Sales)
```
North: 60k, 62k, 65k
South: 55k, 58k, 60k
East:  65k, 68k, 70k
```

**Difference**: ~10k increase per region in V2

---

## Files Created During Test

- `sales_v1.json` - Version 1 data (lower values)
- `sales_v2.json` - Version 2 data (higher values)

## Time Estimate

- Setup: 10 minutes
- Create versions: 10 minutes
- UI testing: 20 minutes
- Overlay testing: 15 minutes
- **Total**: ~20 minutes

---

**Test Case 4 Status**: [PASS / FAIL]  
**Tester**: _______________  
**Date**: _______________  
**Notes**: _______________
