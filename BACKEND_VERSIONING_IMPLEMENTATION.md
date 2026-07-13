# Backend Versioning Implementation Guide

## Overview
Complete Java/Spring Boot implementation of data versioning with checksum-based deduplication.

## Files Created

### 1. Data Models
**Location**: `backend/src/main/java/com/example/dashboard_backend/model/`

#### DataVersion.java
- Record class representing a versioned dataset
- Fields: versionId, schemaId, checksum, rowCount, uploadedAt, etc.
- Used throughout the versioning system

#### VersionCheckResult.java
- Response from duplicate checking
- Contains: isDuplicate flag, existingVersion data, newChecksum

#### CheckDuplicateRequest.java
- Request payload for checking duplicates
- Contains: schemaId, checksum

#### RegisterVersionRequest.java
- Request payload for registering new version
- Contains: all version metadata (checksum, rowCount, fileName, etc.)

### 2. Repository Layer
**Location**: `backend/src/main/java/com/example/dashboard_backend/ingestion/metadata/`

#### DataVersioningRepository.java
- Handles all database operations for versioning
- Manages `data_versions` table CRUD operations
- Key methods:
  - `findByChecksumAndSchema()` - Duplicate detection
  - `registerVersion()` - Record new version
  - `getVersionsBySchema()` - List versions
  - `getVersionById()` - Fetch specific version
  - `deleteVersion()` - Remove version

### 3. Service Layer
**Location**: `backend/src/main/java/com/example/dashboard_backend/service/`

#### DataVersioningService.java
- Business logic for versioning
- Orchestrates duplicate checking and version registration
- Key methods:
  - `checkDuplicate()` - Detects duplicate data
  - `registerVersion()` - Records version metadata
  - `getVersionsBySchema()` - List versions for UI
  - `calculateChecksum()` - SHA-256 checksum utility

#### Integration with SchemaBasedIngestionService
- Location: `backend/src/main/java/com/example/dashboard_backend/service/SchemaBasedIngestionService.java`
- **Already has deduplication logic** using fingerprints
- Can be enhanced to also register versions via DataVersioningService

### 4. Controller Layer
**Location**: `backend/src/main/java/com/example/dashboard_backend/controller/`

#### DataVersioningController.java
- REST endpoints for versioning operations
- All endpoints include:
  - Request validation
  - Error handling & logging
  - Swagger/OpenAPI documentation

**Endpoints**:

```
POST   /api/data/versions/check-duplicate
POST   /api/data/versions/register
GET    /api/data/versions/schema/{schemaId}
GET    /api/data/versions/{versionId}
DELETE /api/data/versions/{versionId}
```

### 5. Utilities
**Location**: `backend/src/main/java/com/example/dashboard_backend/util/`

#### VersioningUtil.java
- Helper functions for checksumming
- Methods:
  - `calculateChecksum()` - SHA-256 from data list
  - `calculateChecksumFromString()` - SHA-256 from JSON string
  - `fallbackHash()` - Simple hash fallback
  - `generateVersionId()` - Create version IDs
  - `sanitizeFileName()` - Safe filenames

## Database Schema

### data_versions Table

```sql
CREATE TABLE data_versions (
  version_id VARCHAR(255) PRIMARY KEY,
  schema_id VARCHAR(255) NOT NULL,
  schema_name VARCHAR(255) NOT NULL,
  table_name VARCHAR(255) NOT NULL,
  checksum VARCHAR(255) UNIQUE NOT NULL,
  row_count INT NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  file_name VARCHAR(255),
  version_number INT NOT NULL,
  is_duplicate BOOLEAN DEFAULT FALSE,
  original_version_id VARCHAR(255),
  created_by VARCHAR(255),
  
  FOREIGN KEY (schema_id) REFERENCES schemas(id),
  FOREIGN KEY (original_version_id) REFERENCES data_versions(version_id),
  
  UNIQUE (schema_id, checksum),
  INDEX idx_schema_id (schema_id),
  INDEX idx_checksum (checksum),
  INDEX idx_schema_version (schema_id, version_number)
);
```

### Related Table: data_uploads (Already Exists)

The existing `data_uploads` table already has some versioning support:
```sql
ALTER TABLE data_uploads ADD COLUMN IF NOT EXISTS schema_id UUID;
ALTER TABLE data_uploads ADD COLUMN IF NOT EXISTS version_number INT;
ALTER TABLE data_uploads ADD COLUMN IF NOT EXISTS data_fingerprint VARCHAR(64);
```

Both tables work in tandem:
- `data_uploads` - Original table with upload records and fingerprints
- `data_versions` - New table with structured version metadata and checksums

## Data Flow

### Upload Flow

```
1. Frontend: Upload file
   ↓
2. Frontend: Calculate checksum (simple hash)
   ↓
3. Frontend: POST /api/data/versions/check-duplicate
   ↓
4. Backend: DataVersioningController.checkDuplicate()
   ├─ Calls DataVersioningService.checkDuplicate()
   ├─ Queries DataVersioningRepository.findByChecksumAndSchema()
   ├─ Returns VersionCheckResult (isDuplicate: true/false)
   ↓
5. If duplicate: Show message, use existing version
   If new: Proceed with ingestion
   ↓
6. Frontend: POST /api/data/ingest-with-schema (existing endpoint)
   ↓
7. Backend: SchemaBasedIngestionService.ingestWithSchema()
   ├─ Validates data against schema
   ├─ Performs ingestion
   ├─ Returns IngestResponse
   ↓
8. Frontend: POST /api/data/versions/register
   ↓
9. Backend: DataVersioningController.registerVersion()
   ├─ Calls DataVersioningService.registerVersion()
   ├─ Calls DataVersioningRepository.registerVersion()
   ├─ Stores version metadata
   ├─ Returns DataVersion
   ↓
10. Frontend: Updates UI with new version
```

### Builder Load Flow

```
1. Dashboard Builder loads
   ↓
2. Frontend: GET /api/data/versions/schema/{schemaId}
   ↓
3. Backend: DataVersioningController.getVersionsBySchema()
   ├─ Calls DataVersioningService.getVersionsBySchema()
   ├─ Calls DataVersioningRepository.getVersionsBySchema()
   ├─ Returns List<DataVersion>
   ↓
4. Frontend: Shows version selector if 2+ versions exist
   ↓
5. User selects version
   ↓
6. Frontend: Uses selected versionId to fetch data
```

## Integration Points

### 1. With SchemaBasedIngestionService
After successful ingestion, call versioning service:

```java
// In SchemaBasedIngestionService.ingestWithSchema()
// After line 183, add:

DataVersioningService versioningService; // Inject this

String checksum = VersioningUtil.calculateChecksum((List<Map<String, Object>>) request.data());

RegisterVersionRequest versionRequest = new RegisterVersionRequest(
    request.schemaId(),
    schema.schemaName(),
    ingestResponse.tableName(),
    checksum,
    ingestResponse.rowsInserted(),
    request.originalFilename(),
    false, // isDuplicate
    null,  // originalVersionId
    request.userId()
);

versioningService.registerVersion(versionRequest);
```

### 2. With JsonIngestionService
Similar integration can be added to `JsonIngestionService.ingest()`:

```java
// After successful ingest
DataVersioningService versioningService;
String checksum = VersioningUtil.calculateChecksum(request.data());

RegisterVersionRequest versionRequest = new RegisterVersionRequest(
    schemaId, // Needs to be passed in request
    schemaName,
    tableName,
    checksum,
    rowCount,
    request.originalFilename(),
    false,
    null,
    request.userId()
);

versioningService.registerVersion(versionRequest);
```

## API Reference

### Check Duplicate
```
POST /api/data/versions/check-duplicate

Request:
{
  "schemaId": "schema_123",
  "checksum": "a3f5d8e2b9c1d4e6f7a8b9c0d1e2f3a4"
}

Response 200:
{
  "isDuplicate": true,
  "existingVersion": {
    "versionId": "v_456def78",
    "versionNumber": 2,
    "checksum": "a3f5d8e2b9c1d4e6f7a8b9c0d1e2f3a4",
    "rowCount": 1000,
    "uploadedAt": "2026-07-10T14:30:00",
    "fileName": "customers.json",
    "isDuplicate": false
  },
  "newChecksum": "a3f5d8e2b9c1d4e6f7a8b9c0d1e2f3a4"
}
```

### Register Version
```
POST /api/data/versions/register

Request:
{
  "schemaId": "schema_123",
  "schemaName": "customer_data",
  "tableName": "customer_data_v1",
  "checksum": "a3f5d8e2b9c1d4e6f7a8b9c0d1e2f3a4",
  "rowCount": 1000,
  "fileName": "customers.json",
  "isDuplicate": false,
  "originalVersionId": null,
  "createdBy": "user_789"
}

Response 201:
{
  "versionId": "v_abc12345",
  "schemaId": "schema_123",
  "schemaName": "customer_data",
  "tableName": "customer_data_v1",
  "checksum": "a3f5d8e2b9c1d4e6f7a8b9c0d1e2f3a4",
  "rowCount": 1000,
  "uploadedAt": "2026-07-13T10:15:30",
  "fileName": "customers.json",
  "versionNumber": 3,
  "isDuplicate": false,
  "originalVersionId": null,
  "createdBy": "user_789"
}
```

### Get Versions
```
GET /api/data/versions/schema/schema_123

Response 200:
[
  {
    "versionId": "v_abc12345",
    "schemaId": "schema_123",
    "schemaName": "customer_data",
    "tableName": "customer_data_v1",
    "checksum": "a3f5d8e2b9c1d4e6f7a8b9c0d1e2f3a4",
    "rowCount": 950,
    "uploadedAt": "2026-07-10T14:30:00",
    "fileName": "customers.json",
    "versionNumber": 1,
    "isDuplicate": false,
    "originalVersionId": null,
    "createdBy": "user_789"
  },
  {
    "versionId": "v_def67890",
    "schemaId": "schema_123",
    "versionNumber": 2,
    "rowCount": 1000,
    "uploadedAt": "2026-07-13T10:15:30",
    ...
  }
]
```

### Get Single Version
```
GET /api/data/versions/v_abc12345

Response 200:
{
  "versionId": "v_abc12345",
  ...
}
```

### Delete Version
```
DELETE /api/data/versions/v_abc12345

Response 200:
{
  "message": "Version deleted successfully",
  "versionId": "v_abc12345"
}
```

## Logging

All operations are logged at INFO level with details:
- Schema ID, version number, row counts
- Duplicate detection results
- Registration success/failure
- Any errors with stack traces at ERROR level

**Log locations**: Check `logs/application.log` (or configured location)

## Error Handling

### Validation
- Missing schemaId → 400 Bad Request
- Missing checksum → 400 Bad Request
- Invalid version ID → 404 Not Found

### Database Errors
- Constraint violations → 500 Internal Server Error
- Logged with full exception trace

### Checksumming Errors
- SHA-256 unavailable → Falls back to simple hash
- Data too large → Logged, continues with calculation

## Testing Guide

### Unit Tests
Create `DataVersioningRepositoryTest.java`:
```java
@SpringBootTest
class DataVersioningRepositoryTest {
    @Autowired
    DataVersioningRepository repository;
    
    @Test
    void testRegisterVersion() {
        // Test version registration
    }
    
    @Test
    void testFindDuplicate() {
        // Test duplicate detection
    }
}
```

### Integration Tests
```java
@SpringBootTest
class DataVersioningIntegrationTest {
    @Autowired
    TestRestTemplate restTemplate;
    
    @Test
    void testCheckDuplicateEndpoint() {
        // Test full flow
    }
}
```

### Manual Testing
```bash
# Check duplicate
curl -X POST http://localhost:8080/api/data/versions/check-duplicate \
  -H "Content-Type: application/json" \
  -d '{"schemaId":"schema_123","checksum":"abc123"}'

# Register version
curl -X POST http://localhost:8080/api/data/versions/register \
  -H "Content-Type: application/json" \
  -d '{
    "schemaId":"schema_123",
    "schemaName":"customer_data",
    "tableName":"customer_data_v1",
    "checksum":"abc123",
    "rowCount":1000,
    "fileName":"data.json",
    "isDuplicate":false,
    "createdBy":"user_123"
  }'

# Get versions
curl http://localhost:8080/api/data/versions/schema/schema_123
```

## Performance Considerations

1. **Checksum Calculation**: SHA-256 is fast for typical data sizes (< 1MB)
2. **Database Queries**: All have proper indexes (schema_id, checksum)
3. **Unique Constraints**: Prevent duplicate checksums efficiently
4. **Version Number**: Auto-increment per schema, no full scan needed

## Security Considerations

1. **Authorization**: Should add `@PreAuthorize` if user isolation is needed
2. **Input Validation**: All endpoints validate required fields
3. **SQL Injection**: Using parameterized queries throughout
4. **Logging**: No sensitive data logged, only IDs and counts

## Deployment Checklist

- [ ] Create `data_versions` table (auto-created on startup via @PostConstruct)
- [ ] Verify indexes created: `idx_schema_id`, `idx_checksum`, `idx_schema_version`
- [ ] Update `SchemaBasedIngestionService` to register versions (optional but recommended)
- [ ] Test all 5 API endpoints
- [ ] Verify duplicate detection works
- [ ] Check version numbering increments correctly
- [ ] Monitor logs for any errors
- [ ] Load test with high-volume uploads

## Troubleshooting

### Version table not created
- Check that application starts (DataVersioningRepository is autowired)
- Verify database connection working
- Check logs for @PostConstruct errors

### Duplicates not detected
- Verify checksum matches exactly (case-sensitive, hex format)
- Check schemaId in database
- Ensure index on (schema_id, checksum) exists

### Version numbers not incrementing
- Check data_versions table for correct schema_id
- Verify no manual deletes corrupting sequence
- Check database transaction handling

### Slow queries
- Verify indexes exist: `SHOW INDEX FROM data_versions`
- Check query plans: `EXPLAIN SELECT ...`
- Consider partitioning if > 1M versions
