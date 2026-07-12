# Data Versioning Implementation Guide

## Overview
This implementation adds checksum-based versioning to the Dashboard Project, enabling:
1. **Duplication Detection**: Automatically detects when uploaded data is identical to a previous version
2. **Version Tracking**: Maintains version metadata with checksums for each data upload
3. **Version Selection**: Users can select which version to use when building widgets
4. **Smart Naming**: Versions are automatically named by upload date (configurable)

## Architecture

### New Services

#### 1. DataVersioningService (`data-versioning.service.ts`)
**Purpose**: Manages data versioning with checksum-based deduplication

**Key Methods**:
- `calculateChecksum(data: any[]): string` - Generates a checksum for uploaded data
- `checkDuplicate(schemaId: string, checksum: string): Observable<VersionCheckResult>` - Checks if data matches existing version
- `registerVersion(...)` - Registers a new version with metadata
- `getVersionsBySchema(schemaId: string)` - Retrieves all versions for a schema
- `getVersion(versionId: string)` - Gets specific version details

**Key Interfaces**:
```typescript
export interface DataVersion {
  versionId: string;
  schemaId: string;
  schemaName: string;
  tableName: string;
  checksum: string;
  rowCount: number;
  uploadedAt: string;
  fileName: string;
  versionNumber: number;
  isDuplicate: boolean;
  originalVersionId?: string; // Points to the original if this is a duplicate
}

export interface VersionCheckResult {
  isDuplicate: boolean;
  existingVersion?: DataVersion;
  newChecksum: string;
}
```

#### 2. WidgetVersionService (`widget-version.service.ts`)
**Purpose**: Manages version selection for individual widgets

**Key Methods**:
- `setWidgetVersion(widgetId, versionId, version)` - Sets the version for a widget
- `getWidgetVersion(widgetId)` - Retrieves the selected version for a widget
- `getAllWidgetVersions()` - Gets all widget-version mappings
- `clearWidgetVersion(widgetId)` - Removes version selection for a widget
- `clearAllVersions()` - Resets all widget version selections

### Updated Services

#### UploadService (`upload.service.ts`)
**Changes**:
- Added `lastChecksum` property to track checksum of current data
- Added `getChecksum()` method to calculate checksum for loaded tables
- Injected `DataVersioningService` for checksum operations

### Updated Components

#### SchemaDataUploadComponent (`schema-data-upload.component.ts`)
**New Properties**:
```typescript
versions: DataVersion[] = [];
selectedVersionId: string = '';
checkingDuplicate = false;
isDuplicate = false;
duplicateMessage = '';
```

**New Methods**:
- `checkAndIngestData(data)` - Checks for duplicates before ingestion
- `loadVersionsForSchema(schemaId)` - Loads versions for the selected schema
- Updated `sendIngest()` to register versions after successful ingestion

**Data Flow**:
1. User uploads a file
2. File is parsed into data array
3. Checksum is calculated
4. Checksum is checked against existing versions
5. If duplicate found, existing version is reused (message shown to user)
6. If new data, it's ingested and registered as a new version
7. Version list is refreshed for the schema

## Backend API Requirements

### New Endpoints Needed

#### 1. Check Duplicate
```
POST /api/data/versions/check-duplicate
Request:
{
  schemaId: string,
  checksum: string
}
Response: VersionCheckResult
```

#### 2. Register Version
```
POST /api/data/versions/register
Request:
{
  schemaId: string,
  schemaName: string,
  tableName: string,
  checksum: string,
  rowCount: number,
  fileName: string,
  isDuplicate: boolean,
  originalVersionId?: string
}
Response: DataVersion
```

#### 3. Get Versions by Schema
```
GET /api/data/versions/schema/{schemaId}
Response: DataVersion[]
```

#### 4. Get Single Version
```
GET /api/data/versions/{versionId}
Response: DataVersion
```

## Database Schema Updates

### New Table: data_versions
```sql
CREATE TABLE data_versions (
  version_id VARCHAR(255) PRIMARY KEY,
  schema_id VARCHAR(255) NOT NULL,
  schema_name VARCHAR(255) NOT NULL,
  table_name VARCHAR(255) NOT NULL,
  checksum VARCHAR(255) NOT NULL UNIQUE,
  row_count INTEGER NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  file_name VARCHAR(255),
  version_number INTEGER NOT NULL,
  is_duplicate BOOLEAN DEFAULT FALSE,
  original_version_id VARCHAR(255),
  created_by VARCHAR(255),
  FOREIGN KEY (schema_id) REFERENCES schemas(schema_id),
  FOREIGN KEY (original_version_id) REFERENCES data_versions(version_id),
  INDEX idx_schema_id (schema_id),
  INDEX idx_checksum (checksum),
  INDEX idx_version_number (schema_id, version_number)
);
```

## Usage Flow

### For Users (Frontend)

1. **Upload Data**
   - Navigate to schema data upload
   - Upload schema (creates schema with ID)
   - Upload data file
   - System automatically:
     - Calculates checksum
     - Checks for duplicates
     - Shows message if duplicate found
     - Registers version if new data

2. **Select Version in Builder**
   - Open dashboard builder
   - Select dataset from picker
   - If multiple versions exist, version selector appears
   - User can switch between versions
   - Can optionally select a comparison version to overlay

3. **Version Comparison**
   - Primary version is used for all calculations
   - Comparison version (optional) is overlaid on bar/line/radar charts
   - Comparison data is fetched separately on selection

### For Developers

#### Integration in New Features

```typescript
// Inject the services
constructor(
  private versioningService: DataVersioningService,
  private widgetVersionService: WidgetVersionService
) {}

// Calculate checksum
const checksum = this.versioningService.calculateChecksum(data);

// Check for duplicates
this.versioningService.checkDuplicate(schemaId, checksum).subscribe(result => {
  if (result.isDuplicate) {
    console.log('Data matches:', result.existingVersion?.versionNumber);
  }
});

// Register a new version
this.versioningService.registerVersion(
  schemaId,
  schemaName,
  tableName,
  checksum,
  rowCount,
  fileName,
  false // isDuplicate
).subscribe(version => {
  console.log('Registered version:', version.versionNumber);
});

// Set widget version
this.widgetVersionService.setWidgetVersion(widgetId, versionId, version);
```

## Error Handling

1. **Checksum Calculation Fails**: Falls through to normal ingestion (no duplication check)
2. **Duplicate Check Fails**: Falls through to normal ingestion
3. **Registration Fails**: Logged to console, doesn't block successful ingestion
4. **Version Fetch Fails**: Gracefully returns empty array

## Backward Compatibility

- All changes are **additive** - no breaking changes to existing services
- Existing upload/ingestion flows work unchanged
- Version selection is **optional** - only shows when multiple versions exist
- Dashboard builder version controls integrate with existing version selector UI
- No modifications to existing data structures or API contracts

## Testing Checklist

- [ ] Single file upload creates version 1
- [ ] Same file upload detected as duplicate, reuses existing version
- [ ] Different file creates version 2 (same schema)
- [ ] Schema with 2+ versions shows version selector in builder
- [ ] Version switching loads correct data
- [ ] Version comparison overlay works on compatible charts
- [ ] Version metadata is correctly stored (checksum, filename, etc.)
- [ ] Dashboard save preserves version selection
- [ ] No impact on dashboards without schema_id (legacy data)

## Performance Considerations

1. **Checksum Calculation**: O(n) where n = size of data (single pass JSON.stringify)
2. **Duplicate Check**: Database lookup by checksum (indexed) - O(1)
3. **Version Registration**: Single INSERT + possible UPDATE
4. **Version List Load**: Single SELECT with schema_id filter

## Future Enhancements

1. **Advanced Checksumming**: Replace simple hash with crypto-based checksums
2. **Incremental Versioning**: Track only row changes between versions
3. **Version Merge**: Combine multiple versions intelligently
4. **Version Rollback**: Revert to previous versions in dashboards
5. **Change Detection**: Show detailed diff between versions
6. **Version Schedules**: Automated versioning on data refresh
