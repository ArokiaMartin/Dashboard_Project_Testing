package com.example.dashboard_backend.service;

import com.example.dashboard_backend.ingestion.metadata.SchemaRepository;
import com.example.dashboard_backend.ingestion.model.Schema;
import com.example.dashboard_backend.ingestion.model.SchemaField;
import com.example.dashboard_backend.ingestion.schema.SchemaValidationService;
import com.example.dashboard_backend.exception.NotFoundException;
import com.example.dashboard_backend.model.SchemaResponse;
import com.example.dashboard_backend.model.SchemaUploadRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class SchemaManagementService {

    private static final Logger log = LoggerFactory.getLogger(SchemaManagementService.class);
    private final SchemaRepository schemaRepository;
    private final SchemaValidationService validationService;
    private final ObjectMapper objectMapper;

    public SchemaManagementService(
        SchemaRepository schemaRepository,
        SchemaValidationService validationService,
        ObjectMapper objectMapper
    ) {
        this.schemaRepository = schemaRepository;
        this.validationService = validationService;
        this.objectMapper = objectMapper;
    }

    public SchemaResponse getSchema(UUID schemaId) {
        Schema schema = schemaRepository.findById(schemaId)
            .orElseThrow(() -> new IllegalArgumentException("Schema not found: " + schemaId));

        return toSchemaResponse(schema, null);
    }

    public List<SchemaResponse> listSchemasByUser(UUID userId) {
        return schemaRepository.findByUserIdAndStatus(userId, "ACTIVE")
            .stream()
            .map(s -> toSchemaResponse(s, null))
            .collect(Collectors.toList());
    }

    public void deleteSchema(UUID schemaId, UUID requesterId, String deletedBy) {
        Schema schema = schemaRepository.findById(schemaId)
            .orElseThrow(() -> new NotFoundException("Schema not found: " + schemaId));

        // Ownership check: a caller may only delete a schema they own. Return "not found" rather than
        // "forbidden" so we don't reveal the existence of another user's schema.
        if (requesterId != null && schema.userId() != null && !schema.userId().equals(requesterId)) {
            throw new NotFoundException("Schema not found: " + schemaId);
        }

        schemaRepository.recordAuditLog(
            schemaId,
            "DELETE",
            objectMapper.valueToTree(schema.schemaDefinition()).toString(),
            null,
            deletedBy,
            "Schema deleted"
        );

        schemaRepository.delete(schemaId);
        log.info("Schema {} deleted by {}", schemaId, deletedBy);
    }

    public SchemaValidationService.ValidationResult validateData(UUID schemaId, JsonNode data) {
        Schema schema = schemaRepository.findById(schemaId)
            .orElseThrow(() -> new IllegalArgumentException("Schema not found: " + schemaId));

        return validationService.validateDataAgainstSchema(schema, data);
    }

    public SchemaValidationService.ValidationResult validateDataByName(UUID userId, String schemaName, JsonNode data) {
        Schema schema = schemaRepository.findLatestByNameAndUserId(schemaName, userId)
            .orElseThrow(() -> new IllegalArgumentException("Schema not found: " + schemaName));

        return validationService.validateDataAgainstSchema(schema, data);
    }

    public SchemaResponse uploadSchema(UUID userId, SchemaUploadRequest request, String createdBy) {
        List<SchemaField> fields = new ArrayList<>();
        for (int i = 0; i < request.fields().size(); i++) {
            SchemaUploadRequest.FieldDefinition fieldDef = request.fields().get(i);
            SchemaField field = SchemaField.create(
                null,
                fieldDef.fieldName(),
                fieldDef.fieldType(),
                fieldDef.isRequired(),
                fieldDef.isDimension(),
                fieldDef.isMeasure(),
                fieldDef.isPrimaryKey(),
                fieldDef.description(),
                fieldDef.validationRules(),
                i
            );
            fields.add(field);
        }

        Optional<Schema> existing = schemaRepository.findLatestByNameAndUserId(request.schemaName(), userId);
        if (existing.isPresent()) {
            Schema current = existing.get();

            // No structural change (same fields/types/flags): update definition in place, keep version.
            if (structureSignature(current.fields()).equals(structureSignature(fields))) {
                Schema updatedSchema = new Schema(
                    current.id(),
                    userId,
                    request.schemaName(),
                    current.schemaVersion(),
                    request.schemaDefinition(),
                    request.description(),
                    "ACTIVE",
                    fields,
                    current.createdAt(),
                    LocalDateTime.now(),
                    current.createdBy(),
                    createdBy
                );

                Schema savedSchema = schemaRepository.save(updatedSchema);
                schemaRepository.saveFields(savedSchema.id(), fields);
                schemaRepository.recordAuditLog(
                    savedSchema.id(),
                    "UPDATE",
                    null,
                    objectMapper.valueToTree(request.schemaDefinition()).toString(),
                    createdBy,
                    "Schema re-uploaded without structural changes"
                );

                log.info("Schema '{}' updated in place (version {} retained) by {}",
                    request.schemaName(), savedSchema.schemaVersion(), createdBy);
                return toSchemaResponse(savedSchema,
                    "Schema updated (no structural change; version " + savedSchema.schemaVersion() + " retained)");
            }

            // Structural change: create a new version and supersede the previous one.
            int newVersion = current.schemaVersion() + 1;
            Schema newVersionSchema = new Schema(
                UUID.randomUUID(),
                userId,
                request.schemaName(),
                newVersion,
                request.schemaDefinition(),
                request.description(),
                "ACTIVE",
                fields,
                LocalDateTime.now(),
                LocalDateTime.now(),
                createdBy,
                createdBy
            );

            Schema savedSchema = schemaRepository.save(newVersionSchema);
            schemaRepository.saveFields(savedSchema.id(), fields);
            schemaRepository.updateStatus(current.id(), "SUPERSEDED");
            schemaRepository.recordAuditLog(
                savedSchema.id(),
                "VERSION",
                objectMapper.valueToTree(current.schemaDefinition()).toString(),
                objectMapper.valueToTree(request.schemaDefinition()).toString(),
                createdBy,
                "New schema version " + newVersion + " created (previous version "
                    + current.schemaVersion() + " superseded)"
            );

            log.info("Schema '{}' new version {} created by {} (v{} superseded)",
                request.schemaName(), newVersion, createdBy, current.schemaVersion());
            return toSchemaResponse(savedSchema, "New schema version " + newVersion + " created");
        }

        Schema schema = Schema.create(
            userId,
            request.schemaName(),
            request.schemaDefinition(),
            request.description(),
            fields,
            createdBy
        );

        Schema savedSchema = schemaRepository.save(schema);
        schemaRepository.saveFields(savedSchema.id(), fields);

        log.info("Schema '{}' created successfully by {}", request.schemaName(), createdBy);

        return toSchemaResponse(savedSchema, "Schema created successfully");
    }

    /**
     * Builds a stable signature of a schema's structure (field name, type and role flags) so a
     * re-upload can be classified as an in-place update (same signature) or a new version
     * (different signature). Description and validation-rule metadata are intentionally excluded.
     */
    private static String structureSignature(List<SchemaField> fields) {
        return fields.stream()
            .sorted(Comparator.comparing(f -> f.position() == null ? 0 : f.position()))
            .map(f -> f.fieldName()
                + "|" + f.fieldType()
                + "|" + Boolean.TRUE.equals(f.isRequired())
                + "|" + Boolean.TRUE.equals(f.isDimension())
                + "|" + Boolean.TRUE.equals(f.isMeasure())
                + "|" + Boolean.TRUE.equals(f.isPrimaryKey()))
            .collect(Collectors.joining(";"));
    }

    private SchemaResponse toSchemaResponse(Schema schema, String message) {
        List<SchemaResponse.FieldResponse> fieldResponses = schema.fields().stream()
            .map(f -> new SchemaResponse.FieldResponse(
                f.id(),
                f.fieldName(),
                f.fieldType(),
                f.isRequired(),
                f.isDimension(),
                f.isMeasure(),
                f.isPrimaryKey(),
                f.description(),
                f.position()
            ))
            .collect(Collectors.toList());

        return new SchemaResponse(
            schema.id(),
            schema.schemaName(),
            schema.schemaVersion(),
            schema.status(),
            schema.description(),
            fieldResponses,
            schema.createdAt(),
            schema.updatedAt(),
            schema.createdBy(),
            message
        );
    }
}
