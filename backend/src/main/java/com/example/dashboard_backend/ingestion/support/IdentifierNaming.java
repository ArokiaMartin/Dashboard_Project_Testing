package com.example.dashboard_backend.ingestion.support;

import com.example.dashboard_backend.util.SqlIdentifier;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Centralizes all rules for turning arbitrary JSON field names into safe, unique, PostgreSQL-legal
 * identifiers. Keeping this in one place means schema discovery, DDL generation and metadata
 * persistence all normalize names identically (Single Responsibility + no duplicated rules).
 */
public final class IdentifierNaming {

    private static final Pattern NON_IDENTIFIER = Pattern.compile("[^a-zA-Z0-9_]");

    private IdentifierNaming() {
    }

    /** Maps each original field to a unique, sanitized column name, preserving input order. */
    public static Map<String, String> uniqueNormalizedNames(List<String> originalFields) {
        Map<String, String> result = new LinkedHashMap<>();
        Set<String> used = new HashSet<>();

        for (String field : originalFields) {
            String base = sanitizeIdentifier(field, "column");
            String candidate = base;
            int suffix = 1;
            while (used.contains(candidate)) {
                suffix++;
                candidate = base + "_" + suffix;
            }
            used.add(candidate);
            result.put(field, candidate);
        }

        return result;
    }

    public static String sanitizeIdentifier(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }

        // Preserve word boundaries before lower-casing so nested camelCase keys such as
        // "focusIndicatorEvidence.changedPixelRatio" become a readable snake_case identifier
        // ("focus_indicator_evidence_changed_pixel_ratio") instead of a mashed lowercase blob
        // ("focusindicatorevidence_changedpixelratio").
        String spaced = value.trim()
                .replaceAll("([a-z0-9])([A-Z])", "$1_$2")       // camelCase  -> camel_Case
                .replaceAll("([A-Z]+)([A-Z][a-z])", "$1_$2");   // HTMLParser -> HTML_Parser

        String cleaned = NON_IDENTIFIER.matcher(spaced.toLowerCase(Locale.ROOT)).replaceAll("_");
        cleaned = cleaned.replaceAll("_+", "_").replaceAll("^_+", "").replaceAll("_+$", "");

        if (cleaned.isBlank()) {
            cleaned = fallback;
        }

        if (Character.isDigit(cleaned.charAt(0))) {
            cleaned = "c_" + cleaned;
        }

        if (cleaned.length() > 55) {
            cleaned = cleaned.substring(0, 55);
        }

        return cleaned;
    }

    public static String quoteIdentifier(String identifier) {
        return SqlIdentifier.quote(identifier);
    }

    public static String truncateForPostgres(String identifier) {
        return identifier.length() > 63 ? identifier.substring(0, 63) : identifier;
    }

    public static String shortId(UUID id, int length) {
        return id.toString().replace("-", "").substring(0, length);
    }
}
