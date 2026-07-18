# 📥 Download Test Files Guide

## 🎯 What to Download

All test files are in the `test-files/` directory. Here's what you need:

---

## 📦 Recommended Test Sets

### **Set 1: Sales Data (Recommended - Start Here)**
Download these 2 files:
1. ✅ **`sales_schema.json`** (2 KB)
   - Defines the sales transaction structure
   - 9 fields: transaction_id, product_name, category, amount, quantity, region, date, customer_name, is_bulk_order

2. ✅ **`sales_data.json`** (3 KB)
   - 15 sample sales records
   - Ready to upload after schema
   - Use this for JSON testing

**OR** for CSV testing:
3. ✅ **`sales_data.csv`** (1 KB)
   - Same 15 records in CSV format
   - Alternative to JSON format
   - Shows multi-format support

---

### **Set 2: Customer Data (Optional - Try After Set 1)**
Download these 2 files:
1. ✅ **`customer_schema.json`** (2 KB)
   - Defines the customer information structure
   - 12 fields: customer_id, name, email, phone, city, country, signup_date, spending, purchase_count, premium_status, account_status

2. ✅ **`customer_data.json`** (3 KB)
   - 10 sample customer records
   - Tests email validation
   - Different structure for variety testing

---

## 📄 Documentation Files

### **For Understanding:**
1. ✅ **`README.md`** (6 KB)
   - Complete reference guide
   - Detailed field descriptions
   - Validation rules explained
   - Test scenarios

2. ✅ **`QUICK_START.md`** (3 KB)
   - 2-minute quick setup
   - Step-by-step instructions
   - Expected results
   - Troubleshooting

---

## 📋 Complete File List

```
test-files/
├── 📄 DOWNLOAD_GUIDE.md          (This file - How to download)
├── 📄 README.md                  (Full reference guide)
├── 📄 QUICK_START.md             (2-minute setup guide)
│
├── 📊 SALES DATA SET:
│   ├── sales_schema.json         (Schema definition - 2 KB)
│   ├── sales_data.json           (15 JSON records - 3 KB)
│   └── sales_data.csv            (15 CSV records - 1 KB)
│
└── 👥 CUSTOMER DATA SET:
    ├── customer_schema.json      (Schema definition - 2 KB)
    └── customer_data.json        (10 JSON records - 3 KB)
```

---

## 🚀 Quick Download Checklist

### **Minimum to Start (Recommended):**
- [ ] `sales_schema.json` ← Upload FIRST
- [ ] `sales_data.json` ← Upload SECOND
- [ ] `QUICK_START.md` ← Read this first

### **Complete Test Suite:**
- [ ] `sales_schema.json`
- [ ] `sales_data.json`
- [ ] `sales_data.csv` (for format testing)
- [ ] `customer_schema.json`
- [ ] `customer_data.json`
- [ ] `README.md` (reference)
- [ ] `QUICK_START.md` (instructions)

---

## 💻 How to Download

### **Option 1: Direct File Download**
1. Navigate to `test-files/` folder in project
2. Right-click on file → "Save As"
3. Save to your computer
4. Use in upload page

### **Option 2: Copy-Paste Content**
1. Open file in editor
2. Select all content (Ctrl+A)
3. Copy (Ctrl+C)
4. Create new file (.json or .csv)
5. Paste content (Ctrl+V)
6. Save file

### **Option 3: Git Clone**
If using version control:
```bash
git clone <repo>
cd test-files/
# All files available
```

---

## 📊 File Sizes & Type

| File | Size | Type | Format | Purpose |
|------|------|------|--------|---------|
| sales_schema.json | 2 KB | Text | JSON | Schema definition |
| sales_data.json | 3 KB | Text | JSON | JSON format data |
| sales_data.csv | 1 KB | Text | CSV | CSV format data |
| customer_schema.json | 2 KB | Text | JSON | Schema definition |
| customer_data.json | 3 KB | Text | JSON | JSON format data |
| README.md | 6 KB | Text | Markdown | Full documentation |
| QUICK_START.md | 3 KB | Text | Markdown | Quick setup |

**Total: ~20 KB** - All files very small, quick to download

---

## ✅ Verification After Download

**Sales Schema File should contain:**
```json
{
  "schemaName": "sales_transactions",
  "description": "Sales transaction data...",
  "fields": [...]
}
```

**Sales Data File should contain:**
```json
[
  {
    "transaction_id": "TXN001",
    "product_name": "Laptop Pro 15",
    ...
  },
  ...
]
```

**CSV File should contain:**
```
transaction_id,product_name,category,...
TXN001,Laptop Pro 15,Electronics,...
...
```

---

## 🎯 Testing Sequence

### **Test 1: JSON Format**
1. Download `sales_schema.json`
2. Download `sales_data.json`
3. Upload schema first
4. Upload JSON data
5. ✅ Verify 15 rows ingested

### **Test 2: CSV Format**
1. Use same `sales_schema.json`
2. Download `sales_data.csv`
3. Reset upload
4. Upload schema again
5. Upload CSV data
6. ✅ Verify 15 rows ingested

### **Test 3: Different Schema**
1. Download `customer_schema.json`
2. Download `customer_data.json`
3. Upload schema first
4. Upload JSON data
5. ✅ Verify 10 rows ingested

---

## 💡 Pro Tips

1. **Save files locally** - Copy to a folder on your computer
2. **Keep filenames** - Don't rename for best results
3. **Use BOTH sets** - Test with different data for thorough verification
4. **Check file extension** - .json and .csv are different
5. **Keep test files** - Reuse for regression testing

---

## 🔗 File Locations

Files are located in your project directory:
```
project_realtime/
└── test-files/
    ├── sales_schema.json
    ├── sales_data.json
    ├── sales_data.csv
    ├── customer_schema.json
    ├── customer_data.json
    ├── README.md
    ├── QUICK_START.md
    └── DOWNLOAD_GUIDE.md (this file)
```

---

## ❓ FAQ

**Q: Which file to download first?**
A: Download `sales_schema.json` first (it's the starting point)

**Q: Do I need all files?**
A: No, start with sales_schema.json + sales_data.json

**Q: Can I modify the data?**
A: Yes, but keep the field names the same

**Q: What if file doesn't upload?**
A: Check file format is valid JSON/CSV, see README.md

**Q: Can I use my own data?**
A: Yes, after understanding the schema format

---

## ✨ You're All Set!

1. ✅ Find the test-files/ folder
2. ✅ Download the 2 files you need
3. ✅ Go to upload page
4. ✅ Follow QUICK_START.md
5. ✅ Complete test in 2 minutes!

---

**Happy Testing! 🚀**

**Questions? See README.md for detailed documentation**
