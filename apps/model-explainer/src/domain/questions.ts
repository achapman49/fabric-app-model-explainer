/**
 * Sample question generator: for up to 6 visible numeric measures, up to 4 visible text or date columns on tables
 * related to the measure's table, "What is [measure] by [column]?" with a ready-made TOPN/SUMMARIZECOLUMNS query.
 */
import { QUESTIONS } from '../config/rules';
import { topByQuery } from './dax';
import { isNumericMeasure } from './metadata';
import { isDateType, isTextType } from './parse';
import type { ColumnInfo, MeasureInfo, ModelMetadata, RelationshipInfo } from './types';

export interface SampleQuestion {
  id: string;
  measure: MeasureInfo;
  column: ColumnInfo;
  text: string;
  dax: string;
}

export interface QuestionGroup {
  measure: MeasureInfo;
  questions: SampleQuestion[];
}

/** Tables referenced in a DAX expression: 'Sales Order'[x], Sales[x], 'Manager''s Targets'. */
export function referencedTables(expression: string | null, known: string[]): string[] {
  if (!expression) return [];
  const found = new Set<string>();
  const quoted = /'((?:[^']|'')+)'/g;
  let m: RegExpExecArray | null;
  while ((m = quoted.exec(expression))) found.add(m[1].replace(/''/g, "'"));
  const bare = /(?:^|[^\w'\]])([A-Za-z_][\w]*)\s*\[/g;
  while ((m = bare.exec(expression))) found.add(m[1]);
  return known.filter((t) => found.has(t));
}

/**
 * Tables that can slice a measure: its home table and the tables its expression references, then every table reachable
 * by following active relationships from the many side to the one side (fact -> dimension -> outrigger).
 * Both-direction relationships are followed both ways. Order is breadth-first (closest first).
 */
export function slicingTables(seeds: string[], relationships: RelationshipInfo[]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const queue = [...seeds];
  while (queue.length) {
    const t = queue.shift()!;
    if (seen.has(t)) continue;
    seen.add(t);
    order.push(t);
    for (const r of relationships) {
      if (!r.isActive) continue;
      const forward = r.cardinality === 'one-to-many' ? r.toTable === t ? r.fromTable : null : r.fromTable === t ? r.toTable : null;
      if (forward && !seen.has(forward)) queue.push(forward);
      if (r.crossFilter === 'both' || r.cardinality === 'one-to-one' || r.cardinality === 'many-to-many') {
        const other = r.fromTable === t ? r.toTable : r.toTable === t ? r.fromTable : null;
        if (other && !seen.has(other)) queue.push(other);
      }
    }
  }
  return order;
}

const KEY_LIKE = /(^|\s|_)(key|id|guid|sk)$|(Key|ID|Id)$/;

export function isQuestionColumn(c: ColumnInfo): boolean {
  return !c.isHidden && (isTextType(c.dataType) || isDateType(c.dataType)) && !KEY_LIKE.test(c.name);
}

/** Question columns of one table, text before date (Month reads better than Date). */
function candidates(meta: ModelMetadata, table: string): ColumnInfo[] {
  const cols = meta.columns.filter((c) => c.table === table && isQuestionColumn(c));
  return [...cols.filter((c) => isTextType(c.dataType)), ...cols.filter((c) => !isTextType(c.dataType))];
}

export function generateQuestions(meta: ModelMetadata): QuestionGroup[] {
  const tableNames = [...new Set([...meta.tables.map((t) => t.name), ...meta.columns.map((c) => c.table)])];
  const hiddenTables = new Set(meta.tables.filter((t) => t.isHidden).map((t) => t.name));
  // Not sliced up front: a measure with no column to group by is skipped and the next one takes its place.
  const measures = meta.measures.filter((m) => !m.isHidden && isNumericMeasure(m));
  const groups: QuestionGroup[] = [];
  for (const measure of measures) {
    if (groups.length >= QUESTIONS.maxMeasures) break;
    const seeds = [measure.table, ...referencedTables(measure.expression, tableNames)];
    const tables = slicingTables(seeds, meta.relationships).filter((t) => !hiddenTables.has(t));
    // Prefer columns on related tables; the measure's own table comes last.
    const ordered = [...tables.filter((t) => t !== measure.table), ...tables.filter((t) => t === measure.table)];
    const columns: ColumnInfo[] = [];
    for (const t of ordered) {
      // One column per table first, so the questions cover several angles.
      const first = candidates(meta, t)[0];
      if (first) columns.push(first);
      if (columns.length >= QUESTIONS.maxColumns) break;
    }
    if (columns.length < QUESTIONS.maxColumns) {
      for (const t of ordered) {
        for (const c of candidates(meta, t)) {
          if (columns.length >= QUESTIONS.maxColumns) break;
          if (!columns.includes(c)) columns.push(c);
        }
      }
    }
    if (!columns.length) continue;
    groups.push({
      measure,
      questions: columns.map((column, i) => ({
        id: `${groups.length}-${i}`,
        measure,
        column,
        // Two columns with the same name (Region on two tables) are told apart by their table.
        text: `What is ${measure.name} by ${columns.filter((c) => c.name === column.name).length > 1 ? `${column.name} (${column.table})` : column.name}?`,
        dax: topByQuery(column.table, column.name, measure.name),
      })),
    });
  }
  return groups;
}

/** Why Try it has nothing to offer for this model, or null when it has questions. */
export function noQuestionsReason(meta: ModelMetadata, groups: QuestionGroup[]): string | null {
  if (groups.length) return null;
  if (!meta.sections.measures.ok) return 'Measure metadata is not available for this model, so no questions can be generated.';
  if (!meta.measures.length) return 'This model has no measures. Sample questions pair a measure with a column, so there is nothing to ask yet.';
  if (!meta.measures.some((m) => !m.isHidden && isNumericMeasure(m))) return 'This model has no visible numeric measures to ask about.';
  if (!meta.sections.columns.ok) return 'Column metadata is not available for this model, so no questions can be generated.';
  return 'No visible text or date columns are related to the measures, so there is nothing to group by.';
}
