package com.example.dashboard_backend.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Health", description = "Basic health-check endpoint")
public class HelloController {

    @Operation(
        summary = "Health check",
        description = "Returns a simple 'Hello World' string to confirm the service is running.",
        responses = {
            @ApiResponse(responseCode = "200", description = "Service is up")
        }
    )
    @GetMapping("/hello")
    public String hello() {
        return "Hello World";
    }
}