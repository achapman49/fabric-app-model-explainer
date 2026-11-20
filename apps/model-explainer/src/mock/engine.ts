/**
 * Mock query engine for the fictional models. Mirrors the tenant behaviour seen through the connector:
 * INFO.TABLES/COLUMNS/MEASURES/RELATIONSHIPS fail, INFO.VIEW.* work and return bracketed column names. Also answers the
 * app's Count rows and Try it queries with deterministic, plausible values.
 */
import { errorResult, MockModelClient, tableResult, type ModelQueryResult } from '@x10/shared/connectors';

import { quotedNames } from '../domain/dax';
import type { SectionKey } from '../domain/types';
import { financeModel, operationsModel } from './otherModels';
import { salesModel } from './salesModel';
import type { MockColumn, MockMeasure, MockModel } from './spec';

export const MOCK_MODELS: MockModel[] = [salesModel, operationsModel, financeModel];

const SECTION_BY_FN: Record<string, SectionKey> = {
  TABLES: 'tables',
  COLUMNS: 'columns',
  MEASURES: 'measures',
  RELATIONSHIPS: 'relationships',
};

/** FNV-1a hash to [0, 1). */
export function unitHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

const b = (name: string) => `[${name}]`;
const nul = (s: string | undefined) => (s ? s : null);

/** INFO.VIEW.* rows for a section, in the column shape the real engine returns. */
export function infoViewTable(model: MockModel, section: SectionKey): ModelQueryResult {
  switch (section) {
    case 'tables':
      return tableResult(
        ['ID', 'Name', 'DataCategory', 'Description', 'IsHidden', 'StorageMode', 'Expression'].map(b),
        model.tables.map((t, i) => [100 + i, t.name, null, nul(t.description), !!t.isHidden, t.storageMode ?? 'Import', null]),
      );
    case 'columns': {
      const rows: unknown[][] = [];
      let id = 1000;
      model.tables.forEach((t) => {
        // Every table carries an internal RowNumber column, which the app must ignore.
        rows.push([id++, `RowNumber-2662979B17954F74`, t.name, 'Integer', null, null, true, true, 'RowNumber', null, null, null]);
        for (const c of t.columns) {
          rows.push([
            id++,
            c.name,
            t.name,
            c.dataType,
            null,
            nul(c.description),
            !!c.isHidden,
            false,
            c.calculated ? 'Calculated' : 'Data',
            c.calculated ? "'Sales'[Sales Amount] - 'Sales'[Cost Amount]" : null,
            nul(c.formatString),
            nul(c.folder),
          ]);
        }
      });
      return tableResult(
        ['ID', 'Name', 'Table', 'DataType', 'DataCategory', 'Description', 'IsHidden', 'IsKey', 'Type', 'Expression', 'FormatString', 'DisplayFolder'].map(b),
        rows,
      );
    }
    case 'measures':
      return tableResult(
        ['ID', 'Name', 'Table', 'Description', 'DataType', 'Expression', 'FormatString', 'IsHidden', 'State', 'DisplayFolder', 'DataCategory'].map(b),
        model.measures.map((m, i) => [
          5000 + i,
          m.name,
          m.table,
          nul(m.description),
          m.dataType,
          m.expression,
          nul(m.formatString),
          !!m.isHidden,
          'Ready',
          nul(m.folder),
          null,
        ]),
      );
    case 'relationships':
      return tableResult(
        ['ID', 'Name', 'Relationship', 'IsActive', 'CrossFilteringBehavior', 'FromTable', 'FromColumn', 'FromCardinality', 'ToTable', 'ToColumn', 'ToCardinality'].map(b),
        model.relationships.map((r, i) => {
          const fc = r.fromCardinality ?? 'Many';
          const tc = r.toCardinality ?? 'One';
          const arrow = r.crossFilter === 'BothDirections' ? '<->' : '<-';
          const q = (t: string, c: string) => `'${t.replace(/'/g, "''")}'[${c.replace(/]/g, ']]')}]`;
          return [
            9000 + i,
            `rel-${String(i + 1).padStart(2, '0')}`,
            `${q(...r.from)} ${fc === 'Many' ? '*' : '1'}[${arrow}]${tc === 'Many' ? '*' : '1'} ${q(...r.to)}`,
            r.isActive ?? true,
            r.crossFilter ?? 'OneDirection',
            r.from[0],
            r.from[1],
            fc,
            r.to[0],
            r.to[1],
            tc,
          ];
        }),
      );
  }
}

function measureRange(m: MockMeasure): [number, number] {
  if (m.range) return m.range;
  if (/%/.test(m.formatString ?? '')) return [0.1, 0.6];
  return m.dataType === 'Integer' ? [100, 20_000] : [10_000, 1_000_000];
}

function groupValues(table: string, column: MockColumn): string[] {
  if (column.samples?.length) return column.samples;
  if (column.dataType === 'DateTime') {
    // Month starts across the last two years.
    return Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(2025, i, 1)).toISOString().slice(0, 10) + 'T00:00:00');
  }
  if (column.dataType === 'Boolean') return ['True', 'False'];
  return Array.from({ length: 8 }, (_, i) => `${table} ${column.name} ${i + 1}`);
}

function normalise(q: string): string {
  return q.replace(/\s+/g, ' ').trim();
}

/** Answer one query against a mock model. */
export function answer(model: MockModel, query: string): ModelQueryResult {
  const q = normalise(query);
  let m = /^EVALUATE INFO\.(TABLES|COLUMNS|MEASURES|RELATIONSHIPS)\(\)$/i.exec(q);
  if (m) {
    return errorResult('query', `Query (1, 10) The '${m[1].toUpperCase()}' INFO function is not supported through Execute Queries for this model. Use INFO.VIEW.${m[1].toUpperCase()}().`);
  }
  m = /^EVALUATE INFO\.VIEW\.(TABLES|COLUMNS|MEASURES|RELATIONSHIPS)\(\)$/i.exec(q);
  if (m) {
    const section = SECTION_BY_FN[m[1].toUpperCase()];
    if (model.blocked?.includes(section)) {
      return errorResult('api', `The signed-in user cannot read ${section} metadata for this model (403 Forbidden).`);
    }
    return infoViewTable(model, section);
  }
  m = /^EVALUATE ROW\("n", COUNTROWS\('((?:[^']|'')*)'\)\)$/i.exec(q);
  if (m) {
    const name = m[1].replace(/''/g, "'");
    const t = model.tables.find((x) => x.name === name);
    if (!t) return errorResult('query', `Cannot find table '${name}'.`);
    return tableResult(['[n]'], [[t.rows]]);
  }
  if (/^EVALUATE (UNION\()?ROW\("t", /i.test(q)) {
    const re = /ROW\("t", "((?:[^"]|"")*)", "n", COUNTROWS\('((?:[^']|'')*)'\)\)/g;
    const rows: unknown[][] = [];
    let r: RegExpExecArray | null;
    while ((r = re.exec(q))) {
      const name = r[2].replace(/''/g, "'");
      const t = model.tables.find((x) => x.name === name);
      if (!t) return errorResult('query', `Cannot find table '${name}'.`);
      rows.push([r[1].replace(/""/g, '"'), t.rows]);
    }
    if (!rows.length) return errorResult('query', 'The mock model could not read this row count query.');
    return tableResult(['[t]', '[n]'], rows);
  }
  m = /^EVALUATE TOPN\((\d+), SUMMARIZECOLUMNS\((.*)\), \[v\], DESC\)$/i.exec(q);
  if (m) {
    const n = Number(m[1]);
    const parts = quotedNames(m[2]);
    const [t, c, label, meas] = parts;
    if (!t || t.kind !== 'table' || !c || c.kind !== 'bracket' || !label || label.kind !== 'string' || !meas || meas.kind !== 'bracket') {
      return errorResult('query', 'The mock model could not read this SUMMARIZECOLUMNS query.');
    }
    const table = model.tables.find((x) => x.name === t.value);
    if (!table) return errorResult('query', `Cannot find table '${t.value}'.`);
    const column = table.columns.find((x) => x.name === c.value);
    if (!column) return errorResult('query', `Column '${c.value}' in table '${t.value}' cannot be found.`);
    const measure = model.measures.find((x) => x.name === meas.value);
    if (!measure) return errorResult('query', `The value '${meas.value}' cannot be determined. Either the measure does not exist or it is misspelled.`);
    const [lo, hi] = measureRange(measure);
    const rows = groupValues(table.name, column).map((v) => {
      const u = unitHash(`${measure.name}|${column.name}|${v}`);
      const raw = lo + (hi - lo) * Math.pow(u, 1.4);
      const value = measure.dataType === 'Integer' ? Math.round(raw) : Math.round(raw * (hi - lo < 10 ? 10_000 : 100)) / (hi - lo < 10 ? 10_000 : 100);
      return [v, value];
    });
    rows.sort((a, b2) => (b2[1] as number) - (a[1] as number));
    return tableResult([`${t.value}[${c.value}]`, '[v]'], rows.slice(0, n));
  }
  return errorResult('query', 'The demo model only answers the queries this app generates.');
}

/** A MockModelClient for one fictional model. */
export function mockClient(model: MockModel, latencyMs = 0): MockModelClient {
  return new MockModelClient((q) => answer(model, q), model.label, latencyMs);
}
