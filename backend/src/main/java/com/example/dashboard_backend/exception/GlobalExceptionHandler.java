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

    /** Invalid client input → 400 Bad Request. */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", messageOf(ex, "Bad request")));
    }

    /** Missing resource → 404 Not Found (distinct from bad input). */
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(ResourceNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", messageOf(ex, "Not found")));
    }

    /**
     * Database/SQL failures → 500, but with a GENERIC message. The full exception (which includes the
     * offending SQL) is logged server-side only, never returned to the client (information disclosure).
     */
    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Map<String, String>> handleDataAccess(DataAccessException ex) {
        log.error("Database access error", ex);
        return ResponseEntity.internalServerError()
                .body(Map.of("error", "A database error occurred while processing the request."));
    }

    /** Anything else genuinely unexpected → 500, and it is logged (previously errors were silently swallowed). */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.internalServerError().body(Map.of("error", "Internal error"));
    }

    private static String messageOf(Exception ex, String fallback) {
        return ex.getMessage() != null ? ex.getMessage() : fallback;
    }
}
