/**
 * Schema diagram layout: every table is a card listing its fields and measures, and every relationship is a link from
 * the key column on one card to the key column on the other. Pure functions over ModelMetadata (no DOM), so the
 * renderer and the tests share them.
 *
 * Layout per connected group of tables:
 * - Fact tables (see pickFacts) stack in the centre column.
 * - Tables one hop away sit in the columns either side, balanced by height; tables further out (snowflaked
 *   outriggers) sit one column further out on the same side as the table they hang off.
 * - Within a column, cards are ordered by the average height of the cards they link to, which keeps links short.
 * Groups are packed left to right (largest first); tables with no relationships sit in a grid after them.
 */
import { arrowEnds, components } from './diagram';
import { allTableNames } from './metadata';
import { pickFacts } from './model';
import type { ColumnInfo, MeasureInfo, ModelMetadata, RelationshipInfo } from './types';

export const CARD_W = 240;
export const HEADER_H = 40;
export const ROW_H = 24;
export const SECTION_H = 22;
export const CARD_PAD = 6;
/** Card border width (rows start below it). */
export const BORDER = 1;
const COL_GAP = 150;
const ROW_GAP = 28;
const GROUP_GAP = 120;
const MARGIN = 48;
const LOOSE_PER_ROW = 5;
const LABEL_H = 34;

/** Columns shown on a collapsed card, not counting relationship keys (always shown). */
export const COMPACT_COLUMNS = 4;
/** Measures shown on a collapsed card. */
export const COMPACT_MEASURES = 4;

export type CardKind = 'fact' | 'dimension' | 'loose';

export type CardRow =
  | { kind: 'column'; top: number; column: ColumnInfo; isKey: boolean }
  | { kind: 'measure'; top: number; measure: MeasureInfo }
  | { kind: 'section'; top: number; label: string }
  | { kind: 'note'; top: number; text: string }
  | { kind: 'toggle'; top: number; more: number; expanded: boolean };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface SchemaCard {
  name: string;
  kind: CardKind;
  hidden: boolean;
  /** Top-left corner. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Signed column within its group: 0 is the fact column, negative is left. */
  column: number;
  group: number;
  rows: CardRow[];
  columnCount: number;
  measureCount: number;
  expanded: boolean;
}

export interface Pt {
  x: number;
  y: number;
}

export interface SchemaLink {
  /** Index in meta.relationships. */
  index: number;
  rel: RelationshipInfo;
  path: string;
  start: Pt;
  end: Pt;
  /** Which card edge each end leaves from (+1 right, -1 left). */
  startSide: 1 | -1;
  endSide: 1 | -1;
  /** Filters flow toward the "to" table (forward), the "from" table (backward), or both. */
  flow: 'forward' | 'backward' | 'both';
  /** Approximate path length, for animation speed. */
  length: number;
  startCard: '1' | '*';
  endCard: '1' | '*';
}

export interface GroupLabel {
  x: number;
  y: number;
  text: string;
}

export interface SchemaLayout {
  cards: SchemaCard[];
  links: SchemaLink[];
  labels: GroupLabel[];
  width: number;
  height: number;
  /** Centre of the first fact table, for the starting view. */
  focus: Pt | null;
}

export interface SchemaOptions {
  /** Tables whose cards list every field and measure. */
  expanded?: ReadonlySet<string>;
  /** Show hidden columns and measures (relationship keys are always shown). */
  showHidden?: boolean;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** `Table\0Column` key for a column. */
export const colKey = (table: string, column: string) => `${table}\u0000${column}`;

/** Columns that take part in a relationship, as colKey values. */
export function keyColumns(rels: RelationshipInfo[]): Set<string> {
  const s = new Set<string>();
  for (const r of rels) {
    s.add(colKey(r.fromTable, r.fromColumn));
    s.add(colKey(r.toTable, r.toColumn));
  }
  return s;
}

/** The rows of one card and its height. Keys first, then visible columns, then hidden; measures after a divider. */
export function cardRows(
  table: string,
  meta: ModelMetadata,
  keys: Set<string>,
  expanded: boolean,
  showHidden: boolean,
): { rows: CardRow[]; h: number; columnCount: number; measureCount: number } {
  const cols = meta.columns.filter((c) => c.table === table);
  const measures = meta.measures.filter((m) => m.table === table);
  const isKey = (c: ColumnInfo) => keys.has(colKey(table, c.name));
  const keyCols = cols.filter(isKey);
  const others = cols.filter((c) => !isKey(c) && (showHidden || !c.isHidden)).sort((a, b) => Number(a.isHidden) - Number(b.isHidden));
  const ms = measures.filter((m) => showHidden || !m.isHidden).sort((a, b) => Number(a.isHidden) - Number(b.isHidden));

  const shownOthers = expanded ? others : others.slice(0, COMPACT_COLUMNS);
  const shownMeasures = expanded ? ms : ms.slice(0, COMPACT_MEASURES);
  const more = others.length - shownOthers.length + (ms.length - shownMeasures.length);

  const rows: CardRow[] = [];
  let top = HEADER_H;
  const push = (row: DistributiveOmit<CardRow, 'top'>, h: number) => {
    rows.push({ ...row, top } as CardRow);
    top += h;
  };

  if (!meta.sections.columns.ok) {
    push({ kind: 'note', text: 'Columns not available' }, ROW_H);
  } else {
    for (const c of keyCols) push({ kind: 'column', column: c, isKey: true }, ROW_H);
    for (const c of shownOthers) push({ kind: 'column', column: c, isKey: false }, ROW_H);
    if (!cols.length) push({ kind: 'note', text: 'No columns' }, ROW_H);
  }
  if (shownMeasures.length) {
    push({ kind: 'section', label: `Measures · ${ms.length}` }, SECTION_H);
    for (const m of shownMeasures) push({ kind: 'measure', measure: m }, ROW_H);
  }
  const truncates = others.length > COMPACT_COLUMNS || ms.length > COMPACT_MEASURES;
  if (truncates) push({ kind: 'toggle', more, expanded }, ROW_H);
  return { rows, h: top + CARD_PAD + BORDER * 2, columnCount: cols.length, measureCount: measures.length };
}

/** Vertical centre of a column's row on a card (page coordinates); the header centre when the column is not listed. */
export function anchorY(card: SchemaCard, column: string): number {
  const row = card.rows.find((r) => r.kind === 'column' && r.column.name === column);
  return card.y + BORDER + (row ? row.top + ROW_H / 2 : HEADER_H / 2);
}

function linkPath(a: Pt, sa: 1 | -1, b: Pt, sb: 1 | -1): { path: string; length: number } {
  const span = Math.abs(b.x - a.x);
  const bend = sa === sb ? 56 + Math.abs(b.y - a.y) * 0.12 : Math.max(48, span / 2);
  const c1 = { x: a.x + sa * bend, y: a.y };
  const c2 = { x: b.x + sb * bend, y: b.y };
  const path = `M${r1(a.x)},${r1(a.y)} C${r1(c1.x)},${r1(c1.y)} ${r1(c2.x)},${r1(c2.y)} ${r1(b.x)},${r1(b.y)}`;
  // Control polygon length, a close upper bound for a smooth cubic.
  const length = Math.hypot(c1.x - a.x, c1.y - a.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(b.x - c2.x, b.y - c2.y);
  return { path, length: r1(length) };
}

/** Filter direction of a relationship along the path from the "from" table to the "to" table. */
export function flowOf(rel: Pick<RelationshipInfo, 'cardinality' | 'crossFilter'>): SchemaLink['flow'] {
  const a = arrowEnds(rel);
  return a.start && a.end ? 'both' : a.end ? 'forward' : 'backward';
}

interface Placed {
  name: string;
  column: number;
  y: number;
  h: number;
  kind: CardKind;
}

/** Places one connected group around its fact tables. Coordinates are relative (column index, y from 0). */
function placeGroup(group: string[], rels: RelationshipInfo[], heights: Map<string, number>): Placed[] {
  const inGroup = new Set(group);
  const local = rels.filter((r) => r.fromTable !== r.toTable && inGroup.has(r.fromTable) && inGroup.has(r.toTable));
  const adj = new Map(group.map((n) => [n, new Set<string>()]));
  for (const r of local) {
    adj.get(r.fromTable)!.add(r.toTable);
    adj.get(r.toTable)!.add(r.fromTable);
  }
  const facts = pickFacts(group, local);

  // Breadth-first from all facts at once: depth and the neighbour one hop closer to a fact.
  const depth = new Map<string, number>(facts.map((f) => [f, 0]));
  const parent = new Map<string, string>();
  const queue = [...facts];
  while (queue.length) {
    const t = queue.shift()!;
    for (const o of [...adj.get(t)!].sort()) {
      if (depth.has(o)) continue;
      depth.set(o, depth.get(t)! + 1);
      parent.set(o, t);
      queue.push(o);
    }
  }

  const factIndex = new Map(facts.map((f, i) => [f, i]));
  const side = new Map<string, 1 | -1>();
  const ring1 = group
    .filter((n) => depth.get(n) === 1)
    .map((n) => {
      const near = [...adj.get(n)!].filter((o) => factIndex.has(o)).map((o) => factIndex.get(o)!);
      return { n, bary: near.reduce((s, v) => s + v, 0) / (near.length || 1) };
    })
    .sort((a, b) => a.bary - b.bary || a.n.localeCompare(b.n));
  // Balance the two sides by height; heavier subtrees (a dimension with outriggers) count their whole branch.
  const branch = (n: string): number => heights.get(n)! + group.filter((o) => parent.get(o) === n).reduce((s, o) => s + branch(o), 0);
  let left = 0;
  let right = 0;
  for (const { n } of ring1) {
    const h = branch(n);
    if (right <= left) {
      side.set(n, 1);
      right += h;
    } else {
      side.set(n, -1);
      left += h;
    }
  }
  const sideOf = (n: string): 1 | -1 => {
    if (side.has(n)) return side.get(n)!;
    const p = parent.get(n);
    const s = p ? sideOf(p) : 1;
    side.set(n, s);
    return s;
  };

  const byColumn = new Map<number, string[]>();
  for (const n of group) {
    const d = depth.get(n) ?? 0;
    const c = d === 0 ? 0 : sideOf(n) * d;
    byColumn.set(c, [...(byColumn.get(c) ?? []), n]);
  }

  const placed = new Map<string, Placed>();
  const stack = (names: string[], column: number) => {
    const total = names.reduce((s, n) => s + heights.get(n)!, 0) + ROW_GAP * (names.length - 1);
    let y = -total / 2;
    for (const n of names) {
      placed.set(n, { name: n, column, y, h: heights.get(n)!, kind: column === 0 && factIndex.has(n) ? 'fact' : 'dimension' });
      y += heights.get(n)! + ROW_GAP;
    }
  };
  stack(facts, 0);
  const centreOf = (n: string) => placed.get(n)!.y + placed.get(n)!.h / 2;
  const maxDepth = Math.max(0, ...[...byColumn.keys()].map(Math.abs));
  for (let d = 1; d <= maxDepth; d++) {
    for (const s of [1, -1] as const) {
      const names = byColumn.get(s * d);
      if (!names) continue;
      const bary = (n: string) => {
        const near = [...adj.get(n)!].filter((o) => placed.has(o));
        return near.length ? near.reduce((sum, o) => sum + centreOf(o), 0) / near.length : 0;
      };
      stack([...names].sort((a, b) => bary(a) - bary(b) || a.localeCompare(b)), s * d);
    }
  }
  return [...placed.values()];
}

export function layoutSchema(meta: ModelMetadata, opts: SchemaOptions = {}): SchemaLayout {
  const expanded = opts.expanded ?? new Set<string>();
  const showHidden = opts.showHidden ?? true;
  const names = allTableNames(meta);
  const known = new Set(names);
  const rels = meta.relationships.filter((r) => known.has(r.fromTable) && known.has(r.toTable));
  const keys = keyColumns(rels);
  const info = new Map(meta.tables.map((t) => [t.name, t]));

  const built = new Map(names.map((n) => [n, cardRows(n, meta, keys, expanded.has(n), showHidden)]));
  const heights = new Map(names.map((n) => [n, built.get(n)!.h]));

  const groups = components(names, rels);
  const connected = groups.filter((g) => g.length > 1);
  const loose = groups.filter((g) => g.length === 1).map((g) => g[0]);

  const cards: SchemaCard[] = [];
  const labels: GroupLabel[] = [];
  const makeCard = (name: string, kind: CardKind, x: number, y: number, column: number, group: number): SchemaCard => {
    const b = built.get(name)!;
    return {
      name,
      kind,
      hidden: info.get(name)?.isHidden ?? false,
      x: r1(x),
      y: r1(y),
      w: CARD_W,
      h: b.h,
      column,
      group,
      rows: b.rows,
      columnCount: b.columnCount,
      measureCount: b.measureCount,
      expanded: expanded.has(name),
    };
  };

  // Connected groups, shelf-packed left to right.
  let cursorX = MARGIN;
  let cursorY = MARGIN;
  let rowH = 0;
  const placedGroups = connected.map((g) => placeGroup(g, rels, heights));
  const boxes = placedGroups.map((p) => {
    const minC = Math.min(...p.map((n) => n.column));
    const maxC = Math.max(...p.map((n) => n.column));
    const minY = Math.min(...p.map((n) => n.y));
    const maxY = Math.max(...p.map((n) => n.y + n.h));
    return { minC, minY, w: (maxC - minC + 1) * CARD_W + (maxC - minC) * COL_GAP, h: maxY - minY };
  });
  const rowLimit = Math.max(1800, ...boxes.map((b) => b.w));
  placedGroups.forEach((placed, gi) => {
    const box = boxes[gi];
    if (cursorX > MARGIN && cursorX + box.w > MARGIN + rowLimit) {
      cursorX = MARGIN;
      cursorY += rowH + GROUP_GAP;
      rowH = 0;
    }
    for (const p of placed) {
      const x = cursorX + (p.column - box.minC) * (CARD_W + COL_GAP);
      cards.push(makeCard(p.name, p.kind, x, cursorY + (p.y - box.minY), p.column, gi));
    }
    cursorX += box.w + GROUP_GAP;
    rowH = Math.max(rowH, box.h);
  });

  // Tables with no relationships: a grid below, under a label.
  if (loose.length) {
    const top = connected.length ? cursorY + rowH + GROUP_GAP : MARGIN;
    const text = !meta.sections.relationships.ok
      ? 'Relationships could not be read for this model'
      : connected.length
        ? 'Not related to any other table'
        : 'No relationships between these tables';
    labels.push({ x: MARGIN, y: top, text });
    const sorted = [...loose].sort((a, b) => a.localeCompare(b));
    let y = top + LABEL_H;
    for (let i = 0; i < sorted.length; i += LOOSE_PER_ROW) {
      const row = sorted.slice(i, i + LOOSE_PER_ROW);
      row.forEach((n, j) => cards.push(makeCard(n, 'loose', MARGIN + j * (CARD_W + 40), y, 0, -1)));
      y += Math.max(...row.map((n) => heights.get(n)!)) + ROW_GAP;
    }
  }

  const byName = new Map(cards.map((c) => [c.name, c]));
  const links: SchemaLink[] = [];
  meta.relationships.forEach((rel, index) => {
    const a = byName.get(rel.fromTable);
    const b = byName.get(rel.toTable);
    if (!a || !b) return;
    let sa: 1 | -1;
    let sb: 1 | -1;
    if (a === b || a.x === b.x) {
      // Same column (or a self-relationship): both ends leave from the outer edge and the link bulges outward.
      sa = sb = a.column < 0 ? -1 : 1;
    } else if (a.x < b.x) {
      sa = 1;
      sb = -1;
    } else {
      sa = -1;
      sb = 1;
    }
    const start = { x: sa === 1 ? a.x + a.w : a.x, y: anchorY(a, rel.fromColumn) };
    const end = { x: sb === 1 ? b.x + b.w : b.x, y: anchorY(b, rel.toColumn) };
    const { path, length } = linkPath(start, sa, end, sb);
    const fromMany = rel.cardinality === 'many-to-one' || rel.cardinality === 'many-to-many';
    const toMany = rel.cardinality === 'one-to-many' || rel.cardinality === 'many-to-many';
    links.push({
      index,
      rel,
      path,
      start,
      end,
      startSide: sa,
      endSide: sb,
      flow: flowOf(rel),
      length,
      startCard: fromMany ? '*' : '1',
      endCard: toMany ? '*' : '1',
    });
  });

  const width = Math.max(0, ...cards.map((c) => c.x + c.w)) + MARGIN;
  const height = Math.max(0, ...cards.map((c) => c.y + c.h)) + MARGIN;
  const fact = cards.find((c) => c.kind === 'fact') ?? cards[0];
  return {
    cards,
    links,
    labels,
    width: Math.ceil(width),
    height: Math.ceil(height),
    focus: fact ? { x: fact.x + fact.w / 2, y: fact.y + fact.h / 2 } : null,
  };
}

/** Plain-language sentence for a relationship, from the point of view of the filtering table. */
export function describeLink(rel: RelationshipInfo): string {
  const flow = flowOf(rel);
  // Both ways: lead with the one side, the usual direction.
  const backward = flow === 'backward' || (flow === 'both' && rel.cardinality === 'many-to-one');
  const filterer = backward ? rel.toTable : rel.fromTable;
  const filtered = backward ? rel.fromTable : rel.toTable;
  const via = rel.fromColumn === rel.toColumn ? `[${rel.fromColumn}]` : `[${rel.fromColumn}] = [${rel.toColumn}]`;
  const both = flow === 'both' ? ' (and back: filters both ways)' : '';
  const inactive = rel.isActive ? '' : ' Inactive: only used when a measure calls USERELATIONSHIP.';
  return `${filterer} filters ${filtered} on ${via}${both}.${inactive}`;
}
