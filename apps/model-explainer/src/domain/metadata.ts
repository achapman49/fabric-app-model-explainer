/**
 * Load a ModelMetadata object through a ModelClient. Each section tries `INFO.<X>()` first and falls back to
 * `INFO.VIEW.<X>()`; a section where both fail is marked unavailable (with the last error) and the others still load.
 * Never throws for query failures, so every screen can degrade per section.
 */
import type { ModelClient, ModelTable } from '@x10/shared/connectors';
import { describeError } from '@x10/shared/lib';

import { emptyLookups, isNumericType, parseColumns, parseMeasures, parseRelationships, parseTables, type IdLookups } from './parse';
import type { MeasureInfo, MetadataSource, ModelMetadata, SectionError, SectionKey, SectionStatus } from './types';

/** Row cap for metadata queries: a guard, not a ranking (large models stay well under it). */
export const METADATA_ROW_LIMIT = 20_000;

const FUNCTIONS: Record<SectionKey, string> = {
  tables: 'TABLES',
  columns: 'COLUMNS',
  measures: 'MEASURES',
  relationships: 'RELATIONSHIPS',
};

export function metadataQueries(section: SectionKey): { source: MetadataSource; query: string }[] {
  const fn = FUNCTIONS[section];
  return [
    { source: 'INFO', query: `EVALUATE INFO.${fn}()` },
    { source: 'INFO.VIEW', query: `EVALUATE INFO.VIEW.${fn}()` },
  ];
}

async function loadSection<T>(
  client: ModelClient,
  section: SectionKey,
  parse: (table: ModelTable) => T[],
): Promise<{ items: T[]; status: SectionStatus }> {
  let last: SectionError = { category: 'unknown', message: 'Not attempted.' };
  const attempts: string[] = [];
  for (const { source, query } of metadataQueries(section)) {
    attempts.push(query);
    const res = await client.executeQuery(query, { rowLimit: METADATA_ROW_LIMIT });
    if (res.status === 'error') {
      last = { category: String(res.error.category), message: res.error.message };
      continue;
    }
    try {
      return { items: parse(res.table), status: { ok: true, source } };
    } catch (err) {
      last = describeError(err);
    }
  }
  return { items: [], status: { ok: false, error: last, attempts } };
}

export async function loadMetadata(client: ModelClient, now: Date = new Date()): Promise<ModelMetadata> {
  const lookups: IdLookups = emptyLookups();
  // Order matters: tables and columns fill the id lookups the INFO.* relationship and measure rows need.
  const tables = await loadSection(client, 'tables', (t) => parseTables(t, lookups));
  const columns = await loadSection(client, 'columns', (t) => parseColumns(t, lookups));
  const [measures, relationships] = await Promise.all([
    loadSection(client, 'measures', (t) => parseMeasures(t, lookups)),
    loadSection(client, 'relationships', (t) => parseRelationships(t, lookups)),
  ]);

  const colCount = new Map<string, number>();
  for (const c of columns.items) colCount.set(c.table, (colCount.get(c.table) ?? 0) + 1);
  const measureCount = new Map<string, number>();
  for (const m of measures.items) measureCount.set(m.table, (measureCount.get(m.table) ?? 0) + 1);

  return {
    modelLabel: client.label,
    tables: tables.items.map((t) => ({
      ...t,
      columnCount: columns.status.ok ? (colCount.get(t.name) ?? 0) : null,
      measureCount: measures.status.ok ? (measureCount.get(t.name) ?? 0) : null,
    })),
    columns: columns.items,
    measures: measures.items,
    relationships: relationships.items,
    sections: {
      tables: tables.status,
      columns: columns.status,
      measures: measures.status,
      relationships: relationships.status,
    },
    loadedAt: now.toISOString(),
  };
}

/** Table names known from any section, so the diagram still works when INFO tables are unavailable. */
export function allTableNames(meta: ModelMetadata): string[] {
  const names = new Set(meta.tables.map((t) => t.name));
  for (const r of meta.relationships) {
    names.add(r.fromTable);
    names.add(r.toTable);
  }
  return [...names];
}

export function hiddenObjectCount(meta: ModelMetadata): number {
  return (
    meta.tables.filter((t) => t.isHidden).length +
    meta.columns.filter((c) => c.isHidden).length +
    meta.measures.filter((m) => m.isHidden).length
  );
}

/** True when every measure came back without its DAX (common through the query API). */
export function expressionsHidden(meta: ModelMetadata): boolean {
  return meta.measures.length > 0 && meta.measures.every((m) => m.expression === null || m.expression.trim() === '');
}

export const EXPRESSIONS_HIDDEN_NOTE =
  "Expressions aren't exposed by the query API for this model, so measure DAX is not shown. Names, folders, format strings and descriptions are.";

/**
 * Whether a measure returns a number. Uses the metadata data type when present (Number, Currency, Integer, Decimal,
 * Double, Int64); otherwise treats it as numeric unless the expression visibly builds text (FORMAT, CONCATENATE, a
 * string literal).
 */
export function isNumericMeasure(m: MeasureInfo): boolean {
  if (m.dataType && !/^(unknown|variant|automatic)$/i.test(m.dataType)) return isNumericType(m.dataType);
  const e = (m.expression ?? '').trim();
  return !/^(FORMAT|CONCATENATE|CONCATENATEX|COMBINEVALUES|UNICHAR|")/i.test(e);
}

/** Section-level availability helpers for the screens. */
export function sectionOk(meta: ModelMetadata, key: SectionKey): boolean {
  return meta.sections[key].ok;
}
