/**
 * Defensive parsers for DAX INFO metadata. Two shapes are supported:
 * - INFO.VIEW.TABLES/COLUMNS/MEASURES/RELATIONSHIPS: names inline, enums as text ("BothDirections", "Many").
 * - INFO.TABLES/COLUMNS/MEASURES/RELATIONSHIPS: ids (TableID, FromColumnID) and numeric enums, resolved via lookups.
 * Column names are matched case-insensitively after stripping brackets and any table prefix ("INFO.VIEW.TABLES[Name]").
 */
import type { ModelTable } from '@x10/shared/connectors';

import type { Cardinality, ColumnInfo, ColumnKind, CrossFilter, MeasureInfo, RelationshipInfo, TableInfo } from './types';

export type Rec = Record<string, unknown>;

export class MetadataParseError extends Error {
  readonly category = 'parse';
}

/** "[Name]" -> "name", "INFO.VIEW.TABLES[IsHidden]" -> "ishidden", "Table" -> "table". */
export function normalizeColumnName(name: string): string {
  const trimmed = name.trim();
  const m = /\[([^\]]*(?:\]\][^\]]*)*)\]$/.exec(trimmed);
  const inner = m ? m[1].replace(/\]\]/g, ']') : trimmed;
  return inner.trim().toLowerCase();
}

export function toRecords(table: ModelTable): Rec[] {
  const keys = table.columns.map((c) => normalizeColumnName(c.name));
  return table.rows.map((row) => {
    const rec: Rec = {};
    keys.forEach((k, i) => {
      rec[k] = row[i];
    });
    return rec;
  });
}

function pick(rec: Rec, ...names: string[]): unknown {
  for (const n of names) {
    const v = rec[n.toLowerCase()];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function has(rec: Rec, name: string): boolean {
  return name.toLowerCase() in rec;
}

export function str(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v);
}

export function bool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return /^(true|1|yes)$/i.test(v.trim());
  return false;
}

/** TOM DataType enum (INFO.COLUMNS / INFO.MEASURES) to the names INFO.VIEW uses. */
const DATA_TYPES: Record<number, string> = {
  1: 'Automatic',
  2: 'String',
  6: 'Int64',
  8: 'Double',
  9: 'DateTime',
  10: 'Decimal',
  11: 'Boolean',
  17: 'Binary',
  19: 'Unknown',
  20: 'Variant',
};

export function dataTypeName(v: unknown): string {
  if (v === undefined || v === null || v === '') return 'Unknown';
  const n = typeof v === 'number' ? v : /^\d+$/.test(String(v).trim()) ? Number(v) : NaN;
  if (Number.isFinite(n)) return DATA_TYPES[n] ?? 'Unknown';
  return String(v);
}

const NUMERIC_TYPES = new Set(['int64', 'double', 'decimal', 'currency', 'integer', 'number', 'whole number', 'decimal number', 'fixed decimal number']);
export function isNumericType(t: string | null | undefined): boolean {
  return !!t && NUMERIC_TYPES.has(t.toLowerCase());
}
export function isTextType(t: string | null | undefined): boolean {
  return !!t && /^(string|text)$/i.test(t);
}
export function isDateType(t: string | null | undefined): boolean {
  return !!t && /^(datetime|date)$/i.test(t);
}

function columnKind(v: unknown): ColumnKind | 'rowNumber' {
  const s = str(v).trim().toLowerCase();
  if (s === '' ) return 'data';
  if (s === '1' || s === 'data') return 'data';
  if (s === '2' || s === 'calculated') return 'calculated';
  if (s === '3' || s === 'rownumber') return 'rowNumber';
  if (s === '4' || s === 'calculatedtablecolumn') return 'calculatedTable';
  return 'other';
}

function crossFilter(v: unknown): CrossFilter {
  const s = str(v).trim().toLowerCase();
  return s === '2' || s === 'bothdirections' || s === 'both' ? 'both' : 'single';
}

function endCardinality(v: unknown): 'one' | 'many' {
  const s = str(v).trim().toLowerCase();
  return s === '2' || s === 'many' ? 'many' : 'one';
}

export function cardinalityOf(from: 'one' | 'many', to: 'one' | 'many'): Cardinality {
  if (from === 'many' && to === 'many') return 'many-to-many';
  if (from === 'many') return 'many-to-one';
  if (to === 'many') return 'one-to-many';
  return 'one-to-one';
}

/**
 * Some engines return a relationship column as "'Sales'[Amount]" or "Sales[Amount]". Strip the table prefix only when it
 * is the relationship's own table, so a plain column named "Size [cm]" stays intact.
 */
export function bareColumnName(v: string, table: string): string {
  const s = v.trim();
  for (const prefix of [`'${table.replace(/'/g, "''")}'[`, `${table}[`]) {
    if (s.startsWith(prefix) && s.endsWith(']')) return s.slice(prefix.length, -1).replace(/\]\]/g, ']');
  }
  return v;
}

/** Id lookups built from INFO.TABLES / INFO.COLUMNS (or the [ID] column INFO.VIEW also returns). */
export interface IdLookups {
  tables: Map<string, string>;
  columns: Map<string, { table: string; name: string }>;
}

export function emptyLookups(): IdLookups {
  return { tables: new Map(), columns: new Map() };
}

function tableNameOf(rec: Rec, lookups: IdLookups): string {
  const direct = pick(rec, 'table', 'tablename');
  if (direct !== undefined) return str(direct);
  const id = pick(rec, 'tableid');
  if (id !== undefined) {
    const name = lookups.tables.get(str(id));
    if (name) return name;
    throw new MetadataParseError(`Table id ${str(id)} could not be resolved.`);
  }
  throw new MetadataParseError('The result has no table column.');
}

function requireName(rec: Rec, ...names: string[]): string {
  const v = pick(rec, ...names);
  if (v === undefined) throw new MetadataParseError(`The result has no ${names[0]} column.`);
  return str(v);
}

export function parseTables(table: ModelTable, lookups: IdLookups = emptyLookups()): TableInfo[] {
  return toRecords(table).map((r) => {
    const name = requireName(r, 'name');
    const id = pick(r, 'id');
    if (id !== undefined) lookups.tables.set(str(id), name);
    return {
      name,
      description: str(pick(r, 'description')).trim(),
      isHidden: bool(pick(r, 'ishidden')),
      columnCount: null,
      measureCount: null,
      storageMode: has(r, 'storagemode') ? str(pick(r, 'storagemode')) || null : null,
      dataCategory: str(pick(r, 'datacategory')) || null,
    };
  });
}

export function parseColumns(table: ModelTable, lookups: IdLookups = emptyLookups()): ColumnInfo[] {
  const out: ColumnInfo[] = [];
  for (const r of toRecords(table)) {
    const kind = columnKind(pick(r, 'type'));
    const name = requireName(r, 'name', 'explicitname', 'inferredname');
    const tableName = tableNameOf(r, lookups);
    const id = pick(r, 'id');
    if (id !== undefined) lookups.columns.set(str(id), { table: tableName, name });
    if (kind === 'rowNumber' || /^RowNumber-[0-9A-F-]+$/i.test(name)) continue;
    const explicit = dataTypeName(pick(r, 'datatype', 'explicitdatatype'));
    const dataType = explicit === 'Automatic' || explicit === 'Unknown' ? dataTypeName(pick(r, 'inferreddatatype') ?? explicit) : explicit;
    out.push({
      table: tableName,
      name,
      dataType,
      isHidden: bool(pick(r, 'ishidden')),
      description: str(pick(r, 'description')).trim(),
      displayFolder: str(pick(r, 'displayfolder')).trim(),
      kind,
      formatString: str(pick(r, 'formatstring')),
    });
  }
  return out;
}

export function parseMeasures(table: ModelTable, lookups: IdLookups = emptyLookups()): MeasureInfo[] {
  return toRecords(table).map((r) => {
    const expr = pick(r, 'expression');
    const dt = pick(r, 'datatype');
    return {
      table: tableNameOf(r, lookups),
      name: requireName(r, 'name'),
      expression: expr === undefined ? null : str(expr),
      formatString: str(pick(r, 'formatstring')),
      description: str(pick(r, 'description')).trim(),
      displayFolder: str(pick(r, 'displayfolder')).trim(),
      isHidden: bool(pick(r, 'ishidden')),
      dataType: dt === undefined ? null : dataTypeName(dt),
    };
  });
}

function endOf(r: Rec, side: 'from' | 'to', lookups: IdLookups): { table: string; column: string } {
  const t = pick(r, `${side}table`);
  const c = pick(r, `${side}column`);
  if (t !== undefined && c !== undefined) return { table: str(t), column: bareColumnName(str(c), str(t)) };
  const colId = pick(r, `${side}columnid`);
  if (colId !== undefined) {
    const col = lookups.columns.get(str(colId));
    if (col) return { table: col.table, column: col.name };
  }
  const tableId = pick(r, `${side}tableid`);
  if (t === undefined && tableId === undefined) throw new MetadataParseError(`The result has no ${side} table column.`);
  throw new MetadataParseError(`The ${side} end of a relationship could not be resolved.`);
}

export function parseRelationships(table: ModelTable, lookups: IdLookups = emptyLookups()): RelationshipInfo[] {
  return toRecords(table).map((r, i) => {
    const from = endOf(r, 'from', lookups);
    const to = endOf(r, 'to', lookups);
    return {
      name: str(pick(r, 'name', 'id')) || `relationship-${i + 1}`,
      fromTable: from.table,
      fromColumn: from.column,
      toTable: to.table,
      toColumn: to.column,
      isActive: has(r, 'isactive') ? bool(pick(r, 'isactive')) : true,
      crossFilter: crossFilter(pick(r, 'crossfilteringbehavior', 'crossfilter')),
      cardinality: cardinalityOf(endCardinality(pick(r, 'fromcardinality')), endCardinality(pick(r, 'tocardinality'))),
    };
  });
}
