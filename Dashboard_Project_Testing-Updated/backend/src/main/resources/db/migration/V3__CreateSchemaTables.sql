-- Schema management tables for enterprise-level data handling

-- Stores user-defined schemas (JSON Schema format or custom schema definition)
CREATE TABLE IF NOT EXISTS schemas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    schema_name VARCHAR(255) NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    schema_definition JSONB NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    CONSTRAINT unique_schema_per_user UNIQUE(user_id, schema_name, schema_version)
);

-- Audit trail for schema changes
CREATE TABLE IF NOT EXISTS schema_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_id UUID NOT NULL REFERENCES schemas(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    old_definition JSONB,
    new_definition JSONB,
    changed_by VARCHAR(255),
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason TEXT
);

-- Tracks data ingestion operations linked to schemas
CREATE TABLE IF NOT EXISTS schema_data_ingestion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_id UUID NOT NULL REFERENCES schemas(id),
    upload_id UUID NOT NULL,
    data_file_name VARCHAR(255),
    rows_ingested BIGINT,
    validation_status VARCHAR(50) NOT NULL,
    validation_errors JSONB,
    ingestion_started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ingestion_completed_at TIMESTAMP,
    ingested_by VARCHAR(255),
    CONSTRAINT fk_upload_to_data_uploads FOREIGN KEY(upload_id) REFERENCES data_uploads(id)
);

-- Schema field definitions (denormalized for quick access)
CREATE TABLE IF NOT EXISTS schema_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_id UUID NOT NULL REFERENCES schemas(id) ON DELETE CASCADE,
    field_name VARCHAR(255) NOT NULL,
    field_type VARCHAR(50) NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT false,
    is_dimension BOOLEAN,
    is_measure BOOLEAN,
    description TEXT,
    validation_rules JSONB,
    position INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_field_per_schema UNIQUE(schema_id, field_name)
);

-- Indexes for performance
CREATE INDEX idx_schemas_user_id ON schemas(user_id);
CREATE INDEX idx_schemas_status ON schemas(status);
CREATE INDEX idx_schemas_created_at ON schemas(created_at DESC);
CREATE INDEX idx_schema_audit_schema_id ON schema_audit_log(schema_id);
CREATE INDEX idx_schema_ingestion_schema_id ON schema_data_ingestion(schema_id);
CREATE INDEX idx_schema_ingestion_upload_id ON schema_data_ingestion(upload_id);
CREATE INDEX idx_schema_fields_schema_id ON schema_fields(schema_id);

-- Comments
COMMENT ON TABLE schemas IS 'Enterprise schema repository for defining data structure before ingestion';
COMMENT ON TABLE schema_audit_log IS 'Audit trail for schema modifications and governance';
COMMENT ON TABLE schema_data_ingestion IS 'Records data ingestions performed against specific schemas';
COMMENT ON TABLE schema_fields IS 'Field-level schema metadata with validation rules';
