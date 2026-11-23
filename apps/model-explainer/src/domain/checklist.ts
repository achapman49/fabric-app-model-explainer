/**
 * The Health screen's two halves, as pure functions over ModelMetadata and its HealthReport:
 * - indicators: the headline numbers (score, documentation coverage, relationship risks, names, wide tables), each
 *   tied to the rules behind it so its status matches the score;
 * - the checklist: one actionable item per object a fired rule flags, grouped by rule, warnings first.
 */
import { RULES } from '../config/rules';
import { RULE_DEFS, scoreLabel, scoreTone, unfriendlyReason, type HealthReport, type RuleId, type Severity } from './findings';
import { isNumericMeasure } from './metadata';
import { columnId, measureId, relId, tableId } from './model';
import type { ModelMetadata, RelationshipInfo, SectionKey } from './types';

/* ------------------------------------------------------------------ indicators */

/**
 * Same words and colours as the findings: ok (the rules behind it pass), info (an info rule fired), warn (a warning
 * rule fired), unknown (skipped: metadata not available). Only the score uses bad (below 60).
 */
export type IndicatorStatus = 'ok' | 'info' | 'warn' | 'bad' | 'unknown';

export interface Indicator {
  id: string;
  label: string;
  /** The headline figure, already formatted. */
  value: string;
  /** Small text after the value, such as "/ 100" or "of 13". */
  unit?: string;
  /** 0..1 for figures that are a share (drawn as a meter), else null. */
  ratio: number | null;
  status: IndicatorStatus;
  /** The status in words, shown with its icon (never colour alone). */
  statusLabel: string;
  /** One line under the figure. */
  hint: string;
  /** Rules this indicator summarises (its checklist groups). */
  rules: RuleId[];
}

const STATUS_LABEL: Record<IndicatorStatus, string> = {
  ok: 'Passing',
  info: 'Info',
  warn: 'Warning',
  bad: 'Needs work',
  unknown: 'Not checked',
};

function statusOf(report: HealthReport, rules: RuleId[]): { status: IndicatorStatus; statusLabel: string } {
  const fired = report.findings.filter((f) => rules.includes(f.rule));
  const status: IndicatorStatus = fired.some((f) => f.severity === 'warning')
    ? 'warn'
    : fired.length
      ? 'info'
      : rules.some((r) => report.skipped.some((s) => s.rule.id === r))
        ? 'unknown'
        : 'ok';
  return { status, statusLabel: STATUS_LABEL[status] };
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–');

export function healthIndicators(meta: ModelMetadata, report: HealthReport): Indicator[] {
  const has = (...k: SectionKey[]) => k.every((s) => meta.sections[s].ok);
  const out: Indicator[] = [];

  out.push({
    id: 'score',
    label: 'Health score',
    value: String(report.score),
    unit: '/ 100',
    ratio: report.score / 100,
    status: scoreTone(report.score),
    statusLabel: scoreLabel(report.score),
    hint: `${report.warnings} warning${report.warnings === 1 ? '' : 's'}, ${report.infos} info`,
    rules: [],
  });

  const visibleMeasures = meta.measures.filter((m) => !m.isHidden);
  const described = visibleMeasures.filter((m) => m.description.trim()).length;
  out.push({
    id: 'measures-described',
    label: 'Measures described',
    value: has('measures') ? pct(described, visibleMeasures.length) : 'n/a',
    unit: has('measures') && visibleMeasures.length ? `${described} of ${visibleMeasures.length}` : undefined,
    ratio: has('measures') && visibleMeasures.length ? described / visibleMeasures.length : null,
    ...statusOf(report, ['measures-no-description']),
    hint: `Flags when more than ${Math.round(RULES.measureDescriptionShare * 100)}% of visible measures have none`,
    rules: ['measures-no-description'],
  });

  const numeric = meta.measures.filter(isNumericMeasure);
  const formatted = numeric.filter((m) => m.formatString.trim()).length;
  out.push({
    id: 'measures-formatted',
    label: 'Measures formatted',
    value: has('measures') ? pct(formatted, numeric.length) : 'n/a',
    unit: has('measures') && numeric.length ? `${formatted} of ${numeric.length}` : undefined,
    ratio: has('measures') && numeric.length ? formatted / numeric.length : null,
    ...statusOf(report, ['measures-no-format']),
    hint: 'Numeric measures with a format string',
    rules: ['measures-no-format'],
  });

  const visibleTables = meta.tables.filter((t) => !t.isHidden);
  const tablesDescribed = visibleTables.filter((t) => t.description.trim()).length;
  out.push({
    id: 'tables-described',
    label: 'Tables described',
    value: has('tables') ? pct(tablesDescribed, visibleTables.length) : 'n/a',
    unit: has('tables') && visibleTables.length ? `${tablesDescribed} of ${visibleTables.length}` : undefined,
    ratio: has('tables') && visibleTables.length ? tablesDescribed / visibleTables.length : null,
    ...statusOf(report, ['tables-no-description']),
    hint: 'Visible tables with a description',
    rules: ['tables-no-description'],
  });

  const both = meta.relationships.filter((r) => r.crossFilter === 'both').length;
  const m2m = meta.relationships.filter((r) => r.cardinality === 'many-to-many').length;
  out.push({
    id: 'relationship-risks',
    label: 'Risky relationships',
    value: has('relationships') ? String(both + m2m) : 'n/a',
    unit: has('relationships') ? `of ${meta.relationships.length}` : undefined,
    ratio: null,
    ...statusOf(report, ['bidirectional', 'many-to-many']),
    hint: has('relationships') ? `${both} filter both ways · ${m2m} many-to-many` : 'Relationships could not be read',
    rules: ['bidirectional', 'many-to-many'],
  });

  const inactive = meta.relationships.filter((r) => !r.isActive).length;
  out.push({
    id: 'inactive',
    label: 'Inactive relationships',
    value: has('relationships') ? String(inactive) : 'n/a',
    unit: has('relationships') ? `of ${meta.relationships.length}` : undefined,
    ratio: null,
    ...statusOf(report, ['inactive']),
    hint: 'Only used through USERELATIONSHIP',
    rules: ['inactive'],
  });

  const names = [
    ...meta.tables.filter((t) => !t.isHidden).map((t) => t.name),
    ...meta.columns.filter((c) => !c.isHidden).map((c) => c.name),
    ...meta.measures.filter((m) => !m.isHidden).map((m) => m.name),
  ];
  const friendly = names.filter((n) => !unfriendlyReason(n)).length;
  out.push({
    id: 'friendly-names',
    label: 'Friendly names',
    value: has('tables', 'columns', 'measures') ? pct(friendly, names.length) : 'n/a',
    unit: has('tables', 'columns', 'measures') && names.length ? `${friendly} of ${names.length}` : undefined,
    ratio: has('tables', 'columns', 'measures') && names.length ? friendly / names.length : null,
    ...statusOf(report, ['unfriendly-names']),
    hint: 'Visible names without underscores, tbl/dim or ALL CAPS',
    rules: ['unfriendly-names'],
  });

  const wide = visibleTables.filter((t) => (t.columnCount ?? 0) > RULES.wideTableColumns).length;
  out.push({
    id: 'wide-tables',
    label: 'Wide tables',
    value: has('tables', 'columns') ? String(wide) : 'n/a',
    unit: has('tables', 'columns') ? `of ${visibleTables.length}` : undefined,
    ratio: null,
    ...statusOf(report, ['wide-tables']),
    hint: `Visible tables with more than ${RULES.wideTableColumns} columns`,
    rules: ['wide-tables'],
  });

  return out;
}

/* ------------------------------------------------------------------ checklist */

export interface ChecklistItem {
  /** Stable across reloads: `<rule>|<object id>`. */
  id: string;
  /** Object to open in the diagram (t:, c:, m: or r: id). */
  target: string;
  /** What to do, as an instruction. */
  action: string;
  /** Where, or why. */
  detail: string;
}

export interface ChecklistGroup {
  rule: RuleId;
  title: string;
  severity: Severity;
  advice: string;
  condition: string;
  items: ChecklistItem[];
}

const item = (rule: RuleId, target: string, action: string, detail: string): ChecklistItem => ({ id: `${rule}|${target}`, target, action, detail });

function relItems(meta: ModelMetadata, rule: RuleId, match: (r: RelationshipInfo) => boolean, action: (r: RelationshipInfo) => string): ChecklistItem[] {
  return meta.relationships.flatMap((r, i) =>
    match(r) ? [item(rule, relId(i), action(r), r.fromColumn === r.toColumn ? `on [${r.fromColumn}]` : `on [${r.fromColumn}] = [${r.toColumn}]`)] : [],
  );
}

/** Items for one fired rule: the same objects the rule flags, as things to do. */
function itemsFor(rule: RuleId, meta: ModelMetadata): ChecklistItem[] {
  switch (rule) {
    case 'measures-no-description':
      return meta.measures
        .filter((m) => !m.isHidden && !m.description.trim())
        .map((m) => item(rule, measureId(m.table, m.name), `Describe ${m.name}`, `Measure on ${m.table}`));
    case 'measures-no-format':
      return meta.measures
        .filter((m) => isNumericMeasure(m) && !m.formatString.trim())
        .map((m) => item(rule, measureId(m.table, m.name), `Set a format string on ${m.name}`, `Measure on ${m.table}${m.dataType ? ` · returns ${m.dataType}` : ''}`));
    case 'tables-no-description':
      return meta.tables.filter((t) => !t.isHidden && !t.description.trim()).map((t) => item(rule, tableId(t.name), `Describe the ${t.name} table`, 'Say what one row is and where it comes from'));
    case 'bidirectional':
      return relItems(meta, rule, (r) => r.crossFilter === 'both', (r) => `Make ${r.fromTable} → ${r.toTable} filter one way`);
    case 'many-to-many':
      return relItems(meta, rule, (r) => r.cardinality === 'many-to-many', (r) => `Review many-to-many ${r.fromTable} → ${r.toTable}`);
    case 'inactive':
      return relItems(meta, rule, (r) => !r.isActive, (r) => `Check measures use ${r.fromTable} → ${r.toTable} via USERELATIONSHIP`);
    case 'unfriendly-names': {
      const out: ChecklistItem[] = [];
      for (const t of meta.tables) {
        const why = !t.isHidden && unfriendlyReason(t.name);
        if (why) out.push(item(rule, tableId(t.name), `Rename table ${t.name}`, why));
      }
      for (const c of meta.columns) {
        const why = !c.isHidden && unfriendlyReason(c.name);
        if (why) out.push(item(rule, columnId(c.table, c.name), `Rename column ${c.name}`, `On ${c.table} · ${why}`));
      }
      for (const m of meta.measures) {
        const why = !m.isHidden && unfriendlyReason(m.name);
        if (why) out.push(item(rule, measureId(m.table, m.name), `Rename measure ${m.name}`, `On ${m.table} · ${why}`));
      }
      return out;
    }
    case 'wide-tables':
      return meta.tables
        .filter((t) => !t.isHidden && (t.columnCount ?? 0) > RULES.wideTableColumns)
        .map((t) => item(rule, tableId(t.name), `Trim or split ${t.name}`, `${t.columnCount} columns: hide technical ones or move attributes to a dimension`));
  }
}

/** One group per fired rule (warnings first, then rule order), each with an item per flagged object. */
export function buildChecklist(meta: ModelMetadata, report: HealthReport): ChecklistGroup[] {
  return report.findings.map((f) => {
    const def = RULE_DEFS.find((r) => r.id === f.rule)!;
    return { rule: f.rule, title: def.title, severity: def.severity, advice: def.advice, condition: def.condition, items: itemsFor(f.rule, meta) };
  });
}

/** Done count over the current items only (ticks for objects that were fixed and are gone do not count). */
export function progress(groups: ChecklistGroup[], done: ReadonlySet<string>): { done: number; total: number } {
  const ids = groups.flatMap((g) => g.items.map((i) => i.id));
  return { done: ids.filter((id) => done.has(id)).length, total: ids.length };
}
