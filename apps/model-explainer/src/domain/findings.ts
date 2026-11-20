/** Health rules and score. Pure functions over ModelMetadata; thresholds come from src/config/rules.ts. */
import { RULES } from '../config/rules';
import { isNumericMeasure } from './metadata';
import type { ModelMetadata, SectionKey } from './types';

export type Severity = 'warning' | 'info';

export type RuleId =
  | 'measures-no-description'
  | 'tables-no-description'
  | 'measures-no-format'
  | 'bidirectional'
  | 'many-to-many'
  | 'inactive'
  | 'unfriendly-names'
  | 'wide-tables';

export interface RuleDef {
  id: RuleId;
  title: string;
  severity: Severity;
  /** When the rule fires, in plain words. */
  condition: string;
  /** Why it matters and what to do. */
  advice: string;
  needs: SectionKey[];
}

export interface Finding {
  rule: RuleId;
  title: string;
  severity: Severity;
  /** One-sentence summary with counts. */
  summary: string;
  advice: string;
  /** Affected objects, such as "Sales[Gross Margin]" or "Sales → Customer". */
  objects: string[];
}

export interface HealthReport {
  findings: Finding[];
  passed: RuleDef[];
  /** Rules that could not run because a metadata section is not available. */
  skipped: { rule: RuleDef; missing: SectionKey[] }[];
  score: number;
  warnings: number;
  infos: number;
}

const pct = Math.round(RULES.measureDescriptionShare * 100);

export const RULE_DEFS: RuleDef[] = [
  {
    id: 'measures-no-description',
    title: 'Measures without a description',
    severity: 'warning',
    condition: `More than ${pct}% of visible measures have no description.`,
    advice: 'Descriptions show up as tooltips in reports and Copilot uses them. Add one line per measure saying what it counts.',
    needs: ['measures'],
  },
  {
    id: 'tables-no-description',
    title: 'Tables without a description',
    severity: 'info',
    condition: 'Any visible table has no description.',
    advice: 'Say what one row of the table is and where it comes from.',
    needs: ['tables'],
  },
  {
    id: 'measures-no-format',
    title: 'Measures without a format string',
    severity: 'warning',
    condition: 'Any numeric measure has an empty format string.',
    advice: 'Unformatted numbers show raw decimals. Set a currency, whole number or percentage format.',
    needs: ['measures'],
  },
  {
    id: 'bidirectional',
    title: 'Bidirectional relationships',
    severity: 'warning',
    condition: 'Any relationship filters in both directions.',
    advice: 'Both-direction filtering can make totals ambiguous and slow. Prefer single direction and use CROSSFILTER in the measures that need it.',
    needs: ['relationships'],
  },
  {
    id: 'many-to-many',
    title: 'Many-to-many relationships',
    severity: 'warning',
    condition: 'Any relationship has many-to-many cardinality.',
    advice: 'Many-to-many joins can repeat values and confuse totals. Check whether a bridge or dimension table is missing.',
    needs: ['relationships'],
  },
  {
    id: 'inactive',
    title: 'Inactive relationships',
    severity: 'info',
    condition: 'Any relationship is inactive.',
    advice: 'Inactive relationships only work through USERELATIONSHIP. Make sure measures that need them say so.',
    needs: ['relationships'],
  },
  {
    id: 'unfriendly-names',
    title: 'Unfriendly names',
    severity: 'info',
    condition: `Visible tables, columns or measures with underscores, a leading tbl or dim, or all-caps names (${RULES.allCapsMinLetters}+ letters).`,
    advice: 'Report authors and Copilot read these names. Use plain words with spaces, such as "Promotion Name".',
    needs: ['tables', 'columns', 'measures'],
  },
  {
    id: 'wide-tables',
    title: 'Large wide tables',
    severity: 'info',
    condition: `Visible tables with more than ${RULES.wideTableColumns} columns.`,
    advice: 'Wide tables are hard to browse. Hide technical columns or split attributes into their own dimension.',
    needs: ['tables', 'columns'],
  },
];

export function ruleDef(id: RuleId): RuleDef {
  return RULE_DEFS.find((r) => r.id === id)!;
}

/** Underscores, a leading "tbl"/"dim" prefix (dim_Promo, DimDate, tblSales), or ALL CAPS. */
export function unfriendlyReason(name: string): string | null {
  if (name.includes('_')) return 'underscore';
  const prefix = /^(tbl|dim)/i.exec(name);
  if (prefix) {
    const next = name[3];
    if (next === undefined || /[\s\-0-9]/.test(next) || (next !== next.toLowerCase() && next === next.toUpperCase()))
      return `leading ${prefix[1].toLowerCase()}`;
  }
  const letters = name.match(/\p{L}/gu) ?? [];
  if (letters.length >= RULES.allCapsMinLetters && !/\p{Ll}/u.test(name)) return 'all caps';
  return null;
}

export const ref = (table: string, name: string) => `${table}[${name}]`;

function finding(id: RuleId, summary: string, objects: string[]): Finding {
  const d = ruleDef(id);
  return { rule: id, title: d.title, severity: d.severity, summary, advice: d.advice, objects };
}

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Each rule returns a finding or null. */
const CHECKS: Record<RuleId, (m: ModelMetadata) => Finding | null> = {
  'measures-no-description': (m) => {
    const visible = m.measures.filter((x) => !x.isHidden);
    const missing = visible.filter((x) => !x.description);
    if (!visible.length || missing.length / visible.length <= RULES.measureDescriptionShare) return null;
    const share = Math.round((missing.length / visible.length) * 100);
    return finding(
      'measures-no-description',
      `${missing.length} of ${visible.length} visible measures (${share}%) have no description.`,
      missing.map((x) => ref(x.table, x.name)),
    );
  },
  'tables-no-description': (m) => {
    const missing = m.tables.filter((t) => !t.isHidden && !t.description);
    return missing.length
      ? finding('tables-no-description', `${n(missing.length, 'visible table')} ${missing.length === 1 ? 'has' : 'have'} no description.`, missing.map((t) => t.name))
      : null;
  },
  'measures-no-format': (m) => {
    const missing = m.measures.filter((x) => isNumericMeasure(x) && !x.formatString.trim());
    return missing.length
      ? finding('measures-no-format', `${n(missing.length, 'numeric measure')} ${missing.length === 1 ? 'has' : 'have'} no format string.`, missing.map((x) => ref(x.table, x.name)))
      : null;
  },
  bidirectional: (m) => {
    const hits = m.relationships.filter((r) => r.crossFilter === 'both');
    return hits.length
      ? finding('bidirectional', `${n(hits.length, 'relationship')} ${hits.length === 1 ? 'filters' : 'filter'} in both directions.`, hits.map(relLabel))
      : null;
  },
  'many-to-many': (m) => {
    const hits = m.relationships.filter((r) => r.cardinality === 'many-to-many');
    return hits.length
      ? finding('many-to-many', `${n(hits.length, 'relationship')} ${hits.length === 1 ? 'is' : 'are'} many-to-many.`, hits.map(relLabel))
      : null;
  },
  inactive: (m) => {
    const hits = m.relationships.filter((r) => !r.isActive);
    return hits.length
      ? finding('inactive', `${n(hits.length, 'relationship')} ${hits.length === 1 ? 'is' : 'are'} inactive.`, hits.map(relLabel))
      : null;
  },
  'unfriendly-names': (m) => {
    const objects: string[] = [];
    for (const t of m.tables) if (!t.isHidden && unfriendlyReason(t.name)) objects.push(`${t.name} (table, ${unfriendlyReason(t.name)})`);
    for (const c of m.columns) if (!c.isHidden && unfriendlyReason(c.name)) objects.push(`${ref(c.table, c.name)} (column, ${unfriendlyReason(c.name)})`);
    for (const x of m.measures) if (!x.isHidden && unfriendlyReason(x.name)) objects.push(`${ref(x.table, x.name)} (measure, ${unfriendlyReason(x.name)})`);
    return objects.length ? finding('unfriendly-names', `${n(objects.length, 'visible name')} could be friendlier.`, objects) : null;
  },
  'wide-tables': (m) => {
    const hits = m.tables.filter((t) => !t.isHidden && (t.columnCount ?? 0) > RULES.wideTableColumns);
    return hits.length
      ? finding('wide-tables', `${n(hits.length, 'visible table')} ${hits.length === 1 ? 'has' : 'have'} more than ${RULES.wideTableColumns} columns.`, hits.map((t) => `${t.name} (${t.columnCount} columns)`))
      : null;
  },
};

export function relLabel(r: { fromTable: string; fromColumn: string; toTable: string; toColumn: string }): string {
  return `${ref(r.fromTable, r.fromColumn)} → ${ref(r.toTable, r.toColumn)}`;
}

/** 100 − 10 per warning (at most 50) − 2 per info (at most 20). */
export function healthScore(warnings: number, infos: number): number {
  const s = RULES.score;
  return s.start - Math.min(s.warningCap, warnings * s.perWarning) - Math.min(s.infoCap, infos * s.perInfo);
}

export const SCORE_FORMULA = `Score = ${RULES.score.start} − ${RULES.score.perWarning} per warning (at most ${RULES.score.warningCap}) − ${RULES.score.perInfo} per info (at most ${RULES.score.infoCap}). Each rule counts once, however many objects it flags.`;

export function evaluateHealth(meta: ModelMetadata): HealthReport {
  const findings: Finding[] = [];
  const passed: RuleDef[] = [];
  const skipped: HealthReport['skipped'] = [];
  for (const def of RULE_DEFS) {
    const missing = def.needs.filter((k) => !meta.sections[k].ok);
    if (missing.length) {
      skipped.push({ rule: def, missing });
      continue;
    }
    const f = CHECKS[def.id](meta);
    if (f) findings.push(f);
    else passed.push(def);
  }
  findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warning' ? -1 : 1));
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const infos = findings.length - warnings;
  return { findings, passed, skipped, score: healthScore(warnings, infos), warnings, infos };
}

export function scoreTone(score: number): 'ok' | 'warn' | 'bad' {
  return score >= 80 ? 'ok' : score >= 60 ? 'warn' : 'bad';
}

export function scoreLabel(score: number): string {
  return score >= 80 ? 'Healthy' : score >= 60 ? 'Needs attention' : 'Needs work';
}
