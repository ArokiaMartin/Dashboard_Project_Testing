package com.example.dashboard_backend.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertSame;

class SqlIdentifierTest {

    @Test
    void quoteWrapsIdentifierInDoubleQuotes() {
        assertEquals("\"revenue\"", SqlIdentifier.quote("revenue"));
    }

    @Test
    void quoteEscapesEmbeddedDoubleQuotes() {
        // A quote inside the identifier must be doubled so it cannot break out of the quoted context.
        assertEquals("\"we\"\"ird\"", SqlIdentifier.quote("we\"ird"));
    }

    @Test
    void validateReturnsSameStringForSafeIdentifier() {
        String input = "order_total_2024";
        assertSame(input, SqlIdentifier.validate(input, "field"));
    }

    @Test
    void validateRejectsNull() {
        assertThrows(IllegalArgumentException.class, () -> SqlIdentifier.validate(null, "field"));
    }

    @Test
    void validateRejectsIdentifierWithSpaces() {
        assertThrows(IllegalArgumentException.class, () -> SqlIdentifier.validate("order total", "field"));
    }

    @Test
    void validateRejectsSqlInjectionAttempt() {
        assertThrows(IllegalArgumentException.class,
                () -> SqlIdentifier.validate("id; DROP TABLE users", "field"));
    }

    @Test
    void validateRejectsIdentifierStartingWithDigit() {
        assertThrows(IllegalArgumentException.class, () -> SqlIdentifier.validate("1column", "field"));
    }
}
