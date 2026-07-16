package com.example.dashboard_backend.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.util.Map;

/**
 * Application-wide exception handling, replacing the per-controller {@code @ExceptionHandler} methods
 * that previously duplicated this logic with inconsistent status codes.
 *
 * <p>Extends {@link ResponseEntityExceptionHandler} so Spring's built-in exceptions (404/405/etc.)
 * keep their correct status codes; only bad-argument and otherwise-unhandled errors are mapped here.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** Missing resource → 404 Not Found (distinct from bad input). */
    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(NotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", messageOf(ex, "Not found")));
    }

    /** Invalid client input → 400 Bad Request. */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", messageOf(ex, "Bad request")));
    }

    /**
     * Database/SQL errors → 400 Bad Request with a generic message. These are almost always caused by
     * invalid client input (bad column, negative pagination, malformed value) reaching the query, so a
     * 400 is more accurate than a 500. Crucially, the raw exception message (which embeds the full SQL
     * statement) is logged server-side ONLY and never returned to the client, closing the info-disclosure
     * leak the previous handler had.
     */
    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Map<String, String>> handleDataAccess(DataAccessException ex) {
        log.warn("Database error while handling request", ex);
        return ResponseEntity.badRequest().body(Map.of("error", "Invalid request: the query could not be executed."));
    }

    /** Anything else genuinely unexpected → 500, and it is logged (previously errors were silently swallowed). */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        // Never echo internal exception text (may contain SQL/stack detail) to the client.
        return ResponseEntity.internalServerError().body(Map.of("error", "Internal error"));
    }

    private static String messageOf(Exception ex, String fallback) {
        return ex.getMessage() != null ? ex.getMessage() : fallback;
    }
}
