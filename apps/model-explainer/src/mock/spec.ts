/** Shape of a fictional mock model. The mock engine turns it into INFO.VIEW.* rows and plausible query answers. */
import type { SectionKey } from '../domain/types';

export type MockDataType = 'Text' | 'Integer' | 'Number' | 'Currency' | 'DateTime' | 'Boolean';

export interface MockColumn {
  name: string;
  dataType: MockDataType;
  isHidden?: boolean;
  description?: string;
  folder?: string;
  calculated?: boolean;
  formatString?: string;
  /** Values the mock engine groups by in Try it queries. */
  samples?: string[];
}

export interface MockTable {
  name: string;
  description?: string;
  isHidden?: boolean;
  storageMode?: 'Import' | 'DirectQuery' | 'DirectLake' | 'Dual';
  rows: number;
  columns: MockColumn[];
}

export interface MockMeasure {
  table: string;
  name: string;
  /** null mimics a model that does not expose DAX through INFO.VIEW.MEASURES. */
  expression: string | null;
  formatString?: string;
  description?: string;
  folder?: string;
  isHidden?: boolean;
  dataType: 'Number' | 'Currency' | 'Integer' | 'Text';
  /** Value range the mock engine draws from. */
  range?: [number, number];
}

export interface MockRelationship {
  from: [table: string, column: string];
  to: [table: string, column: string];
  fromCardinality?: 'Many' | 'One';
  toCardinality?: 'Many' | 'One';
  crossFilter?: 'OneDirection' | 'BothDirections';
  isActive?: boolean;
}

export interface MockModel {
  key: string;
  label: string;
  /** Shown under the model picker in demo mode. */
  note: string;
  tables: MockTable[];
  measures: MockMeasure[];
  relationships: MockRelationship[];
  /** Sections whose INFO.VIEW query fails (to show per-section degradation). */
  blocked?: SectionKey[];
}
