package com.example.dashboard_backend.util;

import java.util.UUID;

/** Application-wide constants. */
public final class AppConstants {

    private AppConstants() {
    }

    /**
     * Fixed UUID representing the single placeholder user "user_123".
     * TODO: replace with a real authenticated user id once authentication is introduced.
     */
    public static final UUID USER_123 = UUID.fromString("00000000-0000-0000-0000-000000000123");
}
