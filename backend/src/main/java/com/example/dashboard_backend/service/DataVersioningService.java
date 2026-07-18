package com.example.dashboard_backend.service;

import com.example.dashboard_backend.ingestion.metadata.DataVersioningRepository;
import com.example.dashboard_backend.model.DataVersion;
import com.example.dashboard_backend.model.VersionCheckResult;
import com.example.dashboard_backend.model.CheckDuplicateRequest;
import com.example.dashboard_backend.model.RegisterVersionRequest;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Optional;

/**
 * Manages data versioning with checksum-based deduplication.
 * Prevents duplicate uploads from creating redundant versions,
 * tracks version metadata, and enables version comparison in dashboards.
 */
@Service
public class DataVersioningService {

    private static final Logger logger = LoggerFactory.getLogger(DataVersioningService.class);
    private final DataVersioningRepository repository;

    public DataVersioningService(DataVersioningRepository repository) {
        this.repository = repository;
    }

    /**
     * Check if data with this checksum already exists for the schema.
     * Returns existing version if duplicate found, otherwise indicates new data.
     */
    public VersionCheckResult checkDuplicate(CheckDuplicateRequest request) {
        logger.info("Checking for duplicate: schema={}, checksum={}", request.schemaId(), request.checksum());

        Optional<DataVersion> existing = repository.findByChecksumAndSchema(request.schemaId(), request.checksum());

        if (existing.isPresent()) {
            logger.info("Duplicate found: version={}, schemaId={}", existing.get().versionId(), request.schemaId());
            return new VersionCheckResult(true, existing.get(), request.checksum());
        }

        logger.info("No duplicate found, new data: checksum={}", request.checksum());
        return new VersionCheckResult(false, null, request.checksum());
    }

    /**
     * Register a new data version with checksum and metadata.
     * If isDuplicate=true, originalVersionId points to the reused version.
     */
    public DataVersion registerVersion(RegisterVersionRequest request) {
        logger.info("Registering version: schema={}, isDuplicate={}, filename={}",
                request.schemaId(), request.isDuplicate(), request.fileName());

        DataVersion version = repository.registerVersion(
                request.schemaId(),
                request.schemaName(),
                request.tableName(),
                request.checksum(),
                request.rowCount(),
                request.fileName(),
                request.isDuplicate(),
                request.originalVersionId(),
                request.createdBy()
        );

        logger.info("Version registered: id={}, number={}, rows={}",
                version.versionId(), version.versionNumber(), version.rowCount());

        return version;
    }

    /**
     * Get all versions for a schema, ordered by version number (oldest to newest).
     */
    public List<DataVersion> getVersionsBySchema(String schemaId) {
        logger.info("Fetching versions for schema: {}", schemaId);
        List<DataVersion> versions = repository.getVersionsBySchema(schemaId);
        logger.info("Found {} versions for schema: {}", versions.size(), schemaId);
        return versions;
    }

    /**
     * Get a specific version by ID.
     */
    public Optional<DataVersion> getVersion(String versionId) {
        logger.info("Fetching version: {}", versionId);
        return repository.getVersionById(versionId);
    }

    /**
     * Delete a version (useful for cleanup or removing corrupted uploads).
     */
    public boolean deleteVersion(String versionId) {
        logger.info("Deleting version: {}", versionId);
        return repository.deleteVersion(versionId) > 0;
    }

    /**
     * Calculate SHA-256 checksum of data.
     * Note: Frontend already calculates simple hash; backend uses this for verification.
     */
    public static String calculateChecksum(String jsonData) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] messageDigest = md.digest(jsonData.getBytes());
            StringBuilder sb = new StringBuilder();
            for (byte b : messageDigest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            logger.error("SHA-256 algorithm not available", e);
            // Fallback to simple hash
            return String.valueOf(jsonData.hashCode());
        }
    }
}
