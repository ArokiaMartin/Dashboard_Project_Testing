package com.example.dashboard_backend.exception;

/**
 * Thrown when a requested resource (dashboard, dataset, version, ...) does not exist.
 * Mapped to HTTP 404 by {@link GlobalExceptionHandler}, so callers can distinguish "missing"
 * from "bad input" (which stays a 400 via {@link IllegalArgumentException}).
 */
public class NotFoundException extends RuntimeException {
    public NotFoundException(String message) {
        super(message);
    }
}
