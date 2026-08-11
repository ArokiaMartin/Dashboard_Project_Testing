package com.example.dashboard_backend.live;

import com.example.dashboard_backend.query.QueryConfigNormalizer.DatasetRef;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for the live read path ({@link LiveWindowedFromProvider}). They assert on the generated
 * derived-table SQL string, so they run without a database by mocking {@link LiveSourceRegistrar}.
 *
 * <p>These protect the load-bearing invariants from the spec: the open (still-filling) bucket is
 * excluded, the trusted FROM contributes zero bind parameters, {@code AT TIME ZONE} precedes
 * {@code date_trunc}, the window is per-widget (all-time omits the lower bound), and a non-live dataset
 * gets no override at all.
 */
class LiveWindowedFromProviderTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final UUID uploadId = UUID.fromString("11111111-1111-1111-1111-111111111111");

    private LiveWindowedFromProvider providerFor(LiveSourceRegistrar.LiveSource source) {
        LiveSourceRegistrar registrar = mock(LiveSourceRegistrar.class);
        when(registrar.resolve(uploadId)).thenReturn(source);
        return new LiveWindowedFromProvider(registrar);
    }

    private LiveSourceRegistrar.LiveSource sampleSource() {
        return new LiveSourceRegistrar.LiveSource(uploadId, "live_orders",
                List.of(new LiveSourceRegistrar.LiveField("amount", "amount", "numeric"),
                        new LiveSourceRegistrar.LiveField("region", "region", "text")));
    }

    private ObjectNode config(ObjectNode live) {
        ObjectNode cfg = mapper.createObjectNode();
        if (live != null) {
            cfg.set("live", live);
        }
        return cfg;
    }

    @Test
    void defaultWindowExcludesOpenBucketAndBindsNoParameters() {
        LiveWindowedFromProvider provider = providerFor(sampleSource());
        String sql = provider.fromSqlFor(new DatasetRef(uploadId, "live_orders"), config(null));

        assertNotNull(sql);
        assertFalse(sql.contains("?"), "trusted FROM must contribute zero bind parameters");
        assertTrue(sql.contains("interval '60 minutes'"), "default 60-minute window applied");
        assertTrue(sql.contains("< (date_trunc("), "open (still-filling) bucket excluded");
        assertTrue(sql.contains("date_trunc('minute', \"ts\" AT TIME ZONE 'UTC')"),
                "AT TIME ZONE must be applied to ts before date_trunc buckets it");
    }

    @Test
    void allTimeWindowOmitsLowerBound() {
        LiveWindowedFromProvider provider = providerFor(sampleSource());
        ObjectNode live = mapper.createObjectNode();
        live.put("windowMinutes", 0);
        String sql = provider.fromSqlFor(new DatasetRef(uploadId, "live_orders"), config(live));

        assertFalse(sql.contains("interval"), "all-time window must have no lower time bound");
    }

    @Test
    void includingOpenBucketOmitsTheCut() {
        LiveWindowedFromProvider provider = providerFor(sampleSource());
        ObjectNode live = mapper.createObjectNode();
        live.put("excludeOpenBucket", false);
        String sql = provider.fromSqlFor(new DatasetRef(uploadId, "live_orders"), config(live));

        assertFalse(sql.contains("< (date_trunc("), "open-bucket cut must be omitted when opted out");
    }

    @Test
    void nonLiveSourceLeavesFromClauseUntouched() {
        LiveWindowedFromProvider provider = providerFor(null); // registrar.resolve returns null
        String sql = provider.fromSqlFor(new DatasetRef(uploadId, "orders"), config(null));

        assertNull(sql, "a non-live dataset must not receive a trusted FROM override");
    }

    @Test
    void rejectsUnknownBucket() {
        LiveWindowedFromProvider provider = providerFor(sampleSource());
        ObjectNode live = mapper.createObjectNode();
        live.put("bucket", "fortnight");

        assertThrows(IllegalArgumentException.class,
                () -> provider.fromSqlFor(new DatasetRef(uploadId, "live_orders"), config(live)));
    }
}
