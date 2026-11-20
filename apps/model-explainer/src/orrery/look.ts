/**
 * Lens encodings shared by the 3D orrery, the 2D star chart and the legends. Colours are CSS custom property names
 * (`--accent-9`), so SVG uses `var(...)` and three.js resolves them once per theme. No three.js import here.
 */
import type { LegendItem } from '@x10/shared/ui';

import { RULES } from '../config/rules';
import type { Severity } from '../domain/findings';
import { kindShort, measureId, relId, tableId, type Orrery, type OrreryBody } from '../domain/orrery';
import type { ModelMetadata } from '../domain/types';
import { COVERAGE_LABEL, measureCoverage, tableCoverage, tableWeather, type Coverage, type FlareMap, type LensKey } from '../domain/weather';

export type Paint = `--${string}`;

export interface BodyLook {
  paint: Paint;
  /** Multiplier on the body's base radius. */
  scale: number;
  /** Drawn as a translucent ghost (hidden objects). */
  ghost: boolean;
  /** Space weather flare around the body. */
  flare: 'warn' | 'info' | null;
  /** Partial ring (0..1) and its colour: hidden column share, measure coverage. */
  arc: { value: number; paint: Paint } | null;
  /** Saturn-like ring for wide tables. */
  ringed: boolean;
  /** Second line under the label (rows, flares, hidden share, coverage). */
  caption: string;
}

export interface MoonLook {
  paint: Paint;
  ghost: boolean;
  flare: 'warn' | 'info' | null;
}

export interface TrailLook {
  paint: Paint;
  /** Drawn stronger (a finding in the weather lens). */
  strong: boolean;
}

export interface Looks {
  bodies: Map<string, BodyLook>;
  moons: Map<string, MoonLook>;
  trails: Map<string, TrailLook>;
}

export interface LookInput {
  lens: LensKey;
  meta: ModelMetadata;
  orrery: Orrery;
  flares: FlareMap;
  /** Row counts once weighed (Size lens). */
  rows: Map<string, number> | null;
}

export const NEUTRAL: Paint = '--gray-9';
export const MOON_NEUTRAL: Paint = '--gray-10';
export const TRAIL: Paint = '--gray-9';
export const SUN: Paint = '--accent-9';

const sevPaint = (s: Severity | null): Paint => (s === 'warning' ? '--warn-solid' : s === 'info' ? '--info-solid' : NEUTRAL);
const sevTone = (s: Severity | null): 'warn' | 'info' | null => (s === 'warning' ? 'warn' : s === 'info' ? 'info' : null);

export const COVERAGE_PAINT: Record<Coverage, Paint> = {
  complete: '--ok-solid',
  'no-description': '--warn-solid',
  'no-format': '--warn-solid',
  'missing-both': '--bad-solid',
};

/** Size bands for the Size lens (rows). */
export const ROW_BANDS: { max: number; label: string; paint: Paint }[] = [
  { max: 1_000, label: 'Under 1K rows', paint: '--accent-7' },
  { max: 100_000, label: '1K to 100K', paint: '--accent-8' },
  { max: 1_000_000, label: '100K to 1M', paint: '--accent-9' },
  { max: Infinity, label: 'Over 1M rows', paint: '--accent-11' },
];

export function rowBand(rows: number) {
  return ROW_BANDS.find((b) => rows < b.max) ?? ROW_BANDS[ROW_BANDS.length - 1];
}

/** Body radius for a row count (Size lens), before dividing by the base radius. */
export function sizedRadius(b: OrreryBody, rows: number): number {
  const l = Math.log10(Math.max(rows, 0) + 1);
  return b.kind === 'sun' ? 1.2 + l * 0.24 : 0.36 + l * 0.17;
}

export function compactNumber(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function hiddenColumnShare(meta: ModelMetadata, table: string): { hidden: number; total: number } {
  const cols = meta.columns.filter((c) => c.table === table);
  return { hidden: cols.filter((c) => c.isHidden).length, total: cols.length };
}

export function buildLooks({ lens, meta, orrery, flares, rows }: LookInput): Looks {
  const bodies = new Map<string, BodyLook>();
  const moons = new Map<string, MoonLook>();
  const trails = new Map<string, TrailLook>();
  const measureByKey = new Map(meta.measures.map((m) => [measureId(m.table, m.name), m]));

  for (const b of orrery.bodies) {
    const sun = b.kind === 'sun';
    const wide = (b.columns ?? 0) > RULES.wideTableColumns;
    const look: BodyLook = { paint: sun ? SUN : NEUTRAL, scale: 1, ghost: b.hidden, flare: null, arc: null, ringed: wide, caption: '' };
    if (lens === 'weather') {
      const w = tableWeather(flares, meta, b.name);
      look.flare = sevTone(w.severity);
      if (!sun) look.paint = sevPaint(w.severity);
      look.caption = w.count ? `${w.count} flare${w.count === 1 ? '' : 's'}` : '';
    } else if (lens === 'size') {
      const n = rows?.get(b.name);
      if (n !== undefined) {
        look.scale = sizedRadius(b, n) / b.radius;
        if (!sun) look.paint = rowBand(n).paint;
        look.caption = `${compactNumber(n)} rows`;
      } else {
        look.caption = b.columns !== null ? `${b.columns} columns` : '';
      }
    } else if (lens === 'hidden') {
      const { hidden, total } = hiddenColumnShare(meta, b.name);
      if (!sun) look.paint = b.hidden ? '--gray-8' : '--gray-11';
      look.arc = total && !b.hidden ? { value: hidden / total, paint: '--accent-9' } : null;
      look.caption = b.hidden ? 'Hidden table' : total ? `${hidden} of ${total} columns hidden` : '';
    } else {
      const share = tableCoverage(meta, b.name);
      const list = meta.measures.filter((m) => m.table === b.name);
      if (share === null) {
        if (!sun) look.paint = '--gray-7';
        look.caption = '';
      } else {
        if (!sun) look.paint = share === 1 ? '--ok-solid' : share >= 0.5 ? '--warn-solid' : '--bad-solid';
        look.arc = { value: share, paint: '--ok-solid' };
        look.caption = `${list.filter((m) => measureCoverage(m) === 'complete').length} of ${list.length} complete`;
      }
    }
    bodies.set(b.id, look);
  }

  for (const m of orrery.moons) {
    const info = measureByKey.get(m.id);
    const look: MoonLook = { paint: MOON_NEUTRAL, ghost: m.hidden, flare: null };
    if (lens === 'weather') {
      const s = flares.get(m.id)?.some((f) => f.severity === 'warning') ? 'warning' : flares.get(m.id)?.length ? 'info' : null;
      look.flare = sevTone(s);
      if (s) look.paint = sevPaint(s);
    } else if (lens === 'coverage' && info) {
      look.paint = COVERAGE_PAINT[measureCoverage(info)];
    } else if (lens === 'hidden') {
      look.paint = m.hidden ? '--gray-8' : '--gray-11';
    }
    moons.set(m.id, look);
  }

  for (const t of orrery.trails) {
    const fl = flares.get(relId(t.index));
    const s = fl?.some((f) => f.severity === 'warning') ? 'warning' : fl?.length ? 'info' : null;
    trails.set(t.id, lens === 'weather' && s ? { paint: sevPaint(s), strong: true } : { paint: TRAIL, strong: false });
  }
  return { bodies, moons, trails };
}

/* ------------------------------------------------------------------ lenses and legends */

export const LENSES: { value: LensKey; label: string; swatch: string; description: string }[] = [
  { value: 'weather', label: 'Weather', swatch: 'conic-gradient(var(--warn-solid) 0 50%, var(--info-solid) 0)', description: 'Health findings as flares' },
  { value: 'size', label: 'Size', swatch: 'linear-gradient(90deg, var(--accent-7), var(--accent-11))', description: 'Rows per table' },
  { value: 'hidden', label: 'Hidden', swatch: 'var(--gray-8)', description: 'Hidden tables, columns and measures' },
  { value: 'coverage', label: 'Coverage', swatch: 'var(--ok-solid)', description: 'Measures with a description and a format string' },
];

export function lensLabel(lens: LensKey): string {
  return LENSES.find((l) => l.value === lens)?.label ?? lens;
}

export function legendFor(lens: LensKey, ctx: { meta: ModelMetadata; orrery: Orrery; flares: FlareMap; rows: Map<string, number> | null }): LegendItem[] {
  const { meta, orrery, flares, rows } = ctx;
  const base: LegendItem[] = [
    { label: 'Star · fact table', color: 'var(--accent-9)', shape: 'dot' },
    { label: 'Active relationship', color: 'var(--gray-9)', shape: 'line' },
    { label: 'Inactive', color: 'var(--gray-9)', shape: 'dash' },
  ];
  if (lens === 'weather') {
    const tables = orrery.bodies.map((b) => tableWeather(flares, meta, b.name).severity);
    return [
      { label: 'Warning flare', color: 'var(--warn-solid)', shape: 'ring', value: tables.filter((s) => s === 'warning').length },
      { label: 'Info flare', color: 'var(--info-solid)', shape: 'ring', value: tables.filter((s) => s === 'info').length },
      { label: 'Clear skies', color: 'var(--gray-9)', shape: 'dot', value: tables.filter((s) => s === null).length },
      ...base.slice(1),
    ];
  }
  if (lens === 'size') {
    if (!rows) return [{ label: 'Weighing tables…', color: 'var(--gray-8)', shape: 'dot' }, ...base];
    return [
      ...ROW_BANDS.map((b) => ({ label: b.label, color: `var(${b.paint})`, shape: 'dot' as const, value: orrery.bodies.filter((x) => x.kind !== 'sun' && rows.has(x.name) && rowBand(rows.get(x.name)!) === b).length })),
      { label: 'Ringed: 40+ columns', color: 'var(--gray-9)', shape: 'ring' },
    ];
  }
  if (lens === 'hidden') {
    return [
      { label: 'Visible table', color: 'var(--gray-11)', shape: 'dot', value: orrery.bodies.filter((b) => !b.hidden).length },
      { label: 'Hidden table', color: 'var(--gray-8)', shape: 'ring', value: orrery.bodies.filter((b) => b.hidden).length },
      { label: 'Arc: columns hidden', color: 'var(--accent-9)', shape: 'line' },
      { label: 'Hidden measure', color: 'var(--gray-8)', shape: 'ring', value: meta.measures.filter((m) => m.isHidden).length },
    ];
  }
  const counts = (c: Coverage) => meta.measures.filter((m) => measureCoverage(m) === c).length;
  return [
    { label: COVERAGE_LABEL.complete, color: 'var(--ok-solid)', shape: 'dot', value: counts('complete') },
    { label: 'Missing one', color: 'var(--warn-solid)', shape: 'dot', value: counts('no-description') + counts('no-format') },
    { label: COVERAGE_LABEL['missing-both'], color: 'var(--bad-solid)', shape: 'dot', value: counts('missing-both') },
    { label: 'No measures', color: 'var(--gray-7)', shape: 'dot', value: orrery.bodies.filter((b) => !meta.measures.some((m) => m.table === b.name)).length },
  ];
}

/** Screen-reader summary of a body. */
export function bodySummary(b: OrreryBody, look: BodyLook | undefined): string {
  return [b.name, kindShort(b), b.hidden ? 'hidden' : '', look?.caption ?? ''].filter(Boolean).join(', ');
}

export { tableId };
