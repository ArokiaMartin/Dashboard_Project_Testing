# Test Data Files for Schema & Data Upload

This directory contains sample test files you can use to test the unified schema and data upload feature.

---

## 📁 Files Included

### **Set 1: Sales Data**

#### `sales_schema.json` (Schema Definition)
- **Use Case**: Sales transaction tracking
- **Fields**: 9 fields including transaction ID, product, category, amount, quantity, region, date, customer name, bulk order flag
- **File Size**: ~2 KB
- **Data Types**: STRING, NUMERIC, INTEGER, DATE, BOOLEAN

#### `sales_data.json` (Data - JSON Format)
- **Records**: 15 sample transactions
- **File Size**: ~3 KB
- **Format**: JSON array of objects
- **Use**: Test JSON data upload

#### `sales_data.csv` (Data - CSV Format)
- **Records**: 15 sample transactions
- **File Size**: ~1 KB
- **Format**: CSV with headers
- **Use**: Test CSV data upload

---

### **Set 2: Customer Data**

#### `customer_schema.json` (Schema Definition)
- **Use Case**: Customer information and account management
- **Fields**: 12 fields including customer ID, name, email, phone, city, country, signup date, spending, purchase count, premium status, account status
- **File Size**: ~2 KB
- **Data Types**: STRING, NUMERIC, INTEGER, DATE, BOOLEAN

#### `customer_data.json` (Data - JSON Format)
- **Records**: 10 sample customer records
- **File Size**: ~3 KB
- **Format**: JSON array of objects
- **Use**: Test JSON data upload with email validation

---

## 🚀 How to Test

### **Step 1: Upload Schema**

1. Go to **Home Page** → Click **"Upload Data & Schema"** button
   (Or navigate directly to `http://localhost:4200/upload-data`)

2. Click **"Choose File"** in Step 1
   - Select **`sales_schema.json`** or **`customer_schema.json`**

3. Click **"Analyze Schema"** button
   - System analyzes the schema
   - Creates database tables
   - Shows "Step 2" for data upload

---

### **Step 2: Upload Data**

4. Click **"Choose File"** in Step 2
   - Select **`sales_data.json`** OR **`sales_data.csv`**
   - (For customer schema, use **`customer_data.json`**)

5. Click **"Upload & Ingest Data"** button
   - System validates data against schema
   - Inserts rows into database table
   - Shows success with statistics

---

### **Step 3: View Results**

6. Success page shows:
   - ✓ Schema name
   - ✓ Rows ingested (count)
   - ✓ Table name (auto-generated)

7. Click **"View Dashboards"** to see your data
   - Go to **Uploaded Data** menu to query the data

---

## 📊 Test Data Overview

### **Sales Schema Fields**
```
transaction_id    | STRING      | Required | Unique transaction
product_name      | STRING      | Required | Product being sold
category          | STRING      | Required | Product category
sales_amount      | NUMERIC     | Required | Sale price (0 - 999,999.99)
quantity          | INTEGER     | Required | Units sold (1 - 10,000)
region            | STRING      | Required | Sales region
sale_date         | DATE        | Required | Date (YYYY-MM-DD)
customer_name     | STRING      | Optional | Customer name
is_bulk_order     | BOOLEAN     | Optional | Bulk purchase flag
```

### **Sales Data Highlights**
- **Categories**: Electronics, Clothing, Home, Sports, Food
- **Regions**: North, South, East, West, Central
- **Date Range**: 2024-01-15 to 2024-01-29
- **Amounts**: $15.99 to $1,299.99
- **Quantities**: 1 to 12 units
- **Bulk Orders**: Mix of regular and bulk orders

---

### **Customer Schema Fields**
```
customer_id            | STRING      | Required | Unique ID
first_name            | STRING      | Required | First name
last_name             | STRING      | Required | Last name
email                 | STRING      | Required | Email (validated)
phone                 | STRING      | Optional | Phone number
city                  | STRING      | Required | City
country               | STRING      | Required | Country
account_created_date  | DATE        | Required | Signup date
total_spent           | NUMERIC     | Required | Lifetime spending ($0+)
purchase_count        | INTEGER     | Required | Number of orders (0+)
is_premium            | BOOLEAN     | Required | Premium member flag
status                | STRING      | Required | Account status
```

### **Customer Data Highlights**
- **Cities**: 10 different US cities
- **Countries**: USA (all records)
- **Date Range**: 2023-01-15 to 2023-10-20
- **Total Spent**: $890 to $5,200.99
- **Purchase Count**: 5 to 22 orders
- **Premium Split**: 5 premium, 5 standard accounts
- **Status**: All Active accounts

---

## ✅ Validation Rules Included

### **Sales Schema Validations**
- Category must be: Electronics, Clothing, Home, Sports, or Food
- Region must be: North, South, East, West, or Central
- Sales amount must be: 0 to 999,999.99
- Quantity must be: 1 to 10,000

### **Customer Schema Validations**
- Email must match valid email format (regex pattern)
- Status must be: Active, Inactive, Suspended, or Deleted
- Total spent must be: 0 or greater
- Purchase count must be: 0 or greater

---

## 🧪 Test Scenarios

### **Scenario 1: Basic Upload**
1. Upload `sales_schema.json`
2. Upload `sales_data.json`
3. ✅ Should succeed with 15 rows

### **Scenario 2: CSV Format**
1. Upload `sales_schema.json`
2. Upload `sales_data.csv` (instead of JSON)
3. ✅ Should succeed with 15 rows

### **Scenario 3: Different Dataset**
1. Upload `customer_schema.json`
2. Upload `customer_data.json`
3. ✅ Should succeed with 10 rows

### **Scenario 4: Multiple Uploads**
1. Complete Scenario 1
2. Reset and start over
3. Complete Scenario 3
4. ✅ Both tables should exist independently

---

## 📥 Download Instructions

All test files are located in: `test-files/` directory

You can:
1. **Download directly** from the file explorer
2. **Copy the file content** and save locally
3. **Use on any machine** - files are self-contained

---

## 🔍 File Details

| File | Size | Type | Records | Purpose |
|------|------|------|---------|---------|
| `sales_schema.json` | ~2 KB | JSON | Schema | Define sales structure |
| `sales_data.json` | ~3 KB | JSON | 15 rows | Test JSON ingestion |
| `sales_data.csv` | ~1 KB | CSV | 15 rows | Test CSV ingestion |
| `customer_schema.json` | ~2 KB | JSON | Schema | Define customer structure |
| `customer_data.json` | ~3 KB | JSON | 10 rows | Test customer data |

---

## 💡 Tips for Testing

1. **Start with Sales Data** - Good for learning the flow
2. **Try Both Formats** - Upload JSON first, then CSV
3. **Check Validation** - All data meets schema requirements
4. **View Results** - Go to "Uploaded Data" menu to query
5. **Create Dashboards** - Build visualizations from ingested data

---

## ⚠️ Important Notes

- **Do NOT modify file names** - Upload uses filename for identification
- **Ensure backend is running** - API must be available on port 8080
- **Check schema first** - Schema defines table structure
- **Validate before ingesting** - System will catch validation errors

---

## 📧 Support

If you encounter errors:
1. **Check file format** - Must be valid JSON
2. **Verify field names** - Must match schema exactly
3. **Check data types** - Must match schema types
4. **Review validation rules** - See "Validation Rules" section above

---

**Ready to test? Download the files and start uploading! 🚀**
