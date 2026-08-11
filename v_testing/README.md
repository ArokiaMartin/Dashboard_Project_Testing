# v_testing - Data Versioning Test Suite

Complete testing suite for data versioning with checksum-based deduplication.

## 📁 Folder Structure

```
v_testing/
├── README.md                                  ← You are here
├── V_TESTING_GUIDE.md                        ← Main testing guide
│
├── sample_data/                              ← All test data files
│   ├── customer_data.json                    Schema data for customers
│   ├── customer_schema.json
│   ├── sales_data.json                       Schema data for sales
│   ├── sales_schema.json
│   ├── clinic_data.json                      Schema data for healthcare
│   ├── clinic_schema.json
│   ├── marketing_data.json                   Schema data for marketing
│   ├── marketing_schema.json
│   ├── multi_table_data.json                 Complex nested data
│   └── multi_table_schema.json
│
├── test_case_1_duplicate_detection/          ✓ Duplicate reuse test
│   └── TEST_SCENARIO_1.md                    Step-by-step guide
│
├── test_case_2_multiple_versions/            ✓ Version numbering test
│   └── test_scenario.md
│
├── test_case_3_different_schemas/            ✓ Schema isolation test
│   └── test_scenario.md
│
├── test_case_4_version_comparison/           ✓ Overlay comparison test
│   └── test_scenario.md
│
└── results/                                   ← Test results
    ├── checksums.log                         Checksum calculations
    ├── api_responses.log                     API response logs
    └── test_summary.txt                      Final results
```

---

## 🎯 Quick Start

### Option 1: Run All Tests
```bash
cd v_testing

# Test 1: Duplicate Detection
cd test_case_1_duplicate_detection
bash TEST_SCENARIO_1.md        # Follow steps

# Test 2: Multiple Versions
cd ../test_case_2_multiple_versions
bash test_scenario.md          # Follow steps

# ... Continue for test 3 & 4
```

### Option 2: Run Specific Test
```bash
cd v_testing/test_case_1_duplicate_detection
# Follow TEST_SCENARIO_1.md steps manually
```

### Option 3: Use Frontend UI
1. Go to Dashboard → Upload Schema
2. Upload schema from `sample_data/`
3. Upload data from `sample_data/`
4. Observe version behavior
5. Test in Dashboard Builder

---

## 📊 Test Cases Overview

### Test Case 1: Duplicate Detection ✓
**File**: `test_case_1_duplicate_detection/TEST_SCENARIO_1.md`

**What it tests**:
- Upload identical data twice
- Verify first upload creates v1
- Verify second upload is detected as duplicate
- Confirm v1 is reused (no re-ingest)

**Expected Outcome**:
```
Upload 1: customer_data.json → Version 1 created
Upload 2: customer_data.json → Duplicate detected, v1 reused
```

**Time**: 20 minutes | **Difficulty**: Easy

---

### Test Case 2: Multiple Versions ✓
**File**: `test_case_2_multiple_versions/test_scenario.md`

**What it tests**:
- Upload same schema with different data
- Verify version numbers increment (v1, v2, v3)
- Check unique checksums for each version
- Confirm proper version ordering

**Expected Outcome**:
```
Upload 1: customer_data.json → Version 1
Upload 2: customer_data_modified.json → Version 2
Upload 3: customer_data_v2.json → Version 3
```

**Time**: 30 minutes | **Difficulty**: Medium

---

### Test Case 3: Different Schemas ✓
**File**: `test_case_3_different_schemas/test_scenario.md`

**What it tests**:
- Multiple schemas with independent versions
- Upload customer schema + data (v1)
- Upload sales schema + data (v1, independent)
- Verify customer v2 doesn't affect sales v1

**Expected Outcome**:
```
Customer Schema:
  v1: customer_data.json
  v2: customer_data_modified.json

Sales Schema (independent):
  v1: sales_data.json
  (no v2 created yet)
```

**Time**: 25 minutes | **Difficulty**: Medium

---

### Test Case 4: Version Comparison ✓
**File**: `test_case_4_version_comparison/test_scenario.md`

**What it tests**:
- Create v1 and v2 for same schema
- Load in dashboard builder
- Select v1 as primary version
- Select v2 as comparison version
- Verify overlay on charts

**Expected Outcome**:
```
Primary: Version 1 (blue line)
Compare: Version 2 (orange line)
Result: Both visible on same chart
```

**Time**: 20 minutes | **Difficulty**: Easy

---

## 📋 Test Data Reference

| Dataset | File | Size | Records | Use Case |
|---------|------|------|---------|----------|
| **Customer** | `customer_data.json` | 10KB | ~100 | User data |
| **Sales** | `sales_data.json` | 25KB | ~500 | Transactions |
| **Clinic** | `clinic_data.json` | 15KB | ~200 | Healthcare |
| **Marketing** | `marketing_data.json` | 12KB | ~150 | Campaigns |
| **Multi-Table** | `multi_table_data.json` | 50KB | ~1000 | Complex data |

---

## 🔍 What Gets Tested

### ✓ Core Functionality
- [x] Checksum calculation (frontend & backend)
- [x] Duplicate detection
- [x] Version registration
- [x] Version numbering
- [x] Metadata tracking

### ✓ Error Handling
- [x] Invalid schema ID
- [x] Missing data
- [x] Duplicate checksums
- [x] Database constraints

### ✓ Performance
- [x] Checksum < 100ms
- [x] Duplicate check < 50ms
- [x] Version registration < 100ms

### ✓ UI Integration
- [x] Version selector display
- [x] Version switching
- [x] Comparison overlay
- [x] Version list population

---

## 📝 How to Run Tests

### Step 1: Prepare
```bash
# Ensure backend is running
# Ensure database is ready
# Ensure test data is accessible
```

### Step 2: Execute
```bash
# For each test case:
1. Read TEST_SCENARIO.md
2. Follow steps sequentially
3. Record results
4. Note any issues
```

### Step 3: Verify
```bash
# Check each verification point:
- Checksum matches
- Version number correct
- Database updated
- API response valid
```

### Step 4: Report
```bash
# Save results:
results/test_summary.txt
```

---

## ✅ Verification Checklist

### Before Testing
- [ ] Backend running on :8080
- [ ] Database connected
- [ ] Test data available
- [ ] API endpoints responding

### During Testing
- [ ] Each step completed
- [ ] API responses recorded
- [ ] Checksums noted
- [ ] Issues documented

### After Testing
- [ ] All test cases passed
- [ ] Results summarized
- [ ] Failed tests noted
- [ ] Improvements identified

---

## 🐛 Troubleshooting

### Backend not responding
```bash
# Check if running
curl http://localhost:8080/health

# If not running, start:
java -jar target/dashboard-backend-1.0.0.jar
```

### Database connection error
```bash
# Check PostgreSQL running
psql -U postgres -c "SELECT 1"

# If not, start PostgreSQL
sudo systemctl start postgresql
```

### Test data not found
```bash
# Verify location
ls -la sample_data/

# If missing, copy from project root
cp ../test-files/*.json sample_data/
```

### Checksum mismatch
```bash
# Recalculate checksum
sha256sum sample_data/customer_data.json

# Verify with backend
```

---

## 📈 Expected Results Summary

### All Tests Pass (Success)
```
✓ Test 1: Duplicate Detection - PASS
✓ Test 2: Multiple Versions - PASS  
✓ Test 3: Schema Isolation - PASS
✓ Test 4: Version Comparison - PASS

Overall: READY FOR PRODUCTION
```

### Some Tests Fail (Issues)
```
✓ Test 1: Duplicate Detection - PASS
✗ Test 2: Multiple Versions - FAIL (version number issue)
✓ Test 3: Schema Isolation - PASS
✗ Test 4: Version Comparison - FAIL (overlay not working)

Overall: NEEDS FIXES
```

---

## 📞 Support

### For Test Execution
→ See `V_TESTING_GUIDE.md`

### For Specific Test Case
→ See `test_case_N_*/TEST_SCENARIO_N.md`

### For API Details
→ See `../BACKEND_VERSIONING_IMPLEMENTATION.md`

### For Frontend Integration
→ See `../VERSIONING_IMPLEMENTATION.md`

---

## 📊 Test Metrics

| Metric | Value |
|--------|-------|
| Total Test Cases | 4 |
| Total Steps | 35+ |
| Estimated Time | 95 minutes |
| Data Files | 10 |
| API Endpoints | 5 |
| Success Criteria | 20+ |

---

## 🚀 Next Steps

1. **Run Tests**
   - Execute all 4 test cases
   - Document results
   - Fix any issues

2. **Verify Results**
   - Check checksums
   - Confirm version numbers
   - Validate database state

3. **Deploy to Production**
   - Tag as version 1.0
   - Document any gotchas
   - Monitor in production

---

## 📅 Test Execution Log

```
Test Date: ___________
Tester: ___________
Backend Version: ___________
Database: ___________

Test Case 1: ___________  [PASS/FAIL]
Test Case 2: ___________  [PASS/FAIL]
Test Case 3: ___________  [PASS/FAIL]
Test Case 4: ___________  [PASS/FAIL]

Overall Result: [PASS/FAIL]
Issues Found: 
- Issue 1
- Issue 2

Fixes Applied:
- Fix 1
- Fix 2

Sign-off: ___________
```

---

## 🎓 Learning Resources

- Frontend: `../VERSIONING_IMPLEMENTATION.md`
- Backend: `../BACKEND_VERSIONING_IMPLEMENTATION.md`
- Quick Start: `../QUICK_START_VERSIONING.md`
- API Reference: `../BACKEND_VERSIONING_IMPLEMENTATION.md#API-Reference`

---

**Status**: ✅ Ready for Testing

**Last Updated**: 2026-07-13

**Version**: 1.0.0
