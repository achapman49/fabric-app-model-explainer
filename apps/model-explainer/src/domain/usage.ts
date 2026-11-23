/**
 * Where columns and measures are used, read from measure DAX. A light text scan, not a parser: comments and strings are
 * not excluded, so treat the results as a guide.
 */
import type { MeasureInfo, ModelMetadata } from './types';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `[Name]` as written in DAX: a closing bracket in the name is doubled. */
const bracket = (name: string) => `\\[\\s*${esc(name.replace(/]/g, ']]'))}\\s*\\]`;

/** A reference to Table[Column], written 'Table'[Column] or, for simple names, Table[Column]. Case-insensitive. */
export function refersToColumn(expression: string | null, table: string, column: string): boolean {
  if (!expression) return false;
  const quoted = `'${esc(table.replace(/'/g, "''"))}'`;
  const bare = /^[A-Za-z_][\w]*$/.test(table) ? `|(?<![\\w'])${esc(table)}` : '';
  return new RegExp(`(?:${quoted}${bare})\\s*${bracket(column)}`, 'i').test(expression);
}

/** An unqualified [Name] (how measures are referenced): not preceded by a table name. Case-insensitive. */
export function refersToMeasure(expression: string | null, name: string): boolean {
  if (!expression) return false;
  const re = new RegExp(bracket(name), 'gi');
  for (let m = re.exec(expression); m; m = re.exec(expression)) {
    const before = expression.slice(0, m.index).trimEnd();
    // 'Table'[x], Table[x] and Table [x] are columns.
    if (!/[\w']$/.test(before)) return true;
  }
  return false;
}

export function measuresUsingColumn(meta: ModelMetadata, table: string, column: string): MeasureInfo[] {
  return meta.measures.filter((m) => refersToColumn(m.expression, table, column));
}

/** Measures whose DAX refers to this measure. */
export function measuresUsingMeasure(meta: ModelMetadata, measure: MeasureInfo): MeasureInfo[] {
  return meta.measures.filter((m) => m !== measure && refersToMeasure(m.expression, measure.name));
}

/** Measures this measure's DAX refers to. */
export function measureDependencies(meta: ModelMetadata, measure: MeasureInfo): MeasureInfo[] {
  return meta.measures.filter((m) => m !== measure && refersToMeasure(measure.expression, m.name));
}
