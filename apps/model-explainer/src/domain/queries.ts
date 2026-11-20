/** On-demand queries (Count rows, Try it). Thin wrappers over ModelClient that never throw for query failures. */
import type { ModelClient, ModelQueryResult } from '@x10/shared/connectors';

import { TRY_ROW_LIMIT } from '../config/rules';
import { countAllRowsQuery, countRowsQuery, quotesBalanced } from './dax';
import { normalizeColumnName } from './parse';

export type Outcome<T> = { ok: true; value: T; query: string } | { ok: false; error: { category: string; message: string }; query: string };

function failed(res: ModelQueryResult & { status: 'error' }, query: string): Outcome<never> {
  return { ok: false, error: { category: String(res.error.category), message: res.error.message }, query };
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export async function countRows(client: ModelClient, table: string): Promise<Outcome<number>> {
  const query = countRowsQuery(table);
  const res = await client.executeQuery(query, { rowLimit: 1 });
  if (res.status === 'error') return failed(res, query);
  const v = res.table.rows[0]?.[0];
  // COUNTROWS of an empty table is BLANK.
  if (v === null || v === undefined) return { ok: true, value: 0, query };
  const n = toNumber(v);
  if (n === null) return { ok: false, error: { category: 'query', message: `Unexpected result: ${String(v)}` }, query };
  return { ok: true, value: n, query };
}

/** Tables per batched count query (keeps each query small). */
export const COUNT_BATCH = 20;

/**
 * Row counts for many tables, a batch of COUNT_BATCH per query. Returns the counts that came back and the first error
 * (if any batch failed), so a partial answer still shows.
 */
export async function countAllRows(
  client: ModelClient,
  tables: string[],
): Promise<{ counts: Map<string, number>; error: { category: string; message: string } | null }> {
  const counts = new Map<string, number>();
  let error: { category: string; message: string } | null = null;
  for (let i = 0; i < tables.length; i += COUNT_BATCH) {
    const batch = tables.slice(i, i + COUNT_BATCH);
    const query = countAllRowsQuery(batch);
    const res = await client.executeQuery(query, { rowLimit: batch.length });
    if (res.status === 'error') {
      error ??= { category: String(res.error.category), message: res.error.message };
      continue;
    }
    const cols = res.table.columns.map((c) => normalizeColumnName(c.name));
    const ti = Math.max(0, cols.indexOf('t'));
    const ni = cols.indexOf('n') >= 0 ? cols.indexOf('n') : 1;
    for (const row of res.table.rows) {
      const name = String(row[ti] ?? '');
      const v = row[ni];
      // COUNTROWS of an empty table is BLANK.
      const n = v === null || v === undefined ? 0 : toNumber(v);
      if (name && n !== null) counts.set(name, n);
    }
  }
  return { counts, error };
}

export interface QuestionResult {
  columnLabel: string;
  rows: { label: string; value: number | null; raw: unknown }[];
}

export async function runQuestion(client: ModelClient, dax: string, columnLabel: string): Promise<Outcome<QuestionResult>> {
  if (!quotesBalanced(dax)) return { ok: false, error: { category: 'validation', message: 'The generated query has unbalanced quotes.' }, query: dax };
  const res = await client.executeQuery(dax, { rowLimit: TRY_ROW_LIMIT });
  if (res.status === 'error') return failed(res, dax);
  const cols = res.table.columns.map((c) => normalizeColumnName(c.name));
  let vi = cols.lastIndexOf('v');
  if (vi < 0) vi = cols.length - 1;
  const li = vi === 0 ? 1 : 0;
  return {
    ok: true,
    query: dax,
    value: {
      columnLabel,
      rows: res.table.rows.map((r) => ({ label: formatCell(r[li]), value: toNumber(r[vi]), raw: r[vi] })),
    },
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

/** Display a cell value: dates in the viewer's locale, blanks as (Blank), numbers with grouping. */
export function formatCell(v: unknown): string {
  if (v === null || v === undefined || v === '') return '(Blank)';
  if (v instanceof Date) return v.toLocaleDateString();
  if (typeof v === 'string' && ISO_DATE.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(undefined, { timeZone: 'UTC' });
  }
  if (typeof v === 'number') return formatNumber(v);
  return String(v);
}

export function formatNumber(v: number | null): string {
  if (v === null) return '(Blank)';
  const abs = Math.abs(v);
  const digits = abs !== 0 && abs < 1 ? 3 : abs < 100 && !Number.isInteger(v) ? 2 : 0;
  return v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
