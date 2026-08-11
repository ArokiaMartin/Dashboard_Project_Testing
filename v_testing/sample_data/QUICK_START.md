# Quick Start Guide - Test Data Files

## ⚡ 2-Minute Setup

### **Download These Files:**
1. `sales_schema.json` ← Upload this FIRST
2. `sales_data.json` ← Upload this SECOND

---

## 🎯 Complete Test Flow

### **Step 1: Start Upload**
```
URL: http://localhost:4200/upload-data
Click: "Upload Data & Schema" button on home page
```

### **Step 2: Upload Schema**
```
Action: Click "Choose File" in Step 1
Select: sales_schema.json
Click: "Analyze Schema" button
Wait: ~2 seconds
Result: See "Step 2: Upload Data File"
```

### **Step 3: Upload Data**
```
Action: Click "Choose File" in Step 2
Select: sales_data.json (or sales_data.csv)
Click: "Upload & Ingest Data" button
Wait: ~3 seconds
Result: See success page with "15 rows ingested"
```

### **Step 4: View Results**
```
Click: "View Dashboards" button
Or go to: http://localhost:4200/data
See your newly uploaded data!
```

---

## 📋 File Descriptions

### **sales_schema.json**
What it defines:
- Table: `sales_transactions`
- Fields: product, amount, region, date, etc.
- 15 data rows ready to load

```json
{
  "schemaName": "sales_transactions",
  "fields": [
    {"fieldName": "transaction_id", "fieldType": "STRING", "isRequired": true},
    {"fieldName": "product_name", "fieldType": "STRING", "isRequired": true},
    ...
  ]
}
```

### **sales_data.json**
Data records (15 rows):
```json
[
  {
    "transaction_id": "TXN001",
    "product_name": "Laptop Pro 15",
    "category": "Electronics",
    "sales_amount": 1299.99,
    ...
  },
  // 14 more records
]
```

### **sales_data.csv**
Same data as JSON, CSV format:
```
transaction_id,product_name,category,sales_amount,...
TXN001,Laptop Pro 15,Electronics,1299.99,...
TXN002,Wireless Mouse,Electronics,45.50,...
// 13 more rows
```

---

## ✨ What You'll Get

After uploading:
- ✅ Table created: `sales_transactions_2024-01-XX`
- ✅ 15 rows of sales data
- ✅ All fields populated
- ✅ Data ready for dashboards

---

## 🔍 Data Preview

**Sample Record:**
```
Transaction ID: TXN001
Product: Laptop Pro 15
Category: Electronics
Amount: $1,299.99
Quantity: 1
Region: North
Date: 2024-01-15
Customer: John Smith
Bulk Order: No
```

---

## 🆚 Alternative Test Data

**Customer Dataset:**
- File: `customer_schema.json` + `customer_data.json`
- Records: 10 customers
- Fields: name, email, city, country, spending, etc.
- Use: After testing sales data

---

## ⚠️ Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| "File not found" | Download from `test-files/` folder |
| "Invalid JSON" | Use `.json` files, not `.txt` |
| "Schema not recognized" | Ensure `schemaName` field exists |
| "Data validation failed" | Check field names match schema |
| "Upload takes long" | Wait for backend response (3-5 sec) |

---

## 📱 Expected Result

When complete, you'll see:

```
✓ Data Upload Complete!
  Schema: sales_transactions
  Rows Ingested: 15
  Table Name: sales_transactions_2024-01-XX
```

---

## 🚀 You're Ready!

1. ✅ Download the 2 files (schema + data)
2. ✅ Go to upload page
3. ✅ Upload schema first
4. ✅ Upload data second
5. ✅ View results in dashboards

**That's it! Takes ~1 minute from start to finish.**

---

## 📞 Need Help?

- Check backend is running on port 8080
- Verify files are in correct format
- See detailed docs in `README.md`

---

**Happy Testing! 🎉**
