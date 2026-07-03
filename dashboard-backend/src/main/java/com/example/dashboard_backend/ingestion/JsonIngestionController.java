package com.example.dashboard_backend.ingestion;

import com.example.dashboard_backend.ingestion.dto.IngestRequest;
import com.example.dashboard_backend.ingestion.dto.IngestResponse;
import com.example.dashboard_backend.ingestion.dto.UploadAnalysisResponse;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@CrossOrigin(origins = "*")
@RequestMapping("/api")
public class JsonIngestionController {

    private final JsonIngestionService jsonIngestionService;

    public JsonIngestionController(JsonIngestionService jsonIngestionService) {
        this.jsonIngestionService = jsonIngestionService;
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public UploadAnalysisResponse uploadJson(@RequestParam("file") MultipartFile file) {
        return jsonIngestionService.analyzeUpload(file);
    }

    @PostMapping("/data/ingest")
    public IngestResponse ingestJson(@RequestBody IngestRequest request) {
        return jsonIngestionService.ingest(request);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of(
                "error", ex.getMessage()
        ));
    }
}
