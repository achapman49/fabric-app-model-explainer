/**
 * Hand-written relationship diagram layout (no graph library). Tables are grouped by connected component; each
 * component gets a radial layout around its most connected table (rings on a flattened ellipse), and components are
 * shelf-packed left to right, largest first. Edges are straight or gently curved (parallel relationships) and clipped to
 * the table boxes.
 */
import type { RelationshipInfo } from './types';

export interface DiagramTable {
  name: string;
  isHidden: boolean;
}

export interface DNode {
  id: string;
  label: string;
  /** Centre. */
  x: number;
  y: number;
  w: number;
  h: number;
  hidden: boolean;
  component: number;
}

export interface Pt {
  x: number;
  y: number;
}

export interface DEdge {
  id: string;
  rel: RelationshipInfo;
  path: string;
  start: Pt;
  end: Pt;
  /** Arrowheads show the filter direction: they point at the table being filtered. */
  arrowStart: boolean;
  arrowEnd: boolean;
  dashed: boolean;
  startLabel: Pt & { text: string };
  endLabel: Pt & { text: string };
}

export interface DiagramLayout {
  nodes: DNode[];
  edges: DEdge[];
  width: number;
  height: number;
  components: number;
}

export const NODE_H = 36;
const CHAR_W = 7.2;
const MIN_W = 96;
const MAX_W = 220;
/** Horizontal padding inside a node: the body glyph on the left and the margins. */
const PAD = 40;
const MAX_CHARS = Math.floor((MAX_W - PAD) / CHAR_W);
const Y_SQUASH = 0.7;
const GAP = 80;
const MARGIN = 40;

export function nodeLabel(name: string): string {
  return name.length > MAX_CHARS ? `${name.slice(0, MAX_CHARS - 1)}…` : name;
}

export function nodeWidth(name: string): number {
  return Math.max(MIN_W, Math.min(MAX_W, Math.ceil(nodeLabel(name).length * CHAR_W) + PAD));
}

/** Connected components (undirected), each sorted by name; components sorted largest first. */
export function components(names: string[], rels: RelationshipInfo[]): string[][] {
  const adj = adjacency(names, rels);
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const n of [...names].sort()) {
    if (seen.has(n)) continue;
    const comp: string[] = [];
    const stack = [n];
    seen.add(n);
    while (stack.length) {
      const t = stack.pop()!;
      comp.push(t);
      for (const o of adj.get(t) ?? []) if (!seen.has(o)) (seen.add(o), stack.push(o));
    }
    out.push(comp.sort());
  }
  return out.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

function adjacency(names: string[], rels: RelationshipInfo[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>(names.map((n) => [n, new Set()]));
  for (const r of rels) {
    if (r.fromTable === r.toTable) continue;
    adj.get(r.fromTable)?.add(r.toTable);
    adj.get(r.toTable)?.add(r.fromTable);
  }
  return adj;
}

interface Placed {
  name: string;
  x: number;
  y: number;
  w: number;
}

/**
 * Angles for one ring: each node starts at its parent's angle (siblings fanned out), then a sweep enforces the
 * minimum separation. Falls back to an even spread when the ring is too crowded.
 */
export function ringAngles(parents: number[], sep: number): number[] {
  const n = parents.length;
  const even = parents.map((_, i) => -Math.PI / 2 + Math.PI / n + (2 * Math.PI * i) / n);
  if (n * sep >= 2 * Math.PI) return even;
  const order = parents.map((a, i) => ({ a, i })).sort((x, y) => x.a - y.a || x.i - y.i);
  // Fan out siblings that share a parent angle.
  const desired: number[] = [];
  let k = 0;
  while (k < order.length) {
    let j = k;
    while (j < order.length && order[j].a === order[k].a) j++;
    const g = j - k;
    for (let m = k; m < j; m++) desired.push(order[k].a + (m - k - (g - 1) / 2) * sep);
    k = j;
  }
  const placed = [...desired];
  for (let i = 1; i < n; i++) placed[i] = Math.max(placed[i], placed[i - 1] + sep);
  const shift = placed.reduce((s, a, i) => s + (a - desired[i]), 0) / n;
  for (let i = 0; i < n; i++) placed[i] -= shift;
  if (n > 1 && placed[0] + 2 * Math.PI - placed[n - 1] < sep) return even;
  const out = new Array<number>(n);
  order.forEach((o, idx) => (out[o.i] = placed[idx]));
  return out;
}

function radial(comp: string[], adj: Map<string, Set<string>>): Placed[] {
  const widths = new Map(comp.map((n) => [n, nodeWidth(n)]));
  if (comp.length === 1) return [{ name: comp[0], x: 0, y: 0, w: widths.get(comp[0])! }];
  const degree = (n: string) => adj.get(n)?.size ?? 0;
  const root = [...comp].sort((a, b) => degree(b) - degree(a) || a.localeCompare(b))[0];
  const maxW = Math.max(...comp.map((n) => widths.get(n)!));
  const ringGap = maxW + 40;
  const angle = new Map<string, number>([[root, -Math.PI / 2]]);
  const placed: Placed[] = [{ name: root, x: 0, y: 0, w: widths.get(root)! }];
  const seen = new Set([root]);
  let prev = [root];
  let r = 0;
  let first = true;
  while (prev.length) {
    const next: { name: string; parent: string }[] = [];
    for (const p of prev) {
      for (const k of [...(adj.get(p) ?? [])].filter((x) => !seen.has(x)).sort()) {
        seen.add(k);
        next.push({ name: k, parent: p });
      }
    }
    if (!next.length) break;
    r = Math.max(r + ringGap, (next.length * (maxW + 40)) / (2 * Math.PI));
    const sep = (maxW + 40) / r;
    const angles = first
      ? next.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / next.length)
      : ringAngles(next.map((x) => angle.get(x.parent)!), sep);
    next.forEach((x, i) => {
      angle.set(x.name, angles[i]);
      placed.push({ name: x.name, x: r * Math.cos(angles[i]), y: r * Math.sin(angles[i]) * Y_SQUASH, w: widths.get(x.name)! });
    });
    prev = next.map((x) => x.name);
    first = false;
  }
  return placed;
}

function clip(c: Pt, w: number, h: number, toward: Pt): Pt {
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const sx = dx ? (w / 2 + 2) / Math.abs(dx) : Infinity;
  const sy = dy ? (h / 2 + 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy, 1);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function quad(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

/** A point beside the curve (offset along the normal), clear of the line and the arrowheads; y is a text baseline. */
function labelPoint(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const p = quad(a, c, b, t);
  const tx = 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x);
  const ty = 2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y);
  const len = Math.hypot(tx, ty) || 1;
  return { x: p.x + (-ty / len) * 10, y: p.y + (tx / len) * 10 + 4 };
}

/** Which ends get an arrowhead. Filters flow from the one side to the many side; "both" gets two arrowheads. */
export function arrowEnds(rel: Pick<RelationshipInfo, 'cardinality' | 'crossFilter'>): { start: boolean; end: boolean } {
  if (rel.crossFilter === 'both') return { start: true, end: true };
  // Path runs from the "from" table to the "to" table.
  return rel.cardinality === 'one-to-many' ? { start: false, end: true } : { start: true, end: false };
}

export function layoutDiagram(tables: DiagramTable[], rels: RelationshipInfo[]): DiagramLayout {
  const hidden = new Map(tables.map((t) => [t.name, t.isHidden]));
  for (const r of rels) for (const t of [r.fromTable, r.toTable]) if (!hidden.has(t)) hidden.set(t, false);
  const names = [...hidden.keys()];
  const adj = adjacency(names, rels);
  const comps = components(names, rels);

  const nodes: DNode[] = [];
  let cursorX = MARGIN;
  let cursorY = MARGIN;
  let rowH = 0;
  const placedComps = comps.map((c) => radial(c, adj));
  const compBoxes = placedComps.map((p) => {
    const minX = Math.min(...p.map((n) => n.x - n.w / 2));
    const maxX = Math.max(...p.map((n) => n.x + n.w / 2));
    const minY = Math.min(...p.map((n) => n.y - NODE_H / 2));
    const maxY = Math.max(...p.map((n) => n.y + NODE_H / 2));
    return { minX, minY, w: maxX - minX, h: maxY - minY };
  });
  const rowLimit = Math.max(1400, ...compBoxes.map((b) => b.w));
  placedComps.forEach((placed, ci) => {
    const box = compBoxes[ci];
    if (cursorX > MARGIN && cursorX + box.w > MARGIN + rowLimit) {
      cursorX = MARGIN;
      cursorY += rowH + GAP;
      rowH = 0;
    }
    for (const p of placed) {
      nodes.push({
        id: p.name,
        label: nodeLabel(p.name),
        x: r1(cursorX + (p.x - box.minX)),
        y: r1(cursorY + (p.y - box.minY)),
        w: p.w,
        h: NODE_H,
        hidden: hidden.get(p.name) ?? false,
        component: ci,
      });
    }
    cursorX += box.w + GAP;
    rowH = Math.max(rowH, box.h);
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pairCount = new Map<string, number>();
  const pairKey = (r: RelationshipInfo) => [r.fromTable, r.toTable].sort().join('\u0000');
  for (const r of rels) pairCount.set(pairKey(r), (pairCount.get(pairKey(r)) ?? 0) + 1);
  const pairSeen = new Map<string, number>();

  const edges: DEdge[] = rels.map((rel, i) => {
    const a = byId.get(rel.fromTable)!;
    const b = byId.get(rel.toTable)!;
    const key = pairKey(rel);
    const count = pairCount.get(key)!;
    const k = pairSeen.get(key) ?? 0;
    pairSeen.set(key, k + 1);
    const arrows = arrowEnds(rel);
    const fromCard = rel.cardinality === 'many-to-one' || rel.cardinality === 'many-to-many' ? '*' : '1';
    const toCard = rel.cardinality === 'one-to-many' || rel.cardinality === 'many-to-many' ? '*' : '1';
    let start: Pt;
    let end: Pt;
    let ctrl: Pt;
    if (a === b) {
      // Self-relationship: a small loop above the box.
      start = { x: a.x - a.w / 4, y: a.y - a.h / 2 };
      end = { x: a.x + a.w / 4, y: a.y - a.h / 2 };
      ctrl = { x: a.x, y: a.y - a.h * 2.2 };
    } else {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      // Keep the curve direction stable regardless of from/to order.
      const sign = [rel.fromTable, rel.toTable].sort()[0] === rel.fromTable ? 1 : -1;
      const off = (k - (count - 1) / 2) * 56 * sign;
      ctrl = { x: mid.x + (-dy / len) * off, y: mid.y + (dx / len) * off };
      start = clip(a, a.w, a.h, ctrl);
      end = clip(b, b.w, b.h, ctrl);
    }
    const ls = labelPoint(start, ctrl, end, 0.22);
    const le = labelPoint(start, ctrl, end, 0.78);
    return {
      id: `e${i}`,
      rel,
      path: `M${r1(start.x)},${r1(start.y)} Q${r1(ctrl.x)},${r1(ctrl.y)} ${r1(end.x)},${r1(end.y)}`,
      start,
      end,
      arrowStart: arrows.start,
      arrowEnd: arrows.end,
      dashed: !rel.isActive,
      startLabel: { x: r1(ls.x), y: r1(ls.y), text: fromCard },
      endLabel: { x: r1(le.x), y: r1(le.y), text: toCard },
    };
  });

  const width = Math.max(0, ...nodes.map((n) => n.x + n.w / 2)) + MARGIN;
  const height = Math.max(0, ...nodes.map((n) => n.y + n.h / 2)) + MARGIN;
  return { nodes, edges, width: Math.ceil(width), height: Math.ceil(height), components: comps.length };
}

/** True when two node boxes overlap (used by tests and as a layout sanity check). */
export function overlaps(a: DNode, b: DNode, pad = 0): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + pad;
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Zoom a view box around a point (factor < 1 zooms in), clamped to a sensible range of the content size. */
export function zoomView(v: ViewBox, factor: number, at: Pt, content: { width: number; height: number }): ViewBox {
  const maxW = Math.max(content.width, 400) * 3;
  const minW = 120;
  const w = Math.min(maxW, Math.max(minW, v.w * factor));
  const f = w / v.w;
  const h = v.h * f;
  return { x: at.x - (at.x - v.x) * f, y: at.y - (at.y - v.y) * f, w, h };
}

export function fitView(content: { width: number; height: number }, aspect: number): ViewBox {
  const w = Math.max(content.width, 200);
  const h = Math.max(content.height, 120);
  if (w / h > aspect) {
    const hh = w / aspect;
    return { x: 0, y: (h - hh) / 2, w, h: hh };
  }
  const ww = h * aspect;
  return { x: (w - ww) / 2, y: 0, w: ww, h };
}

/**
 * Starting view: fit everything, unless that makes labels unreadably small (phones, big models). Then zoom to the
 * minimum readable scale, centred on the largest connected group.
 */
export function readableView(layout: DiagramLayout, px: { width: number; height: number }, minScale = 0.6): ViewBox {
  const aspect = px.width / px.height;
  const fit = fitView(layout, aspect);
  if (!px.width || px.width / fit.w >= minScale) return fit;
  const main = layout.nodes.filter((n) => n.component === 0);
  const cx = main.length ? (Math.min(...main.map((n) => n.x - n.w / 2)) + Math.max(...main.map((n) => n.x + n.w / 2))) / 2 : fit.x + fit.w / 2;
  const cy = main.length ? (Math.min(...main.map((n) => n.y)) + Math.max(...main.map((n) => n.y))) / 2 : fit.y + fit.h / 2;
  const w = px.width / minScale;
  const h = w / aspect;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}
