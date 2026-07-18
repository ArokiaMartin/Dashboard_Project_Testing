package com.example.dashboard_backend.drilldown;

import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Stateless drill-down endpoint. Each call renders one level (the current grouped query) and reports
 * whether a further drill is meaningful plus the auto-picked next dimension.
 *
 * <p>Drilling one level deeper is entirely client-driven and needs no server state: on a bar click the
 * caller appends {@code {field: currentDimension, value: clickedValue}} (or {@code {field, isNull:true}}
 * for the null bucket) to {@code filters}, sets {@code currentDimension} to the returned
 * {@code nextDimension}, and calls again. When {@code drilldown.enabled} is {@code false}, the click has
 * nothing meaningful to show and should be a no-op.
 *
 * <p>This endpoint is additive — it does not alter {@code /execute-query} or any existing behavior.
 */
@RestController
@RequestMapping("/api")
@Tag(name = "Drilldown API", description = "Cardinality-driven drill-down over any aggregated query, for single-table and nested datasets")
public class DrilldownController {

    private final DrilldownService drilldownService;

    public DrilldownController(DrilldownService drilldownService) {
        this.drilldownService = drilldownService;
    }

    @Operation(
        summary = "Execute a drill level and analyze the next",
        description = "Runs the current grouped query (dimension + measure + accumulated filters) and returns its rows " +
                "alongside a drilldown block indicating whether a deeper drill is possible and which dimension is next.",
        requestBody = @RequestBody(
            required = true,
            content = @Content(
                mediaType = "application/json",
                schema = @Schema(type = "object"),
                examples = @ExampleObject(
                    name = "Drill by region, measure = total sales",
                    value = "{\"dataset\":\"<uploadId>\",\"chartType\":\"bar\",\"currentDimension\":\"Region\"," +
                            "\"measure\":{\"field\":\"Sales\",\"aggregation\":\"SUM\",\"alias\":\"value\"}," +
                            "\"filters\":[{\"field\":\"Country\",\"value\":\"US\"}],\"topN\":20}"
                )
            )
        ),
        responses = {
            @ApiResponse(responseCode = "200", description = "Drill level executed and analyzed",
                content = @Content(mediaType = "application/json",
                    examples = @ExampleObject(value = "{\"generatedSql\":\"SELECT ...\",\"data\":[{\"Region\":\"North\",\"value\":42000}]," +
                            "\"drilldown\":{\"enabled\":true,\"reason\":\"OK\",\"nextDimension\":\"City\",\"currentDimension\":\"Region\",\"candidates\":[]}}")
                )
            )
        }
    )
    @PostMapping("/drilldown")
    public Map<String, Object> drilldown(@org.springframework.web.bind.annotation.RequestBody JsonNode request) {
        return drilldownService.drill(request);
    }
}
