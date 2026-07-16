package com.example.dashboard_backend.util;

import java.util.regex.Pattern;

/**
 * Single source of truth for turning a user-supplied name into a safe SQL identifier.
 *
 * <p>Dynamic SQL in this codebase never concatenates raw identifiers: names are either validated
 * against {@link #SAFE_IDENTIFIER} or quoted with {@link #quote(String)} (values always go through
 * JDBC bind parameters). Keeping this logic in one place avoids the risk of a divergent copy
 * weakening the injection defense.
 */
public final class SqlIdentifier {

    /** Allowed shape for an unquoted identifier that is concatenated into SQL. */
    public static final Pattern SAFE_IDENTIFIER = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");

    private SqlIdentifier() {
    }

    /** Double-quotes an identifier, escaping embedded quotes, so it can be embedded in SQL safely. */
    public static String quote(String identifier) {
        return "\"" + identifier.replace("\"", "\"\"") + "\"";
    }

    /** Validates that an identifier matches {@link #SAFE_IDENTIFIER}, throwing {@link IllegalArgumentException} otherwise. */
    public static String validate(String identifier, String kind) {
        if (identifier == null || !SAFE_IDENTIFIER.matcher(identifier).matches()) {
            throw new IllegalArgumentException("Invalid " + kind + " name: " + identifier);
        }
        return identifier;
    }
}
