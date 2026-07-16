package com.example.dashboard_backend.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    /** Anything else genuinely unexpected → 500, and it is logged (previously errors were silently swallowed). */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.internalServerError().body(Map.of("error", messageOf(ex, "Internal error")));
    }

    private static String messageOf(Exception ex, String fallback) {
        return ex.getMessage() != null ? ex.getMessage() : fallback;
    }
}
