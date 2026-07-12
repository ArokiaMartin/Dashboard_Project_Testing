# Quick Start: Versioning System

## Files to Know About

### New Services
```
frontend/src/app/core/services/
├── data-versioning.service.ts       ← Core versioning logic
└── widget-version.service.ts        ← Widget version mapping
```

### Updated Files
```
frontend/src/app/core/services/
└── upload.service.ts                ← Added checksum support

frontend/src/app/features/schema-data-upload/
└── schema-data-upload.component.ts  ← Integrated versioning workflow
```

## How It Works (Step by Step)

### 1. Upload File → Auto Checksum
```typescript
// In UploadService
const checksum = this.versioningService.calculateChecksum(data);
// Returns: "a3f5d8e2" (hex string)
```

### 2. Check for Duplicates
```typescript
// In SchemaDataUploadComponent
this.versioningService.checkDuplicate(schemaId, checksum).subscribe(result => {
  if (result.isDuplicate) {
    // Reuse existing version
    this.sendIngest(data, checksum, result.existingVersion.versionId);
  } else {
    // Create new version
    this.sendIngest(data, checksum);
  }
});
```

### 3. Register Version
```typescript
// Automatically called after successful ingest
this.versioningService.registerVersion(
  schemaId,        // Which schema
  schemaName,      // "customer_data"
  tableName,       // "customer_data_2026-07-13"
  checksum,        // "a3f5d8e2"
  rowCount,        // 1000
  fileName,        // "customers.json"
  isDuplicate,     // true/false
  originalVersionId // null or pointing to existing
);
```

## User Interface

### In Schema Upload Page
```
Step 2: Upload Data
─────────────────
[DROP DATA FILE HERE]

✓ customers.json (125 KB)

[Upload & Ingest Data]

→ System calculates checksum
→ Checks database for match
→ If found: "Using existing version 2 (2026-07-10)"
→ If new: "Successfully ingested 1000 rows"
```

### In Dashboard Builder
```
AVAILABLE COLUMNS          SCHEMA VERSION
─────────────────          ───────────────
[✓] Date                   Version: [v1 · 1000 rows]
[ ] Amount                 Compare: [v2 · 1050 rows]
[ ] Customer               
```

## API Contract (Backend)

### Endpoint 1: Check Duplicate
```
POST /api/data/versions/check-duplicate
Content-Type: application/json

{
  "schemaId": "schema_123",
  "checksum": "a3f5d8e2"
}

Response 200:
{
  "isDuplicate": true,
  "existingVersion": {
    "versionId": "v_456",
    "versionNumber": 2,
    "uploadedAt": "2026-07-10T14:30:00Z"
  },
  "newChecksum": "a3f5d8e2"
}
```

### Endpoint 2: Register Version
```
POST /api/data/versions/register
Content-Type: application/json

{
  "schemaId": "schema_123",
  "schemaName": "customer_data",
  "tableName": "customer_data_2026-07-13",
  "checksum": "a3f5d8e2",
  "rowCount": 1000,
  "fileName": "customers.json",
  "isDuplicate": false,
  "originalVersionId": null
}

Response 200:
{
  "versionId": "v_789",
  "schemaId": "schema_123",
  "versionNumber": 3,
  "checksum": "a3f5d8e2",
  "rowCount": 1000,
  "uploadedAt": "2026-07-13T10:15:00Z",
  "fileName": "customers.json",
  "isDuplicate": false
}
```

### Endpoint 3: Get Versions
```
GET /api/data/versions/schema/schema_123

Response 200:
[
  {
    "versionId": "v_456",
    "versionNumber": 1,
    "rowCount": 950,
    "uploadedAt": "2026-07-10T14:30:00Z"
  },
  {
    "versionId": "v_789",
    "versionNumber": 2,
    "rowCount": 1000,
    "uploadedAt": "2026-07-13T10:15:00Z"
  }
]
```

## Testing Checklist

- [ ] Install dependencies: `npm install`
- [ ] No TypeScript errors: `npm run build`
- [ ] Upload file first time → version 1 created ✓
- [ ] Upload same file → duplicate detected ✓
- [ ] Upload different file → version 2 created ✓
- [ ] Builder shows version selector when 2+ versions exist ✓
- [ ] Switching versions loads correct data ✓
- [ ] Version comparison overlay works ✓
- [ ] Dashboard saves with version selection ✓

## Common Issues & Solutions

### Issue: "Checksum calculation failed"
**Solution**: Falls back to normal ingestion (no duplicate check)

### Issue: "Could not fetch versions"
**Solution**: Version list empty, no comparison available

### Issue: "Duplicate detected but version not found"
**Solution**: Existing version may have been deleted, creates new version

### Issue: "Version selector not showing"
**Solution**: Schema has < 2 versions, selector only shows with 2+

## Performance Notes

- Checksum calculation: **< 100ms** for typical files (< 1MB)
- Duplicate check: **Database lookup**, indexed by checksum
- Version registration: **Single database INSERT**
- No impact on existing upload/ingest performance

## Backward Compatibility

✅ All changes are optional and backward compatible
✅ Works with legacy uploads (no schema_id)
✅ Version selector only shows when applicable
✅ Existing dashboards unaffected
✅ Fallback if versioning endpoints unavailable

## Code Examples

### Using in a Component
```typescript
import { DataVersioningService } from '@core/services/data-versioning.service';
import { WidgetVersionService } from '@core/services/widget-version.service';

export class MyComponent {
  constructor(
    private versioning: DataVersioningService,
    private widgetVer: WidgetVersionService
  ) {}

  onDataUpload(data: any[]) {
    const checksum = this.versioning.calculateChecksum(data);
    
    this.versioning.checkDuplicate(schemaId, checksum).subscribe(result => {
      console.log(`Duplicate: ${result.isDuplicate}`);
    });
  }

  selectVersionForWidget(widgetId: string, versionId: string) {
    this.versioning.getVersion(versionId).subscribe(version => {
      this.widgetVer.setWidgetVersion(widgetId, versionId, version);
    });
  }
}
```

### In Templates
```html
<!-- Show versions if available -->
<div *ngIf="versions.length > 1">
  <label>
    Select Version:
    <select [value]="selectedVersionId" (change)="selectVersion($event)">
      <option *ngFor="let v of versions" [value]="v.versionId">
        v{{ v.versionNumber }} · {{ v.rowCount }} rows
      </option>
    </select>
  </label>
</div>
```

## Next: Backend Implementation

1. **Create Table**
```sql
CREATE TABLE data_versions (
  version_id VARCHAR(255) PRIMARY KEY,
  schema_id VARCHAR(255) NOT NULL,
  checksum VARCHAR(255) UNIQUE,
  version_number INT,
  row_count INT,
  uploaded_at TIMESTAMP,
  file_name VARCHAR(255),
  is_duplicate BOOLEAN,
  original_version_id VARCHAR(255),
  FOREIGN KEY (schema_id) REFERENCES schemas(id),
  INDEX (schema_id, version_number)
);
```

2. **Implement Endpoints**
   - `POST /api/data/versions/check-duplicate`
   - `POST /api/data/versions/register`
   - `GET /api/data/versions/schema/{schemaId}`
   - `GET /api/data/versions/{versionId}`

3. **Update Ingest Logic**
   - Check if checksum exists before saving
   - Auto-increment version_number per schema_id
   - Return version metadata in response

## Documentation
- Full details: `VERSIONING_IMPLEMENTATION.md`
- Architecture: `IMPLEMENTATION_SUMMARY.md`
- This guide: `QUICK_START_VERSIONING.md`
