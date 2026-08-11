package com.example.dashboard_backend.live;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Turns on Spring's scheduler, which {@link LiveEventWriter#flush()} needs. It lives in this package
 * because the live path is the only feature that uses {@code @Scheduled} — nothing else in the
 * application has a timer, so enabling it here keeps the whole live feature self-contained.
 *
 * <p>Pool sizing is configured with {@code spring.task.scheduling.pool.size} in
 * {@code application.properties}: the default pool is a SINGLE thread, which would let one slow flush
 * stall every other scheduled task.
 */
@Configuration
@EnableScheduling
public class LiveSchedulingConfig {
}
