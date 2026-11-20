/**
 * Space weather: the health findings mapped onto the objects they affect (flares on tables, moons and trails), measure
 * coverage, and the ranked "Today" list that flies the camera to the worst of it. Pure functions over ModelMetadata.
 */
import { RULES } from '../config/rules';
import { unfriendlyReason, type HealthReport, type RuleId, type Severity } from './findings';
import { isNumericMeasure } from './metadata';
import { measureId, relId, tableId } from './orrery';
import type { MeasureInfo, ModelMetadata, RelationshipInfo } from './types';

export interface Flare {
  rule: RuleId;
  severity: Severity;
  /** Short reason, such as "No description" or "Column PROMO_NAME: underscore". */
  note: string;
}

export type FlareMap = Map<string, Flare[]>;

function push(map: FlareMap, id: string, f: Flare) {
  const list = map.get(id);
  if (list) list.push(f);
  else map.set(id, [f]);
}

/** Every object a fired rule flags, keyed by object id (t:, m:, r:). Rules that did not fire add nothing. */
export function flareMap(meta: ModelMetadata, report: HealthReport): FlareMap {
  const map: FlareMap = new Map();
  const fired = new Map(report.findings.map((f) => [f.rule, f.severity]));
  const sev = (r: RuleId) => fired.get(r)!;
  if (fired.has('measures-no-description'))
    for (const m of meta.measures) if (!m.isHidden && !m.description) push(map, measureId(m.table, m.name), { rule: 'measures-no-description', severity: sev('measures-no-description'), note: 'No description' });
  if (fired.has('measures-no-format'))
    for (const m of meta.measures) if (isNumericMeasure(m) && !m.formatString.trim()) push(map, measureId(m.table, m.name), { rule: 'measures-no-format', severity: sev('measures-no-format'), note: 'No format string' });
  if (fired.has('tables-no-description'))
    for (const t of meta.tables) if (!t.isHidden && !t.description) push(map, tableId(t.name), { rule: 'tables-no-description', severity: sev('tables-no-description'), note: 'No description' });
  if (fired.has('wide-tables'))
    for (const t of meta.tables)
      if (!t.isHidden && (t.columnCount ?? 0) > RULES.wideTableColumns)
        push(map, tableId(t.name), { rule: 'wide-tables', severity: sev('wide-tables'), note: `${t.columnCount} columns` });
  if (fired.has('unfriendly-names')) {
    const s = sev('unfriendly-names');
    for (const t of meta.tables) {
      const why = !t.isHidden && unfriendlyReason(t.name);
      if (why) push(map, tableId(t.name), { rule: 'unfriendly-names', severity: s, note: `Name: ${why}` });
    }
    for (const c of meta.columns) {
      const why = !c.isHidden && unfriendlyReason(c.name);
      if (why) push(map, tableId(c.table), { rule: 'unfriendly-names', severity: s, note: `Column ${c.name}: ${why}` });
    }
    for (const m of meta.measures) {
      const why = !m.isHidden && unfriendlyReason(m.name);
      if (why) push(map, measureId(m.table, m.name), { rule: 'unfriendly-names', severity: s, note: `Name: ${why}` });
    }
  }
  meta.relationships.forEach((r, i) => {
    if (fired.has('bidirectional') && r.crossFilter === 'both') push(map, relId(i), { rule: 'bidirectional', severity: sev('bidirectional'), note: 'Filters both ways' });
    if (fired.has('many-to-many') && r.cardinality === 'many-to-many') push(map, relId(i), { rule: 'many-to-many', severity: sev('many-to-many'), note: 'Many to many' });
    if (fired.has('inactive') && !r.isActive) push(map, relId(i), { rule: 'inactive', severity: sev('inactive'), note: 'Inactive' });
  });
  return map;
}

export function worst(flares: Flare[] | undefined): Severity | null {
  if (!flares?.length) return null;
  return flares.some((f) => f.severity === 'warning') ? 'warning' : 'info';
}

/** A table's weather: its own flares plus its measures' flares. */
export function tableWeather(map: FlareMap, meta: ModelMetadata, table: string): { severity: Severity | null; count: number; flares: Flare[] } {
  const own = map.get(tableId(table)) ?? [];
  const fromMoons = meta.measures.filter((m) => m.table === table).flatMap((m) => map.get(measureId(m.table, m.name)) ?? []);
  const all = [...own, ...fromMoons];
  return { severity: worst(all), count: all.length, flares: all };
}

/* ------------------------------------------------------------------ measure coverage */

export type Coverage = 'complete' | 'no-description' | 'no-format' | 'missing-both';

/** Whether a measure is documented (description) and formatted (format string, numeric measures only). */
export function measureCoverage(m: MeasureInfo): Coverage {
  const desc = !!m.description.trim();
  const fmt = !isNumericMeasure(m) || !!m.formatString.trim();
  if (desc && fmt) return 'complete';
  if (!desc && !fmt) return 'missing-both';
  return desc ? 'no-format' : 'no-description';
}

export const COVERAGE_LABEL: Record<Coverage, string> = {
  complete: 'Described and formatted',
  'no-description': 'No description',
  'no-format': 'No format string',
  'missing-both': 'Missing both',
};

/** Share of a table's measures that are complete, or null when it has none. */
export function tableCoverage(meta: ModelMetadata, table: string, includeHidden = true): number | null {
  const list = meta.measures.filter((m) => m.table === table && (includeHidden || !m.isHidden));
  if (!list.length) return null;
  return list.filter((m) => measureCoverage(m) === 'complete').length / list.length;
}

/* ------------------------------------------------------------------ today */

export type LensKey = 'weather' | 'size' | 'hidden' | 'coverage';

export interface TodayEntry {
  id: string;
  /** Object to focus: t:, m: or r:. */
  focus: string;
  title: string;
  severity: 'warn' | 'info';
  value: number;
  unit: string;
  lens: LensKey;
  meta: string;
}

function relTitle(r: RelationshipInfo, verb: string): string {
  return `${r.fromTable} → ${r.toTable} ${verb}`;
}

function busiest(ids: string[], key: (id: string) => string): string | null {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(key(id), (counts.get(key(id)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

/**
 * The three to five things worth looking at now: one per fired rule, warnings first, each pointing at the object
 * that shows the problem best.
 */
export function todayEntries(meta: ModelMetadata, report: HealthReport, max = 5): TodayEntry[] {
  const out: TodayEntry[] = [];
  const tone = (s: Severity) => (s === 'warning' ? 'warn' : 'info') as 'warn' | 'info';
  for (const f of report.findings) {
    switch (f.rule) {
      case 'measures-no-description':
      case 'measures-no-format': {
        const missing = meta.measures.filter((m) =>
          f.rule === 'measures-no-description' ? !m.isHidden && !m.description : isNumericMeasure(m) && !m.formatString.trim(),
        );
        const table = busiest(missing.map((m) => m.table), (x) => x);
        if (!table) break;
        const n = missing.filter((m) => m.table === table).length;
        out.push({
          id: f.rule,
          focus: tableId(table),
          title: f.rule === 'measures-no-description' ? `${missing.length} measures have no description` : `${missing.length} measures have no format string`,
          severity: tone(f.severity),
          value: missing.length,
          unit: f.rule === 'measures-no-description' ? 'undescribed' : 'unformatted',
          lens: 'coverage',
          meta: `${n} on ${table}`,
        });
        break;
      }
      case 'bidirectional':
      case 'many-to-many':
      case 'inactive': {
        const idx = meta.relationships.findIndex((r) =>
          f.rule === 'bidirectional' ? r.crossFilter === 'both' : f.rule === 'many-to-many' ? r.cardinality === 'many-to-many' : !r.isActive,
        );
        if (idx < 0) break;
        const r = meta.relationships[idx];
        const verb = f.rule === 'bidirectional' ? 'filters both ways' : f.rule === 'many-to-many' ? 'is many to many' : 'is inactive';
        out.push({
          id: f.rule,
          focus: relId(idx),
          title: relTitle(r, verb),
          severity: tone(f.severity),
          value: f.objects.length,
          unit: f.objects.length === 1 ? 'relationship' : 'relationships',
          lens: 'weather',
          meta: `${r.fromColumn} to ${r.toColumn}`,
        });
        break;
      }
      case 'tables-no-description': {
        const t = meta.tables.find((x) => !x.isHidden && !x.description);
        if (!t) break;
        out.push({
          id: f.rule,
          focus: tableId(t.name),
          title: f.objects.length === 1 ? `${t.name} has no description` : `${f.objects.length} tables have no description`,
          severity: tone(f.severity),
          value: f.objects.length,
          unit: f.objects.length === 1 ? 'table' : 'tables',
          lens: 'weather',
          meta: t.name,
        });
        break;
      }
      case 'unfriendly-names': {
        const map = flareMap(meta, report);
        const tables = [...map.entries()]
          .filter(([, fl]) => fl.some((x) => x.rule === 'unfriendly-names'))
          .map(([id]) => (id.startsWith('m:') ? tableId(id.slice(2, id.indexOf('|'))) : id));
        const focus = busiest(tables, (x) => x);
        if (!focus) break;
        out.push({
          id: f.rule,
          focus,
          title: `${f.objects.length} names could be friendlier`,
          severity: tone(f.severity),
          value: f.objects.length,
          unit: 'names',
          lens: 'weather',
          meta: `Most on ${focus.slice(2)}`,
        });
        break;
      }
      case 'wide-tables': {
        const t = [...meta.tables].filter((x) => !x.isHidden && (x.columnCount ?? 0) > RULES.wideTableColumns).sort((a, b) => (b.columnCount ?? 0) - (a.columnCount ?? 0))[0];
        if (!t) break;
        out.push({
          id: f.rule,
          focus: tableId(t.name),
          title: `${t.name} is a wide table`,
          severity: tone(f.severity),
          value: t.columnCount ?? 0,
          unit: 'columns',
          lens: 'size',
          meta: `More than ${RULES.wideTableColumns} columns`,
        });
        break;
      }
    }
    if (out.length >= max) break;
  }
  return out;
}
