# v_testing Folder Overview

## 📦 Complete Folder Organization

Your data versioning testing suite is now fully organized in the `v_testing` folder with all test data and documentation.

---

## 🗂️ Folder Structure

```
v_testing/
│
├── 📄 README.md                                    ← START HERE
├── 📄 FOLDER_OVERVIEW.md                          ← This file
├── 📄 V_TESTING_GUIDE.md                          ← Comprehensive guide
│
├── 📁 sample_data/                                ← All test data files
│   ├── 📄 customer_data.json                      (100 records)
│   ├── 📄 customer_schema.json                    (Schema definition)
│   ├── 📄 sales_data.json                         (500 records)
│   ├── 📄 sales_schema.json                       (Schema definition)
│   ├── 📄 clinic_data.json                        (200 records)
│   ├── 📄 clinic_schema.json                      (Schema definition)
│   ├── 📄 marketing_data.json                     (150 records)
│   ├── 📄 marketing_schema.json                   (Schema definition)
│   ├── 📄 multi_table_data.json                   (Complex nested structure)
│   ├── 📄 multi_table_schema.json                 (Complex schema)
│   ├── 📄 sales_data.csv                          (CSV format)
│   ├── 📄 QUICK_START.md                          (Quick reference)
│   ├── 📄 DOWNLOAD_GUIDE.md                       (Download instructions)
│   └── 📄 README.md                               (Data guide)
│
├── 📁 test_case_1_duplicate_detection/            ← Test Case 1
│   ├── 📄 TEST_SCENARIO_1.md                      ← Step-by-step guide
│   └── 📁 primary_upload/                         (First upload files)
│   └── 📁 duplicate_upload/                       (Duplicate files)
│
├── 📁 test_case_2_multiple_versions/              ← Test Case 2
│   ├── 📄 test_scenario.md                        ← Instructions
│   ├── 📁 version_1/                              (Initial upload)
│   ├── 📁 version_2/                              (Modified data)
│   └── 📁 version_3/                              (Different data)
│
├── 📁 test_case_3_different_schemas/              ← Test Case 3
│   ├── 📄 test_scenario.md                        ← Instructions
│   ├── 📁 schema_a/                               (Customer schema)
│   ├── 📁 schema_b/                               (Sales schema)
│   └── 📁 schema_c/                               (Clinic schema)
│
├── 📁 test_case_4_version_comparison/             ← Test Case 4
│   ├── 📄 test_scenario.md                        ← Instructions
│   ├── 📁 primary_version/                        (Main version)
│   └── 📁 compare_version/                        (Compare against)
│
└── 📁 results/                                    ← Test Results
    ├── 📄 checksums.log                           (Calculated checksums)
    ├── 📄 api_responses.log                       (API response logs)
    └── 📄 test_summary.txt                        (Final results)
```

---

## 📋 What Each Folder Contains

### 1️⃣ sample_data/
**Purpose**: All test data and schemas for running tests

**Contents**:
- ✅ 5 complete schema pairs (schema + data)
- ✅ 10 JSON files + 1 CSV file
- ✅ Multiple data sizes (10KB to 50KB)
- ✅ Different complexity levels

**Use Cases**:
```
Quick Test:        customer_data.json + customer_schema.json
Medium Test:       sales_data.json + sales_schema.json
Complex Test:      multi_table_data.json + multi_table_schema.json
Performance Test:  multi_table_data.json (largest file)
```

---

### 2️⃣ test_case_1_duplicate_detection/
**Purpose**: Test duplicate detection and reuse

**Test Flow**:
```
1. Upload schema
2. Upload data v1
3. Upload same data again
4. Verify: Duplicate detected, v1 reused
```

**Files Needed**:
- Any pair from sample_data/ (use same file twice)

**Expected Result**:
```
✓ First upload → Version 1 created
✓ Second upload → Duplicate detected
✓ Version 1 reused (no re-ingest)
```

---

### 3️⃣ test_case_2_multiple_versions/
**Purpose**: Test version numbering and sequential versions

**Test Flow**:
```
1. Upload schema
2. Upload data v1
3. Modify data → Upload v2
4. Modify data → Upload v3
5. Verify: Versions 1, 2, 3 created
```

**Files Needed**:
- Schema file once
- Data files 3x (original + 2 modifications)

**Expected Result**:
```
✓ Version 1 → v1_hash_abc
✓ Version 2 → v2_hash_def (different checksum)
✓ Version 3 → v3_hash_ghi (different checksum)
```

---

### 4️⃣ test_case_3_different_schemas/
**Purpose**: Test schema isolation (independent versions)

**Test Flow**:
```
1. Upload customer schema + data → v1
2. Upload sales schema + data → v1 (independent!)
3. Upload customer data again → v2
4. Verify: Sales still at v1, Customer at v2
```

**Files Needed**:
- customer_schema.json + customer_data.json
- sales_schema.json + sales_data.json
- clinic_schema.json + clinic_data.json

**Expected Result**:
```
Customer: v1, v2, v3... (independent counter)
Sales:    v1, v2, v3... (independent counter)
Clinic:   v1, v2, v3... (independent counter)
```

---

### 5️⃣ test_case_4_version_comparison/
**Purpose**: Test version comparison and overlay

**Test Flow**:
```
1. Upload schema
2. Upload data v1
3. Upload modified data v2
4. In builder: Select v1 (primary)
5. In builder: Select v2 (compare)
6. Verify: Both versions visible on chart
```

**Files Needed**:
- Schema file
- Data v1 file
- Data v2 file (modified)

**Expected Result**:
```
✓ Primary Version (v1) loads
✓ Compare Version (v2) selectable
✓ Chart shows both versions overlaid
✓ Data points from both visible
```

---

### 📊 results/
**Purpose**: Store test execution results

**Files to Create**:
- `checksums.log` - All checksums calculated
- `api_responses.log` - API response examples
- `test_summary.txt` - Final results summary

**Template for test_summary.txt**:
```
Test Execution Report
=====================
Date: 2026-07-13
Tester: Your Name
Backend: localhost:8080
Database: PostgreSQL

Test Case 1: Duplicate Detection
  Status: PASS/FAIL
  Duration: 20 min
  Issues: None

Test Case 2: Multiple Versions
  Status: PASS/FAIL
  Duration: 30 min
  Issues: None

Test Case 3: Schema Isolation
  Status: PASS/FAIL
  Duration: 25 min
  Issues: None

Test Case 4: Version Comparison
  Status: PASS/FAIL
  Duration: 20 min
  Issues: None

Overall: PASS/FAIL ✓
Total Time: 95 minutes
```

---

## 🚀 Quick Start Guide

### For First-Time Testing

```bash
# 1. Navigate to v_testing
cd v_testing

# 2. Read the main guide
cat README.md
cat V_TESTING_GUIDE.md

# 3. Start with Test Case 1 (Easiest)
cd test_case_1_duplicate_detection
cat TEST_SCENARIO_1.md
# Follow steps in guide

# 4. Move to Test Case 2
cd ../test_case_2_multiple_versions
cat test_scenario.md
# Follow steps

# 5. Test Case 3
cd ../test_case_3_different_schemas
cat test_scenario.md
# Follow steps

# 6. Test Case 4
cd ../test_case_4_version_comparison
cat test_scenario.md
# Follow steps

# 7. Record results
cd ../results
nano test_summary.txt
```

---

## 📊 Data Files Summary

| File | Type | Size | Records | Purpose |
|------|------|------|---------|---------|
| customer_data.json | Data | 10KB | 100 | User records |
| customer_schema.json | Schema | 2KB | — | Schema def |
| sales_data.json | Data | 25KB | 500 | Transactions |
| sales_schema.json | Schema | 2KB | — | Schema def |
| clinic_data.json | Data | 15KB | 200 | Healthcare |
| clinic_schema.json | Schema | 2KB | — | Schema def |
| marketing_data.json | Data | 12KB | 150 | Campaigns |
| marketing_schema.json | Schema | 2KB | — | Schema def |
| multi_table_data.json | Data | 50KB | 1000+ | Complex |
| multi_table_schema.json | Schema | 5KB | — | Complex |

---

## ✅ Readiness Checklist

Before testing, ensure:

- [ ] Backend running (`localhost:8080`)
- [ ] Database ready (PostgreSQL)
- [ ] Sample data accessible
- [ ] Test files readable
- [ ] API endpoints responding
- [ ] Disk space available (>100MB)

---

## 🎯 Test Execution Order

### Recommended Order:
1. **Test Case 1** - Duplicate Detection (Simplest)
2. **Test Case 2** - Multiple Versions
3. **Test Case 3** - Schema Isolation
4. **Test Case 4** - Version Comparison

### Estimated Time:
- Test 1: 20 minutes
- Test 2: 30 minutes
- Test 3: 25 minutes
- Test 4: 20 minutes
- **Total: ~95 minutes**

---

## 📖 Documentation Structure

```
v_testing/
├── 📄 README.md                    ← Overview & quick start
├── 📄 V_TESTING_GUIDE.md           ← Detailed testing guide
├── 📄 FOLDER_OVERVIEW.md           ← This file
│
├── test_case_1/
│   └── TEST_SCENARIO_1.md          ← Step-by-step guide
├── test_case_2/
│   └── test_scenario.md            ← Step-by-step guide
├── test_case_3/
│   └── test_scenario.md            ← Step-by-step guide
└── test_case_4/
    └── test_scenario.md            ← Step-by-step guide

sample_data/
├── customer_data.json              ← Test data
├── customer_schema.json            ← Test schema
├── ... (other test files)
└── README.md                       ← Data guide
```

---

## 🔍 File Purposes

### Documentation Files
- **README.md** - Start here, overview and quick reference
- **V_TESTING_GUIDE.md** - Comprehensive testing guide with all details
- **FOLDER_OVERVIEW.md** - This file, folder structure explanation
- **TEST_SCENARIO_N.md** - Step-by-step instructions for each test

### Test Data Files
- **customer_data.json** - Customer records for testing
- **customer_schema.json** - Customer schema definition
- **sales_data.json** - Sales transaction records
- **sales_schema.json** - Sales schema definition
- **(other data files)** - Additional test scenarios

### Result Files
- **checksums.log** - Record of all checksums calculated
- **api_responses.log** - Sample API responses from tests
- **test_summary.txt** - Final test results and summary

---

## 💡 Tips for Testing

### ✓ Use curl for API Testing
```bash
# Copy curl commands from TEST_SCENARIO_N.md
# Run them in terminal
# Document responses
```

### ✓ Save Checksums
```bash
# Record first checksum
CHECKSUM=$(cat sample_data/customer_data.json | sha256sum)
echo $CHECKSUM > results/checksums.log
```

### ✓ Keep API Responses
```bash
# Save responses to log
curl ... > results/api_responses.log
```

### ✓ Note Any Differences
```bash
# If test behaves differently, record it
# Check against expected results
# Document for troubleshooting
```

---

## 🏁 After Testing

### Document Results
```bash
# Edit results/test_summary.txt
# Record:
# - Test status (PASS/FAIL)
# - Any issues found
# - Improvements needed
# - Time taken
```

### Next Steps
```
If PASS:   ✓ System ready for production
If FAIL:   ✗ Fix issues → Retest → Verify
```

---

## 📞 Quick Reference

**Where to find...**

| What | Where |
|------|-------|
| Main guide | `V_TESTING_GUIDE.md` |
| Quick start | `README.md` |
| Test details | `test_case_N_*/TEST_SCENARIO_N.md` |
| Test data | `sample_data/` |
| Test results | `results/` |
| Folder info | `FOLDER_OVERVIEW.md` (this file) |

---

## ✨ What's Included

✅ **4 Complete Test Cases** - Ready to execute
✅ **10 Data Files** - Multiple schemas and sizes
✅ **Step-by-Step Guides** - Easy to follow
✅ **Results Folder** - For documentation
✅ **Comprehensive Docs** - For reference

---

## 🎓 Learning Path

1. **Start**: Read `README.md`
2. **Learn**: Read `V_TESTING_GUIDE.md`
3. **Execute**: Follow `TEST_SCENARIO_N.md`
4. **Verify**: Check results against expected outcomes
5. **Document**: Save results in `results/`

---

**Status**: ✅ Ready for Testing
**Organization**: ✅ Complete
**Documentation**: ✅ Comprehensive
**Test Data**: ✅ All Included

**Happy Testing!** 🚀

---

Location: `Dashboard_Project_Testing-Updated (2)\Dashboard_Project_Testing-Updated\v_testing\`

Last Updated: 2026-07-13
