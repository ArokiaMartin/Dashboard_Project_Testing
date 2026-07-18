package com.example.dashboard_backend.ingestion.metadata;

import com.example.dashboard_backend.ingestion.model.Schema;
import com.example.dashboard_backend.ingestion.model.SchemaField;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SchemaRepository {

    Schema save(Schema schema);

    Optional<Schema> findById(UUID id);

    List<Schema> findByUserId(UUID userId);

    List<Schema> findByUserIdAndStatus(UUID userId, String status);

    Optional<Schema> findLatestByNameAndUserId(String schemaName, UUID userId);

    void delete(UUID schemaId);

    void updateStatus(UUID schemaId, String status);

    void saveFields(UUID schemaId, List<SchemaField> fields);

    List<SchemaField> findFieldsBySchemaId(UUID schemaId);

    void recordAuditLog(UUID schemaId, String action, String oldDef, String newDef, String changedBy, String reason);

    boolean existsByNameAndUserId(String schemaName, UUID userId);
}
