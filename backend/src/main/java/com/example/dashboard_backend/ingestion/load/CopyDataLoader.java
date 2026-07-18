package com.example.dashboard_backend.ingestion.load;

import com.example.dashboard_backend.ingestion.support.IdentifierNaming;
import com.example.dashboard_backend.model.FieldAnalysis;
import org.postgresql.PGConnection;
import org.postgresql.copy.CopyManager;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Bulk-loads a staged per-table CSV file into its target table using PostgreSQL's native
 * {@code COPY ... FROM STDIN}, which is dramatically faster than row-by-row inserts for the large
 * file-upload path.
 */
@Component
public class CopyDataLoader {

    private final DataSource dataSource;

    public CopyDataLoader(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public long copyIntoTable(String tableName, boolean hasParent, List<FieldAnalysis> fields, Path csvFile) {
        List<String> columns = new ArrayList<>();
        columns.add("upload_id");
        columns.add("row_id");
        if (hasParent) columns.add("parent_row_id");
        for (FieldAnalysis field : fields) columns.add(field.normalizedFieldName());

        String columnList = columns.stream().map(IdentifierNaming::quoteIdentifier).collect(Collectors.joining(", "));
        String copySql = "COPY " + IdentifierNaming.quoteIdentifier(tableName) + " (" + columnList + ") FROM STDIN WITH (FORMAT csv, NULL '')";

        try (Connection connection = dataSource.getConnection();
             InputStream in = Files.newInputStream(csvFile)) {
            CopyManager copyManager = connection.unwrap(PGConnection.class).getCopyAPI();
            return copyManager.copyIn(copySql, in);
        } catch (SQLException | IOException e) {
            throw new RuntimeException("Failed to load data into table " + tableName, e);
        }
    }
}
