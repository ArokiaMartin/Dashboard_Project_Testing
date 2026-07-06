package com.example.dashboard_backend.ingestion;

import com.example.dashboard_backend.ingestion.dto.IngestRequest;
import com.example.dashboard_backend.ingestion.dto.IngestResponse;
import com.example.dashboard_backend.ingestion.dto.UploadAnalysisResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import com.example.dashboard_backend.ingestion.CsvIngestionService;

import java.util.Map;

@RestController
@CrossOrigin(origins = "*")
@RequestMapping("/api")
@Tag(name = "Data Ingestion", description = "Endpoints for analyzing uploaded JSON and ingesting dataset rows into the backend database")
public class JsonIngestionController {

    private final JsonIngestionService jsonIngestionService;
    private final CsvIngestionService csvIngestionService;
    public JsonIngestionController(
            JsonIngestionService jsonIngestionService,
            CsvIngestionService csvIngestionService) {
        this.jsonIngestionService = jsonIngestionService;
        this.csvIngestionService = csvIngestionService;
    }

    @Operation(summary = "Analyze uploaded JSON file", description = "Accepts a multipart JSON file upload, inspects its structure, and returns inferred field metadata with sample rows before ingestion.", responses = {
            @ApiResponse(responseCode = "200", description = "Upload analyzed successfully", content = @Content(mediaType = "application/json", schema = @Schema(implementation = UploadAnalysisResponse.class), examples = @ExampleObject(value = "{\"uploadToken\":\"up_12345\",\"originalFilename\":\"orders.json\",\"rowCount\":120,\"columnCount\":4,\"fields\":[{\"fieldName\":\"region\",\"normalizedFieldName\":\"region\",\"fieldType\":\"STRING\",\"isDimension\":true,\"isMeasure\":false,\"distinctCount\":5,\"nullCount\":0,\"minValue\":null,\"maxValue\":null,\"sampleValues\":[\"North\",\"South\"]}],\"sampleRows\":[{\"region\":\"North\",\"revenue\":42000}],\"message\":\"Upload analyzed successfully\"}"))),
            @ApiResponse(responseCode = "400", description = "Invalid upload request")
    })

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public UploadAnalysisResponse uploadJson(
            @RequestParam("file") MultipartFile file) {

        String fileName = file.getOriginalFilename();

        if (fileName != null && fileName.toLowerCase().endsWith(".csv")) {
            return csvIngestionService.uploadCsv(file);
        }

        return jsonIngestionService.analyzeUpload(file);
    }

    @Operation(summary = "Ingest analyzed JSON data", description = "Persists a previously analyzed upload into a target table using the provided upload token and dataset payload.", requestBody = @RequestBody(required = true, content = @Content(mediaType = "application/json", schema = @Schema(implementation = IngestRequest.class), examples = @ExampleObject(value = "{\"uploadToken\":\"up_12345\",\"userId\":\"demo-user\",\"tableName\":\"orders\",\"originalFilename\":\"orders.json\",\"data\":[{\"region\":\"North\",\"revenue\":42000},{\"region\":\"South\",\"revenue\":28000}]}"))), responses = {
            @ApiResponse(responseCode = "200", description = "Data ingested successfully", content = @Content(mediaType = "application/json", schema = @Schema(implementation = IngestResponse.class), examples = @ExampleObject(value = "{\"uploadId\":\"up_12345\",\"tableName\":\"orders\",\"rowsInserted\":120,\"columnCount\":4,\"status\":\"SUCCESS\",\"errors\":[],\"message\":\"Ingestion completed successfully\"}"))),
            @ApiResponse(responseCode = "400", description = "Invalid ingestion request")
    })
    @PostMapping("/data/ingest")
    public IngestResponse ingestJson(@org.springframework.web.bind.annotation.RequestBody IngestRequest request) {
        return jsonIngestionService.ingest(request);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of(
                "error", ex.getMessage()));
    }
}
