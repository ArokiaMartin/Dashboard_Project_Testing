package com.example.dashboard_backend.util;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.Map;

/**
 * Utility functions for data versioning and checksumming.
 * Provides both simple hashing (frontend-compatible) and SHA-256 checksums.
 */
public class VersioningUtil {

    private static final Logger logger = LoggerFactory.getLogger(VersioningUtil.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Calculate SHA-256 checksum of the data.
     * Used for duplicate detection and version integrity.
     */
    public static String calculateChecksum(List<Map<String, Object>> data) {
        try {
            String jsonStr = objectMapper.writeValueAsString(data);
            return calculateChecksumFromString(jsonStr);
        } catch (Exception e) {
            logger.error("Error calculating checksum from data", e);
            return fallbackHash(data.toString());
        }
    }

    /**
     * Calculate SHA-256 checksum from JSON string.
     */
    public static String calculateChecksumFromString(String jsonStr) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] messageDigest = md.digest(jsonStr.getBytes());
            StringBuilder sb = new StringBuilder();
            for (byte b : messageDigest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            logger.error("SHA-256 algorithm not available", e);
            return fallbackHash(jsonStr);
        }
    }

    /**
     * Simple fallback hash when SHA-256 is unavailable.
     * Frontend-compatible, returns hex string.
     */
    public static String fallbackHash(String data) {
        int hash = data.hashCode();
        return String.format("%x", Math.abs(hash));
    }

    /**
     * Extract row count from data list.
     */
    public static int getRowCount(List<?> data) {
        return data != null ? data.size() : 0;
    }

    /**
     * Generate version ID (frontend-compatible format).
     */
    public static String generateVersionId() {
        return "v_" + java.util.UUID.randomUUID().toString().substring(0, 8);
    }

    /**
     * Sanitize filename to be database-safe.
     */
    public static String sanitizeFileName(String fileName) {
        if (fileName == null) {
            return "unknown.json";
        }
        return fileName.replaceAll("[^a-zA-Z0-9._-]", "_");
    }
}
