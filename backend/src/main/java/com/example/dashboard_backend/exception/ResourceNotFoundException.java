package com.example.dashboard_backend.exception;

/**
 * Thrown when a requested resource (dashboard, dataset, schema, version, ...) does not exist.
 * Mapped to HTTP 404 by {@link GlobalExceptionHandler}, so clients can distinguish "missing"
 * from "bad input" (which stays 400 via {@link IllegalArgumentException}).
 */
public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String message) {
        super(message);
    }
}
