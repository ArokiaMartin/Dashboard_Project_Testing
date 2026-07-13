# Testing Setup Complete - Ready to Verify Fix

## ✅ What You Have Now

### 1. Versioning Fix Applied
**File:** `SchemaBasedIngestionService.java`
- ✅ Changed table naming to `schema_name_v1`, `v2`, `v3` (separate tables)
- ✅ Disabled merge logic (no more automatic appending)
- ✅ Each upload creates new version with separate table
- ✅ Version numbers auto-increment (1, 2, 3...)

### 2. Test Case 5 Created
**Folder:** `v_testing/test_case_5_separate_versions_verification/`

**Files:**
- `product_schema.json` - Schema definition
- `product_data_v1.json` - 7 products
- `product_data_v2.json` - 9 products (price changes + new items)
- `product_data_v3.json` - 6 products (different subset, price increases)
- `TEST_SCENARIO_5.md` - Detailed 600+ line test guide
- `test_results_template.txt` - Checklist for tracking results
- `README.md` - Quick reference guide

### 3. Documentation
**Files Created:**
- `VERSIONING_FIX_GUIDE.md` - Complete fix explanation
- `VERIFICATION_PROOF.md` - Step-by-step verification
- `BACKEND_CHANGES_SUMMARY.md` - Code changes summary

---

## 🚀 Quick Start: How to Test

### Step 1: Build
```bash
mvn clean build
npm run build
```

### Step 2: Register Schema
```bash
POST http://localhost:8080/api/schema/register
Body: {
  "id": "product_schema_005",
  "schemaName": "product_catalog",
  "fields": [...]
}
```
✓ Should succeed

### Step 3: Upload Version 1
```bash
POST http://localhost:8080/api/schema/ingest
Body: {
  "schemaId": "product_schema_005",
  "data": [7 products from product_data_v1.json]
}
```
**Expected Result:**
- ✓ Table created: `product_catalog_v1`
- ✓ 7 rows inserted
- ✓ Version 1 registered

### Step 4: Upload Version 2
```bash
POST http://localhost:8080/api/schema/ingest
Body: {
  "schemaId": "product_schema_005",
  "data": [9 products from product_data_v2.json]
}
```
**Expected Result:**
- ✓ Table created: `product_catalog_v2` (DIFFERENT TABLE!)
- ✓ 9 rows inserted (to NEW table)
- ✓ Version 2 registered
- ✓ Version 1 still exists untouched

### Step 5: Upload Version 3
```bash
POST http://localhost:8080/api/schema/ingest
Body: {
  "schemaId": "product_schema_005",
  "data": [6 products from product_data_v3.json]
}
```
**Expected Result:**
- ✓ Table created: `product_catalog_v3` (THIRD TABLE!)
- ✓ 6 rows inserted (to NEW table)
- ✓ Version 3 registered

### Step 6: Verify Database
```sql
-- Check tables created
SELECT table_name FROM information_schema.tables 
WHERE table_name LIKE 'product_catalog_v%' ORDER BY table_name;

-- Expected:
-- product_catalog_v1
-- product_catalog_v2
-- product_catalog_v3

-- Check versions registered
SELECT version_number, row_count, table_name FROM data_versions 
WHERE schema_id = 'product_schema_005' ORDER BY version_number;

-- Expected:
-- 1 | 7 | product_catalog_v1
-- 2 | 9 | product_catalog_v2
-- 3 | 6 | product_catalog_v3
```

### Step 7: Check API
```bash
GET http://localhost:8080/api/data/versions/schema/product_schema_005
```
**Expected Response:**
```json
[
  {"versionNumber": 1, "checksum": "abc123...", "rowCount": 7, "tableName": "product_catalog_v1"},
  {"versionNumber": 2, "checksum": "def456...", "rowCount": 9, "tableName": "product_catalog_v2"},
  {"versionNumber": 3, "checksum": "ghi789...", "rowCount": 6, "tableName": "product_catalog_v3"}
]
```

### Step 8: Test Dashboard
1. Open: `http://localhost:4200/dashboard-builder`
2. Select Schema: `product_catalog`
3. Verify dropdown shows:
   - Version 1 (7 rows)
   - Version 2 (9 rows)
   - Version 3 (6 rows)
4. Click each version:
   - Version 1: Should show 7 products, Laptop @ $1,299.99
   - Version 2: Should show 9 products, Laptop @ $1,199.99
   - Version 3: Should show 6 products, Laptop @ $1,349.99

---

## 📋 Test Results Tracking

Use `test_results_template.txt` to record:
- ✓ Each step pass/fail status
- ✓ Expected vs actual values
- ✓ Database query results
- ✓ Dashboard verification
- ✓ Overall result: PASS/FAIL

---

## 🎯 Success Criteria

| Item | Expected | Your Result |
|------|----------|-------------|
| 3 separate tables | product_catalog_v1, v2, v3 | ☐ |
| Row counts | 7, 9, 6 | ☐ |
| Version metadata | 3 entries in data_versions | ☐ |
| Checksums | All different | ☐ |
| API returns | 3 version objects | ☐ |
| Dashboard dropdown | Shows v1, v2, v3 | ☐ |
| Price differences | v1=$1299, v2=$1199, v3=$1349 | ☐ |
| Data isolation | No mixing between tables | ☐ |

**ALL MUST BE CHECKED FOR SUCCESS**

---

## 📚 Documentation Guide

### For Quick Understanding
**Start with:** `README.md` in test_case_5 folder
- 5 minute overview
- SQL queries
- Troubleshooting

### For Detailed Testing
**Use:** `TEST_SCENARIO_5.md`
- 600+ lines of detailed steps
- Expected outputs for each step
- Database verification queries
- Dashboard testing steps

### For Code Understanding
**Read:** `VERSIONING_FIX_GUIDE.md`
- Detailed code changes
- Before/after comparison
- How the fix works

---

## ✨ Key Differences Between Versions

### Version 1 Data
```
7 products
Prices: $12.99 - $1,299.99
Key item: Laptop Pro 15 @ $1,299.99
Date: 2026-01-15
```

### Version 2 Data (Different)
```
9 products (2 new added)
Prices: $11.99 - $1,199.99 (REDUCED)
Key item: Laptop Pro 15 @ $1,199.99 (7.7% cheaper)
New items: USB Hub 4-Port, Laptop Stand Adjustable
Date: 2026-02-20
```

### Version 3 Data (Different)
```
6 products (different subset)
Prices: $16.99 - $1,349.99 (INCREASED)
Key item: Laptop Pro 15 @ $1,349.99 (3.8% more expensive)
New item: Webcam HD 1080p
Date: 2026-03-25
```

**Easy to spot the differences → Easy to verify test worked!**

---

## 🔍 How to Verify Each Version Works

### Version 1 Check
```sql
SELECT product_id, product_name, unit_price FROM product_catalog_v1 WHERE product_id = 1001;
-- Expected: 1001 | Laptop Pro 15 | 1299.99
```

### Version 2 Check
```sql
SELECT product_id, product_name, unit_price FROM product_catalog_v2 WHERE product_id = 1001;
-- Expected: 1001 | Laptop Pro 15 | 1199.99
-- Different from v1!
```

### Version 3 Check
```sql
SELECT product_id, product_name, unit_price FROM product_catalog_v3 WHERE product_id = 1001;
-- Expected: 1001 | Laptop Pro 15 | 1349.99
-- Different from both v1 and v2!
```

---

## ✅ What Should Happen

### ❌ BEFORE FIX (Wrong)
```
Upload 1 → product_catalog_v1 (7 rows)
Upload 2 → product_catalog_v1 (MERGED! now 16 rows, data mixed)
Upload 3 → product_catalog_v1 (MERGED! now 22 rows, data all mixed)

Result: Only 1 version visible, data is corrupted mixture
```

### ✅ AFTER FIX (Correct)
```
Upload 1 → product_catalog_v1 (7 rows, clean snapshot)
Upload 2 → product_catalog_v2 (9 rows, clean snapshot, separate table)
Upload 3 → product_catalog_v3 (6 rows, clean snapshot, separate table)

Result: 3 versions visible, each has clean, isolated data
```

---

## 🎯 Final Checklist

Before deployment, verify:
- [ ] Build successful: `mvn clean build`
- [ ] 3 separate tables created
- [ ] 3 versions registered in data_versions
- [ ] All checksums different
- [ ] API returns 3 versions
- [ ] Dashboard shows v1, v2, v3
- [ ] Switching versions shows correct data
- [ ] test_results_template.txt marked PASS

---

## 📞 Need Help?

### Check README.md
- Quick reference
- SQL queries
- Common issues

### Check TEST_SCENARIO_5.md
- Detailed steps
- Expected outputs
- Verification points

### Check VERSIONING_FIX_GUIDE.md
- Code changes explained
- Before/after comparison
- How the system works

---

## 🚀 Next Steps

1. **Build the application**
   ```bash
   mvn clean build
   npm run build
   ```

2. **Start the application**
   ```bash
   # Backend starts on 8080
   # Frontend starts on 4200
   ```

3. **Run test case 5**
   - Follow test_results_template.txt
   - Use TEST_SCENARIO_5.md for detailed steps

4. **Record results**
   - Fill in test_results_template.txt
   - Note any issues or observations

5. **Review results**
   - Compare with expected values
   - All checks should PASS

6. **Deploy**
   - If all tests pass → Ready for production
   - If tests fail → Check troubleshooting section in README.md

---

## 🎉 Success!

When all tests PASS:
- ✅ Fix is working correctly
- ✅ Each upload creates separate version
- ✅ Users can select any version in dashboard
- ✅ No data mixing or corruption
- ✅ System is production-ready

**You're done! The versioning system is fixed and verified! 🚀**

---

## 📍 File Locations

**Fix Applied:**
- `backend/src/main/java/.../SchemaBasedIngestionService.java`

**Test Files:**
- `v_testing/test_case_5_separate_versions_verification/`

**Documentation:**
- `VERSIONING_FIX_GUIDE.md`
- `VERIFICATION_PROOF.md`
- `BACKEND_CHANGES_SUMMARY.md`

**Testing Guide:**
- `README.md` (in test case folder)
- `TEST_SCENARIO_5.md` (detailed)
- `test_results_template.txt` (checklist)

---

**Date Created:** 2026-07-13
**Fix Status:** ✅ COMPLETE
**Test Status:** ✅ READY
**Deploy Status:** ⏳ AWAITING VERIFICATION
