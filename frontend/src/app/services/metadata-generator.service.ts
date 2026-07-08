import { Injectable } from '@angular/core';

/**
 * Generates dataset metadata (column types, semantic roles, primary-key candidates) and detects
 * relationships between uploaded tables so the dashboard builder can create cross-table charts.
 *
 * A relationship links a foreign-key-looking column in one table (e.g. employees.department_id) to
 * a primary-key candidate in another (departments.department_id). Detection combines a column-name
 * score with a value-overlap score, so a join is only suggested when the names look related AND the
 * actual values line up.
 */

export interface UploadedTable {
  tableName: string;
  rows: any[];
}

export interface ColumnReference {
  table: string;
  column: string;
  confidence: number;
}

export interface ColumnMetadata {
  columnName: string;
  dataType: string;
  semanticType: string;
  nullable: boolean;
  unique: boolean;
  primaryKeyCandidate: boolean;
  sampleValues: any[];
  references?: ColumnReference;
}

export interface TableMetadata {
  tableName: string;
  rowCount: number;
  columns: ColumnMetadata[];
}

export interface RelationshipMetadata {
  relationshipId: string;
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  joinType: string;
  cardinality: string;
  confidence: number;
  detectedBy: string;
}

export interface DatasetMetadata {
  datasetId: string;
  tables: TableMetadata[];
  relationships: RelationshipMetadata[];
}

@Injectable({ providedIn: 'root' })
export class MetadataGeneratorService {

  /** Build full dataset metadata (tables + columns + detected relationships) from uploaded tables. */
  generateMetadata(datasetId: string, uploadedTables: UploadedTable[]): DatasetMetadata {
    const tables: TableMetadata[] = uploadedTables.map(table => ({
      tableName: table.tableName,
      rowCount: table.rows.length,
      columns: this.extractColumns(table.rows).map(column => this.buildColumnMetadata(column, table.rows))
    }));

    const relationships = this.detectRelationships(tables, uploadedTables);

    // Promote detected foreign keys on the source columns so the UI can badge them.
    relationships.forEach(rel => {
      const leftTable = tables.find(t => t.tableName === rel.leftTable);
      const leftColumn = leftTable?.columns.find(c => c.columnName === rel.leftColumn);
      if (leftColumn) {
        leftColumn.semanticType = 'foreign_key';
        leftColumn.references = {
          table: rel.rightTable,
          column: rel.rightColumn,
          confidence: rel.confidence
        };
      }
    });

    return { datasetId, tables, relationships };
  }

  // ---------------------------------------------------------------------------------------------
  // Column analysis
  // ---------------------------------------------------------------------------------------------

  private extractColumns(rows: any[]): string[] {
    const columnSet = new Set<string>();
    rows.forEach(row => Object.keys(row ?? {}).forEach(key => columnSet.add(key)));
    return Array.from(columnSet);
  }

  private buildColumnMetadata(columnName: string, rows: any[]): ColumnMetadata {
    const values = rows
      .map(row => row?.[columnName])
      .filter(value => value !== null && value !== undefined);
    const uniqueValues = new Set(values);

    const nullable = values.length !== rows.length;
    const unique = values.length > 0 && uniqueValues.size === values.length;
    const dataType = this.inferDataType(values);
    const semanticType = this.inferSemanticType(columnName, dataType, unique);

    return {
      columnName,
      dataType,
      semanticType,
      nullable,
      unique,
      primaryKeyCandidate: unique && this.isIdColumn(columnName),
      sampleValues: values.slice(0, 5)
    };
  }

  private inferDataType(values: any[]): string {
    if (values.length === 0) return 'unknown';

    const total = values.length;
    const numberCount = values.filter(v => typeof v === 'number' || (v !== '' && !isNaN(Number(v)))).length;
    const booleanCount = values.filter(v => typeof v === 'boolean' || v === 'true' || v === 'false').length;
    const dateCount = values.filter(v => typeof v === 'string' && !isNaN(Date.parse(v))).length;

    if (numberCount / total > 0.8) return 'number';
    if (booleanCount / total > 0.8) return 'boolean';
    if (dateCount / total > 0.8) return 'date';
    return 'string';
  }

  private inferSemanticType(columnName: string, dataType: string, unique: boolean): string {
    const lower = columnName.toLowerCase();
    if (this.isIdColumn(columnName) && unique) return 'id';
    if (lower.endsWith('_id')) return 'foreign_key';
    if (dataType === 'number') return 'measure';
    if (dataType === 'date') return 'time';
    if (dataType === 'string') return 'dimension';
    return 'attribute';
  }

  private isIdColumn(columnName: string): boolean {
    const lower = columnName.toLowerCase();
    return lower === 'id' || lower.endsWith('_id');
  }

  // ---------------------------------------------------------------------------------------------
  // Relationship detection
  // ---------------------------------------------------------------------------------------------

  private detectRelationships(
    tableMetadata: TableMetadata[],
    uploadedTables: UploadedTable[]
  ): RelationshipMetadata[] {
    const relationships: RelationshipMetadata[] = [];

    for (const sourceTable of tableMetadata) {
      for (const sourceColumn of sourceTable.columns) {
        if (!sourceColumn.columnName.toLowerCase().endsWith('_id')) {
          continue;
        }

        for (const targetTable of tableMetadata) {
          if (sourceTable.tableName === targetTable.tableName) {
            continue;
          }

          for (const targetColumn of targetTable.columns) {
            if (!targetColumn.primaryKeyCandidate) {
              continue;
            }

            const nameScore = this.getColumnNameScore(
              sourceColumn.columnName,
              targetColumn.columnName,
              targetTable.tableName
            );
            if (nameScore < 0.5) {
              continue;
            }

            const valueScore = this.getValueOverlapScore(
              sourceTable.tableName,
              sourceColumn.columnName,
              targetTable.tableName,
              targetColumn.columnName,
              uploadedTables
            );

            const confidence = (nameScore + valueScore) / 2;

            if (confidence >= 0.7) {
              relationships.push({
                relationshipId: `rel_${sourceTable.tableName}_${targetTable.tableName}_${sourceColumn.columnName}`,
                leftTable: sourceTable.tableName,
                leftColumn: sourceColumn.columnName,
                rightTable: targetTable.tableName,
                rightColumn: targetColumn.columnName,
                joinType: 'LEFT_JOIN',
                cardinality: 'many_to_one',
                confidence,
                detectedBy: 'column_name_and_value_overlap'
              });
            }
          }
        }
      }
    }

    return relationships;
  }

  private getColumnNameScore(sourceColumn: string, targetColumn: string, targetTable: string): number {
    const source = sourceColumn.toLowerCase();
    const target = targetColumn.toLowerCase();
    const table = targetTable.toLowerCase();

    if (source === target) return 1;

    const singularTable = table.endsWith('s') ? table.slice(0, -1) : table;

    if (source === `${singularTable}_id` && target === 'id') return 0.95;
    if (source === `${singularTable}_id` && target === `${singularTable}_id`) return 1;
    if (source.endsWith('_id') && target.endsWith('_id')) return 0.7;

    return 0;
  }

  private getValueOverlapScore(
    sourceTableName: string,
    sourceColumnName: string,
    targetTableName: string,
    targetColumnName: string,
    uploadedTables: UploadedTable[]
  ): number {
    const sourceTable = uploadedTables.find(t => t.tableName === sourceTableName);
    const targetTable = uploadedTables.find(t => t.tableName === targetTableName);

    if (!sourceTable || !targetTable) return 0;

    const sourceValues = sourceTable.rows
      .map(row => row?.[sourceColumnName])
      .filter(value => value !== null && value !== undefined);

    const targetValues = new Set(
      targetTable.rows
        .map(row => row?.[targetColumnName])
        .filter(value => value !== null && value !== undefined)
    );

    if (sourceValues.length === 0 || targetValues.size === 0) return 0;

    const matchedValues = sourceValues.filter(value => targetValues.has(value));
    return matchedValues.length / sourceValues.length;
  }

  // ---------------------------------------------------------------------------------------------
  // Cross-table chart config builder
  // ---------------------------------------------------------------------------------------------

  /**
   * Builds a query config for a chart. When the selected dimension and measure come from the same
   * table it produces a single-table config; when they come from different tables it resolves the
   * required join(s) from the detected relationships and produces a multi_table config that the
   * backend /execute-query endpoint understands.
   */
  buildChartConfig(
    selectedDimension: { table: string; column: string },
    selectedMeasure: { table: string; column: string; aggregation?: string },
    metadata: DatasetMetadata
  ): any {
    const usedTables = Array.from(new Set([selectedDimension.table, selectedMeasure.table]));
    const joins = this.findRequiredJoins(usedTables, metadata);
    const aggregation = (selectedMeasure.aggregation || 'SUM').toUpperCase();

    return {
      queryMode: usedTables.length > 1 ? 'multi_table' : 'single_table',
      tables: {
        primary: selectedMeasure.table,
        used: usedTables
      },
      dimensions: [
        {
          table: selectedDimension.table,
          column: selectedDimension.column,
          alias: selectedDimension.column
        }
      ],
      measures: [
        {
          table: selectedMeasure.table,
          column: selectedMeasure.column,
          aggregation,
          alias: `${aggregation.toLowerCase()}_${selectedMeasure.column}`
        }
      ],
      joins,
      filters: {
        condition: 'AND',
        rules: []
      },
      sorting: [],
      pagination: {
        top: 100,
        offset: 0
      }
    };
  }

  /** Returns the join clauses needed to connect the given tables, taken from detected relationships. */
  findRequiredJoins(usedTables: string[], metadata: DatasetMetadata): any[] {
    if (usedTables.length <= 1) return [];

    return metadata.relationships
      .filter(rel => usedTables.includes(rel.leftTable) && usedTables.includes(rel.rightTable))
      .map(rel => ({
        leftTable: rel.leftTable,
        leftColumn: rel.leftColumn,
        rightTable: rel.rightTable,
        rightColumn: rel.rightColumn,
        joinType: rel.joinType
      }));
  }

  /**
   * Returns true when the two tables can be charted together — i.e. they are the same table, or a
   * relationship connecting them exists in the metadata. When false, the UI should prompt the user
   * to define a join column manually.
   */
  areTablesConnected(tableA: string, tableB: string, metadata: DatasetMetadata): boolean {
    if (tableA === tableB) return true;
    return metadata.relationships.some(rel =>
      (rel.leftTable === tableA && rel.rightTable === tableB) ||
      (rel.leftTable === tableB && rel.rightTable === tableA)
    );
  }
}
