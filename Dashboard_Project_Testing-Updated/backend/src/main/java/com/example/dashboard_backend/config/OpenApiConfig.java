package com.example.dashboard_backend.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI dashboardOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Dashboard Backend API")
                        .description("REST API for dataset ingestion, upload analysis, and generating or executing SQL queries from dashboard component configurations.")
                        .version("1.0.0"));
    }
}
