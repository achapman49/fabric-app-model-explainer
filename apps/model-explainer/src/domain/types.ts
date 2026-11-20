/** Typed semantic model metadata. Everything the screens show is derived from one ModelMetadata object. */

export interface TableInfo {
  name: string;
  description: string;
  isHidden: boolean;
  /** Columns excluding the internal RowNumber column; null when column metadata is not available. */
  columnCount: number | null;
  /** Null when measure metadata is not available. */
  measureCount: number | null;
  storageMode: string | null;
  dataCategory: string | null;
}

export type ColumnKind = 'data' | 'calculated' | 'calculatedTable' | 'other';

export interface ColumnInfo {
  table: string;
  name: string;
  dataType: string;
  isHidden: boolean;
  description: string;
  displayFolder: string;
  kind: ColumnKind;
  formatString: string;
}

export interface MeasureInfo {
  table: string;
  name: string;
  /** Null when the model does not return the DAX (some models hide it from INFO.VIEW). */
  expression: string | null;
  formatString: string;
  description: string;
  displayFolder: string;
  isHidden: boolean;
  /** Result data type when the metadata carries it, otherwise null. */
  dataType: string | null;
}

export type CrossFilter = 'single' | 'both';
export type Cardinality = 'many-to-one' | 'one-to-many' | 'one-to-one' | 'many-to-many';

export interface RelationshipInfo {
  name: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  isActive: boolean;
  crossFilter: CrossFilter;
  cardinality: Cardinality;
}

export type SectionKey = 'tables' | 'columns' | 'measures' | 'relationships';

export type MetadataSource = 'INFO' | 'INFO.VIEW';

export interface SectionError {
  category: string;
  message: string;
}

export type SectionStatus =
  | { ok: true; source: MetadataSource }
  | { ok: false; error: SectionError; attempts: string[] };

export interface ModelMetadata {
  modelLabel: string;
  tables: TableInfo[];
  columns: ColumnInfo[];
  measures: MeasureInfo[];
  relationships: RelationshipInfo[];
  sections: Record<SectionKey, SectionStatus>;
  loadedAt: string;
}

export const SECTION_LABELS: Record<SectionKey, string> = {
  tables: 'Tables',
  columns: 'Columns',
  measures: 'Measures',
  relationships: 'Relationships',
};
