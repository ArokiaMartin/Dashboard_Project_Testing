package com.example.dashboard_backend.ingestion.support;

import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Locale;

/**
 * Type inference and value coercion for individual JSON values. Groups all the "what type is this
 * value / how do I render or bind it" rules so schema discovery, CSV staging and JDBC binding share
 * exactly one implementation.
 */
public final class JsonValueSupport {

    private JsonValueSupport() {
    }

    public static boolean isNumericValue(JsonNode value) {
        if (value.isNumber()) {
            return true;
        }
        if (value.isTextual()) {
            try {
                new BigDecimal(value.asText().trim());
                return true;
            } catch (NumberFormatException ignored) {
                return false;
            }
        }
        return false;
    }

    public static boolean isBooleanValue(JsonNode value) {
        if (value.isBoolean()) {
            return true;
        }
        if (value.isTextual()) {
            String normalized = value.asText().trim().toLowerCase(Locale.ROOT);
            return "true".equals(normalized) || "false".equals(normalized)
                    || "1".equals(normalized) || "0".equals(normalized)
                    || "yes".equals(normalized) || "no".equals(normalized)
                    || "y".equals(normalized) || "n".equals(normalized);
        }
        return false;
    }

    public static boolean isDateValue(JsonNode value) {
        if (value.isNumber()) {
            return true;
        }
        if (!value.isTextual()) {
            return false;
        }
        String raw = value.asText().trim();
        if (raw.isEmpty()) {
            return false;
        }
        try {
            Instant.parse(raw);
            return true;
        } catch (DateTimeParseException ignored) {
        }
        try {
            OffsetDateTime.parse(raw);
            return true;
        } catch (DateTimeParseException ignored) {
        }
        try {
            LocalDateTime.parse(raw);
            return true;
        } catch (DateTimeParseException ignored) {
        }
        try {
            LocalDate.parse(raw);
            return true;
        } catch (DateTimeParseException ignored) {
        }
        return false;
    }

    public static Boolean coerceBoolean(JsonNode value) {
        if (value.isBoolean()) {
            return value.booleanValue();
        }
        String text = value.asText().trim().toLowerCase(Locale.ROOT);
        if (text.equals("true") || text.equals("1") || text.equals("yes") || text.equals("y")) return true;
        if (text.equals("false") || text.equals("0") || text.equals("no") || text.equals("n")) return false;
        return null;
    }

    public static Timestamp parseTimestamp(JsonNode value) {
        if (value == null || value.isNull()) {
            return null;
        }
        if (value.isNumber()) {
            long epoch = value.numberValue().longValue();
            if (String.valueOf(Math.abs(epoch)).length() <= 10) {
                return Timestamp.from(Instant.ofEpochSecond(epoch));
            }
            return Timestamp.from(Instant.ofEpochMilli(epoch));
        }

        String text = value.asText().trim();
        if (text.isEmpty()) {
            return null;
        }

        try {
            return Timestamp.from(Instant.parse(text));
        } catch (DateTimeParseException ignored) {
        }
        try {
            return Timestamp.from(OffsetDateTime.parse(text).toInstant());
        } catch (DateTimeParseException ignored) {
        }
        try {
            return Timestamp.valueOf(LocalDateTime.parse(text));
        } catch (DateTimeParseException ignored) {
        }
        try {
            return Timestamp.valueOf(LocalDate.parse(text).atStartOfDay());
        } catch (DateTimeParseException ignored) {
        }
        return null;
    }

    public static String formatForCsv(JsonNode value, String fieldType) {
        if (value == null || value.isNull() || value.isMissingNode()) {
            return null;
        }
        return switch (fieldType) {
            case "numeric" -> {
                try {
                    yield new BigDecimal(value.isNumber() ? value.numberValue().toString() : value.asText().trim()).toPlainString();
                } catch (NumberFormatException e) {
                    yield null;
                }
            }
            case "boolean" -> {
                Boolean b = coerceBoolean(value);
                yield b == null ? null : b.toString();
            }
            case "date" -> {
                Timestamp t = parseTimestamp(value);
                yield t == null ? null : t.toInstant().toString();
            }
            default -> value.isTextual() ? value.asText() : value.toString();
        };
    }

    public static Object jsonNodeToPlainValue(JsonNode value) {
        if (value == null || value.isNull()) {
            return null;
        }
        if (value.isNumber()) {
            return value.numberValue();
        }
        if (value.isBoolean()) {
            return value.booleanValue();
        }
        return value.asText();
    }
}
