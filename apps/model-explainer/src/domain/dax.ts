/**
 * DAX string builders. Names are always quoted: table names in single quotes with ' doubled, column and measure names
 * in brackets with ] doubled. Never concatenate a raw name into a query.
 */
import { daxBracket, daxColumn, daxString, daxTable } from '@x10/shared/connectors';

import { QUESTIONS } from '../config/rules';

export { daxBracket, daxColumn, daxString, daxTable };

/** EVALUATE ROW("n", COUNTROWS('<table>')) */
export function countRowsQuery(table: string): string {
  return `EVALUATE ROW("n", COUNTROWS(${daxTable(table)}))`;
}

/**
 * Row counts for several tables in one query:
 * EVALUATE UNION(ROW("t", "<table>", "n", COUNTROWS('<table>')), …). One table: EVALUATE ROW(…).
 */
export function countAllRowsQuery(tables: string[]): string {
  const rows = tables.map((t) => `ROW("t", ${daxString(t)}, "n", COUNTROWS(${daxTable(t)}))`);
  return rows.length === 1 ? `EVALUATE ${rows[0]}` : `EVALUATE UNION(${rows.join(', ')})`;
}

/** EVALUATE TOPN(20, SUMMARIZECOLUMNS('<table>'[<column>], "v", [<measure>]), [v], DESC) */
export function topByQuery(table: string, column: string, measure: string, n: number = QUESTIONS.topN): string {
  return `EVALUATE TOPN(${n}, SUMMARIZECOLUMNS(${daxColumn(table, column)}, "v", ${daxBracket(measure)}), [v], DESC)`;
}

/**
 * Split a DAX query into tokens well enough to check that every quoted name is closed. Used by tests and as a guard
 * before running generated DAX.
 */
export function quotesBalanced(dax: string): boolean {
  let i = 0;
  while (i < dax.length) {
    const c = dax[i];
    if (c === "'" || c === '"') {
      i++;
      for (;;) {
        if (i >= dax.length) return false;
        if (dax[i] === c) {
          if (dax[i + 1] === c) i += 2;
          else break;
        } else i++;
      }
    } else if (c === '[') {
      i++;
      for (;;) {
        if (i >= dax.length) return false;
        if (dax[i] === ']') {
          if (dax[i + 1] === ']') i += 2;
          else break;
        } else i++;
      }
    } else if (c === ']') return false;
    i++;
  }
  return true;
}

/** Parse the quoted pieces back out ('T''x' -> T'x, [a]]b] -> a]b), in order. For tests and the mock engine. */
export function quotedNames(dax: string): { kind: 'table' | 'bracket' | 'string'; value: string }[] {
  const out: { kind: 'table' | 'bracket' | 'string'; value: string }[] = [];
  const re = /'((?:[^']|'')*)'|\[((?:[^\]]|\]\])*)\]|"((?:[^"]|"")*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(dax))) {
    if (m[1] !== undefined) out.push({ kind: 'table', value: m[1].replace(/''/g, "'") });
    else if (m[2] !== undefined) out.push({ kind: 'bracket', value: m[2].replace(/\]\]/g, ']') });
    else out.push({ kind: 'string', value: m[3].replace(/""/g, '"') });
  }
  return out;
}
