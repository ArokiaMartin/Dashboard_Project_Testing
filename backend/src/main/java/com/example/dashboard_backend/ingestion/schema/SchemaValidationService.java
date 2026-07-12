package com.example.dashboard_backend.ingestion.schema;

import com.example.dashboard_backend.ingestion.model.Schema;
import com.example.dashboard_backend.ingestion.model.SchemaField;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class SchemaValidationService {

    private final ObjectMapper objectMapper;

    public SchemaValidationService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public ValidationResult validateDataAgainstSchema(Schema schema, JsonNode data) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        if (data == null) {
            errors.add("Data cannot be null");
            return new ValidationResult(false, errors, warnings);
        }

        JsonNode targetData = data;
        if (data.isObject() && data.has("data") && data.get("data").isArray()) {
            targetData = data.get("data");
        }

        List<JsonNode> records = new ArrayList<>();
        if (targetData.isArray()) {
            for (JsonNode item : targetData) {
                if (item.isObject()) records.add(item);
            }
        } else if (targetData.isObject()) {
            records.add(targetData);
        } else {
            errors.add("Data must be an object, array of objects, or object containing data[]");
            return new ValidationResult(false, errors, warnings);
        }

        if (records.isEmpty()) {
            errors.add("No data records provided");
            return new ValidationResult(false, errors, warnings);
        }

        Map<String, SchemaField> fieldMap = schema.fields().stream()
            .collect(Collectors.toMap(SchemaField::fieldName, f -> f));

        int recordIndex = 0;
        for (JsonNode record : records) {
            final int currentIndex = recordIndex;
            for (SchemaField field : schema.fields()) {
                JsonNode value = record.get(field.fieldName());

                if (field.isRequired() && (value == null || value.isNull() || (value.isTextual() && value.asText().isEmpty()))) {
                    errors.add(String.format(
                        "Record %d: Field '%s' is required but missing or empty",
                        currentIndex, field.fieldName()
                    ));
                }

                if (value != null && !value.isNull()) {
                    validateFieldValue(field, value, currentIndex, errors);
                }
            }

            // Check for extra fields not in schema
            if (record.isObject()) {
                record.fieldNames().forEachRemaining(fieldName -> {
                    if (!fieldMap.containsKey(fieldName) && !fieldName.equals("data")) {
                        warnings.add(String.format(
                            "Record %d: Field '%s' not defined in schema (will be ignored)",
                            currentIndex, fieldName
                        ));
                    }
                });
            }

            recordIndex++;
        }

        boolean isValid = errors.isEmpty();
        return new ValidationResult(isValid, errors, warnings);
    }

    private void validateFieldValue(SchemaField field, JsonNode value, int recordIndex, List<String> errors) {
        switch (field.fieldType().toUpperCase()) {
            case "STRING", "TEXT" -> {
                if (!value.isTextual() && !value.isNull()) {
                    errors.add(String.format(
                        "Record %d: Field '%s' should be string but got %s",
                        recordIndex, field.fieldName(), value.getNodeType()
                    ));
                }
            }
            case "INTEGER", "INT", "LONG", "BIGINT" -> {
                if (!value.isIntegralNumber() && !value.isNull()) {
                    errors.add(String.format(
                        "Record %d: Field '%s' should be integer but got %s",
                        recordIndex, field.fieldName(), value.getNodeType()
                    ));
                }
            }
            case "NUMERIC", "DECIMAL", "DOUBLE", "FLOAT" -> {
                if (!value.isNumber() && !value.isNull()) {
                    errors.add(String.format(
                        "Record %d: Field '%s' should be numeric but got %s",
                        recordIndex, field.fieldName(), value.getNodeType()
                    ));
                }
            }
            case "BOOLEAN", "BOOL" -> {
                if (!value.isBoolean() && !value.isNull()) {
                    errors.add(String.format(
                        "Record %d: Field '%s' should be boolean but got %s",
                        recordIndex, field.fieldName(), value.getNodeType()
                    ));
                }
            }
            case "DATE" -> {
                if (!value.isTextual() && !value.isNull()) {
                    errors.add(String.format(
                        "Record %d: Field '%s' should be date but got %s",
                        recordIndex, field.fieldName(), value.getNodeType()
                    ));
                }
            }
            case "TIMESTAMP", "DATETIME" -> {
                if (!value.isTextual() && !value.isNull()) {
                    errors.add(String.format(
                        "Record %d: Field '%s' should be timestamp but got %s",
                        recordIndex, field.fieldName(), value.getNodeType()
                    ));
                }
            }
        }

        if (field.validationRules() != null && !field.validationRules().isNull()) {
            validateCustomRules(field, value, recordIndex, errors);
        }
    }

    private void validateCustomRules(SchemaField field, JsonNode value, int recordIndex, List<String> errors) {
        JsonNode rules = field.validationRules();

        if (rules.has("minLength") && value.isTextual()) {
            int minLength = rules.get("minLength").asInt();
            if (value.asText().length() < minLength) {
                errors.add(String.format(
                    "Record %d: Field '%s' length must be >= %d",
                    recordIndex, field.fieldName(), minLength
                ));
            }
        }

        if (rules.has("maxLength") && value.isTextual()) {
            int maxLength = rules.get("maxLength").asInt();
            if (value.asText().length() > maxLength) {
                errors.add(String.format(
                    "Record %d: Field '%s' length must be <= %d",
                    recordIndex, field.fieldName(), maxLength
                ));
            }
        }

        if (rules.has("pattern") && value.isTextual()) {
            String pattern = rules.get("pattern").asText();
            if (!value.asText().matches(pattern)) {
                errors.add(String.format(
                    "Record %d: Field '%s' does not match pattern: %s",
                    recordIndex, field.fieldName(), pattern
                ));
            }
        }

        if (rules.has("minimum") && value.isNumber()) {
            double minimum = rules.get("minimum").asDouble();
            if (value.asDouble() < minimum) {
                errors.add(String.format(
                    "Record %d: Field '%s' must be >= %f",
                    recordIndex, field.fieldName(), minimum
                ));
            }
        }

        if (rules.has("maximum") && value.isNumber()) {
            double maximum = rules.get("maximum").asDouble();
            if (value.asDouble() > maximum) {
                errors.add(String.format(
                    "Record %d: Field '%s' must be <= %f",
                    recordIndex, field.fieldName(), maximum
                ));
            }
        }
    }

    public record ValidationResult(
        boolean isValid,
        List<String> errors,
        List<String> warnings
    ) {}
}
