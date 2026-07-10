package com.example.dashboard_backend.controller;
import com.example.dashboard_backend.service.DashboardService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@CrossOrigin(origins = "*")
@RequestMapping("/api/dashboards")
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @PostMapping
    public Map<String, Object> createDashboard(@RequestBody Map<String, Object> request) {
        return dashboardService.createDashboard(request);
    }

    @PutMapping("/{dashboardId}")
    public Map<String, Object> updateDashboard(@PathVariable String dashboardId, @RequestBody Map<String, Object> request) {
        return dashboardService.updateDashboard(UUID.fromString(dashboardId), request);
    }

    @GetMapping
    public List<Map<String, Object>> getDashboards() {
        return dashboardService.getDashboards();
    }

    @GetMapping("/{dashboardId}")
    public Map<String, Object> getDashboardById(@PathVariable String dashboardId) {
        return dashboardService.getDashboardById(UUID.fromString(dashboardId));
    }

    @GetMapping("/user/{userId}")
    public List<Map<String, Object>> getDashboardsByUserId(@PathVariable String userId) {
        return dashboardService.getDashboardsByUserId(userId);
    }

    @DeleteMapping("/{dashboardId}")
    public Map<String, Object> deleteDashboard(@PathVariable String dashboardId) {
        return dashboardService.deleteDashboard(UUID.fromString(dashboardId));
    }
}
