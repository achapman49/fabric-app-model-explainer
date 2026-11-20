/**
 * The model as a solar system: a pure layout over ModelMetadata (no three.js here, so the star chart, the list view,
 * the mission brief and the tests share it).
 *
 * - Every connected group of tables is a system. Fact tables (the many side of two or more relationships) are suns;
 *   when a group has no clear fact, the table that is most often on the many side becomes its sun.
 * - Dimensions are planets. A table one hop from a sun orbits it; tables further out (snowflaked outriggers) ride outer
 *   orbits locked to the angle of the planet they hang off, so the relationship between them stays short.
 * - A table at the same distance from two or more suns (a conformed dimension) sits still at the point between them.
 * - Tables with no relationships are rogue bodies drifting together in one belt.
 * - Measures are moons around their home table. Relationships are trails between bodies.
 *
 * Positions are a function of time, so the renderer animates by passing the clock (or a fixed time for reduced motion).
 */
import { arrowEnds, components } from './diagram';
import { allTableNames } from './metadata';
import type { MeasureInfo, ModelMetadata, RelationshipInfo } from './types';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type BodyKind = 'sun' | 'planet' | 'shared' | 'rogue';

export interface OrreryBody {
  /** `t:<table name>` */
  id: string;
  name: string;
  kind: BodyKind;
  system: number;
  hidden: boolean;
  /** Hops from the nearest sun (0 for suns and rogues). */
  depth: number;
  /** The neighbouring table one hop closer to the sun (outer planets), or null. */
  parent: string | null;
  /** The sun a planet orbits. */
  host: string | null;
  /** Suns a shared body sits between. */
  hosts: string[];
  /** Orbit radius around the host sun (planets) or the belt centre (rogues). */
  orbit: number;
  /** Start angle, or the angle offset from `lock`. */
  phase: number;
  /** Angular speed in radians per second (0 for locked bodies: they follow `lock`). */
  speed: number;
  /** Orbit inclination in radians. */
  tilt: number;
  /** Outer planets follow the angle of this depth-1 planet. */
  lock: string | null;
  /** Base radius of the body. */
  radius: number;
  /** Radius including its moons (for spacing and camera framing). */
  reach: number;
  columns: number | null;
  measures: number;
  links: number;
  /** Fixed offset from the system centre (suns and shared bodies). */
  anchor: Vec3;
}

export interface OrrerySystem {
  index: number;
  name: string;
  kind: 'star' | 'belt';
  centre: Vec3;
  extent: number;
  suns: string[];
  bodies: string[];
}

export interface OrreryMoon {
  /** `m:<table>|<measure>` */
  id: string;
  table: string;
  name: string;
  hidden: boolean;
  orbit: number;
  phase: number;
  speed: number;
  tilt: number;
}

export interface OrreryTrail {
  /** `r:<index in meta.relationships>` */
  id: string;
  index: number;
  rel: RelationshipInfo;
  from: string;
  to: string;
  active: boolean;
  both: boolean;
  manyToMany: boolean;
  /** Filters flow toward these ends (the arrowheads of the 2D diagram). */
  towardFrom: boolean;
  towardTo: boolean;
}

export interface Orrery {
  bodies: OrreryBody[];
  systems: OrrerySystem[];
  moons: OrreryMoon[];
  trails: OrreryTrail[];
  byName: Map<string, OrreryBody>;
  /** Radius of a sphere around the origin that holds everything. */
  extent: number;
}

export const tableId = (name: string) => `t:${name}`;
export const measureId = (table: string, name: string) => `m:${table}|${name}`;
export const relId = (index: number) => `r:${index}`;

export type ObjectRef =
  | { kind: 'table'; table: string }
  | { kind: 'measure'; table: string; measure: string }
  | { kind: 'relationship'; index: number };

export function parseObjectId(id: string): ObjectRef | null {
  if (id.startsWith('t:')) return { kind: 'table', table: id.slice(2) };
  if (id.startsWith('m:')) {
    const rest = id.slice(2);
    const bar = rest.indexOf('|');
    if (bar < 0) return null;
    return { kind: 'measure', table: rest.slice(0, bar), measure: rest.slice(bar + 1) };
  }
  if (id.startsWith('r:')) {
    const n = Number(id.slice(2));
    return Number.isInteger(n) && n >= 0 ? { kind: 'relationship', index: n } : null;
  }
  return null;
}

/** The many side of a relationship, or null for one-to-one and many-to-many. */
export function manySide(r: RelationshipInfo): string | null {
  if (r.cardinality === 'many-to-one') return r.fromTable;
  if (r.cardinality === 'one-to-many') return r.toTable;
  return null;
}

export function oneSide(r: RelationshipInfo): string | null {
  if (r.cardinality === 'many-to-one') return r.toTable;
  if (r.cardinality === 'one-to-many') return r.fromTable;
  return null;
}

/** How fact-like a table is: relationships where it is the many side minus those where it is the one side. */
export function factScore(name: string, rels: RelationshipInfo[]): number {
  let s = 0;
  for (const r of rels) {
    if (r.fromTable === r.toTable) continue;
    if (manySide(r) === name) s++;
    if (oneSide(r) === name) s--;
  }
  return s;
}

/** Suns of one connected group: every table with a fact score of 2 or more, else the single most fact-like table. */
export function pickSuns(group: string[], rels: RelationshipInfo[]): string[] {
  const inGroup = new Set(group);
  const local = rels.filter((r) => inGroup.has(r.fromTable) && inGroup.has(r.toTable));
  const score = new Map(group.map((n) => [n, factScore(n, local)]));
  const facts = group.filter((n) => score.get(n)! >= 2).sort((a, b) => score.get(b)! - score.get(a)! || a.localeCompare(b));
  if (facts.length) return facts;
  const degree = (n: string) => local.filter((r) => r.fromTable === n || r.toTable === n).length;
  return [[...group].sort((a, b) => score.get(b)! - score.get(a)! || degree(b) - degree(a) || a.localeCompare(b))[0]];
}

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** FNV-1a hash to [0, 1): deterministic jitter per name. */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 1_000_003) / 1_000_003;
}

export const SUN_RADIUS = 1.9;
export const MOON_RING_CAPACITY = (ring: number) => 10 + ring * 4;

export function planetRadius(columns: number | null): number {
  return 0.62 + Math.min(0.55, Math.sqrt(columns ?? 4) * 0.1);
}

export function sunRadius(columns: number | null): number {
  return SUN_RADIUS + Math.min(0.6, (columns ?? 8) / 40);
}

/** Moon orbits for a body of radius r with n measures: rings of growing capacity. */
export function moonOrbits(r: number, n: number): { orbit: number; phase: number; ring: number }[] {
  const out: { orbit: number; phase: number; ring: number }[] = [];
  let ring = 0;
  let i = 0;
  while (i < n) {
    const cap = MOON_RING_CAPACITY(ring);
    const inRing = Math.min(cap, n - i);
    for (let k = 0; k < inRing; k++) out.push({ orbit: r + 0.75 + ring * 0.42, phase: (TAU * k) / inRing + ring * 0.37, ring });
    i += inRing;
    ring++;
  }
  return out;
}

function reachOf(radius: number, moons: number): number {
  if (!moons) return radius;
  const rings = moonOrbits(radius, moons);
  return rings[rings.length - 1].orbit + 0.25;
}

/** Kepler-like angular speed: inner orbits are faster. */
export function keplerSpeed(orbit: number): number {
  return 1.7 / Math.pow(Math.max(orbit, 1), 1.5);
}

export interface OrreryOptions {
  /** Leave hidden tables and measures out (what a report author sees). */
  hideHidden?: boolean;
}

export function buildOrrery(meta: ModelMetadata, opts: OrreryOptions = {}): Orrery {
  const hiddenTable = new Map(meta.tables.map((t) => [t.name, t.isHidden]));
  const tableInfo = new Map(meta.tables.map((t) => [t.name, t]));
  let names = allTableNames(meta);
  if (opts.hideHidden) names = names.filter((n) => !hiddenTable.get(n));
  const present = new Set(names);
  const rels = meta.relationships
    .map((rel, index) => ({ rel, index }))
    .filter(({ rel }) => present.has(rel.fromTable) && present.has(rel.toTable));
  const relList = rels.map((r) => r.rel);

  const measures: MeasureInfo[] = meta.measures.filter((m) => present.has(m.table) && !(opts.hideHidden && m.isHidden));
  const measuresOf = new Map<string, MeasureInfo[]>();
  for (const m of measures) measuresOf.set(m.table, [...(measuresOf.get(m.table) ?? []), m]);

  const links = new Map<string, number>(names.map((n) => [n, 0]));
  const adj = new Map<string, Set<string>>(names.map((n) => [n, new Set()]));
  for (const r of relList) {
    if (r.fromTable === r.toTable) continue;
    links.set(r.fromTable, links.get(r.fromTable)! + 1);
    links.set(r.toTable, links.get(r.toTable)! + 1);
    adj.get(r.fromTable)!.add(r.toTable);
    adj.get(r.toTable)!.add(r.fromTable);
  }

  const columnsOf = (n: string) => tableInfo.get(n)?.columnCount ?? null;
  const groups = components(names, relList);
  const starGroups = groups.filter((g) => g.length > 1);
  const rogues = groups.filter((g) => g.length === 1).map((g) => g[0]).sort();

  const bodies: OrreryBody[] = [];
  const systems: OrrerySystem[] = [];

  const makeBody = (name: string, kind: BodyKind, system: number): OrreryBody => {
    const radius = kind === 'sun' ? sunRadius(columnsOf(name)) : planetRadius(columnsOf(name));
    const nMoons = measuresOf.get(name)?.length ?? 0;
    return {
      id: tableId(name),
      name,
      kind,
      system,
      hidden: hiddenTable.get(name) ?? false,
      depth: 0,
      parent: null,
      host: null,
      hosts: [],
      orbit: 0,
      phase: 0,
      speed: 0,
      tilt: 0,
      lock: null,
      radius,
      reach: reachOf(radius, nMoons),
      columns: columnsOf(name),
      measures: tableInfo.get(name)?.measureCount ?? nMoons,
      links: links.get(name) ?? 0,
      anchor: { x: 0, y: 0, z: 0 },
    };
  };

  for (const group of starGroups) {
    const sysIndex = systems.length;
    const suns = pickSuns(group, relList);
    const sunSet = new Set(suns);

    // Multi-source BFS: distance from every sun.
    const dist = new Map<string, Map<string, number>>();
    for (const s of suns) {
      const d = new Map<string, number>([[s, 0]]);
      const q = [s];
      while (q.length) {
        const t = q.shift()!;
        for (const o of [...adj.get(t)!].sort()) {
          if (d.has(o)) continue;
          d.set(o, d.get(t)! + 1);
          q.push(o);
        }
      }
      dist.set(s, d);
    }

    const local = new Map<string, OrreryBody>();
    for (const s of suns) local.set(s, makeBody(s, 'sun', sysIndex));
    for (const n of group) {
      if (sunSet.has(n)) continue;
      const ds = suns.map((s) => ({ s, d: dist.get(s)!.get(n) ?? Infinity }));
      const best = Math.min(...ds.map((x) => x.d));
      const nearest = ds.filter((x) => x.d === best).map((x) => x.s);
      const b = makeBody(n, nearest.length > 1 ? 'shared' : 'planet', sysIndex);
      b.depth = best;
      if (nearest.length > 1) b.hosts = nearest;
      else b.host = nearest[0];
      local.set(n, b);
    }

    // Parent: a neighbour one hop closer to the host sun (planets only).
    for (const b of local.values()) {
      if (b.kind !== 'planet' || b.depth < 2) continue;
      const d = dist.get(b.host!)!;
      const candidates = [...adj.get(b.name)!].filter((o) => d.get(o) === b.depth - 1 && local.get(o)?.kind === 'planet' && local.get(o)?.host === b.host).sort();
      b.parent = candidates[0] ?? null;
    }
    // Lock outer planets to their depth-1 ancestor.
    const ancestor = (b: OrreryBody): OrreryBody | null => {
      let cur: OrreryBody | undefined = b;
      for (let guard = 0; cur && cur.depth > 1 && guard < 64; guard++) cur = cur.parent ? local.get(cur.parent) : undefined;
      return cur && cur.depth === 1 ? cur : null;
    };

    // Orbits per sun.
    const reachBySun = new Map<string, number>();
    for (const s of suns) {
      const sun = local.get(s)!;
      const mine = [...local.values()].filter((b) => b.kind === 'planet' && b.host === s);
      const inner = mine
        .filter((b) => b.depth === 1)
        .sort((a, b) => b.links - a.links || a.name.localeCompare(b.name));
      const outer = mine
        .filter((b) => b.depth > 1)
        .sort((a, b) => a.depth - b.depth || (ancestor(a)?.name ?? '').localeCompare(ancestor(b)?.name ?? '') || a.name.localeCompare(b.name));
      const ordered = [...inner, ...outer];
      let prev = sun.reach + 1.6;
      let prevReach = 0;
      inner.forEach((b, i) => {
        b.phase = (i * GOLDEN * 1.7 + hash01(b.name) * 0.6) % TAU;
      });
      // Siblings locked to the same ancestor fan out around it.
      const fan = new Map<string, OrreryBody[]>();
      for (const b of outer) {
        const a = ancestor(b);
        if (a) {
          b.lock = a.name;
          fan.set(a.name, [...(fan.get(a.name) ?? []), b]);
        }
      }
      for (const list of fan.values()) list.forEach((b, k) => (b.phase = (k - (list.length - 1) / 2) * 0.26));
      for (const b of ordered) {
        const orbit = prev + prevReach + b.reach + 1.1;
        b.orbit = Math.round(orbit * 100) / 100;
        prev = b.orbit;
        prevReach = b.reach;
        b.tilt = (hash01(`${b.name}#tilt`) - 0.5) * 0.12;
        if (!b.lock) {
          b.speed = keplerSpeed(b.orbit);
          if (b.depth > 1) b.phase = (hash01(b.name) * TAU) % TAU;
        }
      }
      reachBySun.set(s, ordered.length ? prev + prevReach : sun.reach);
    }

    // Place the suns.
    const reaches = suns.map((s) => reachBySun.get(s)!);
    const maxReach = Math.max(...reaches);
    if (suns.length === 2) {
      const gap = 5;
      const d = reaches[0] + reaches[1] + gap;
      local.get(suns[0])!.anchor = { x: -d / 2, y: 0, z: 0 };
      local.get(suns[1])!.anchor = { x: d / 2, y: 0, z: 0 };
    } else if (suns.length > 2) {
      const rho = maxReach / Math.sin(Math.PI / suns.length) + 2.5;
      suns.forEach((s, i) => {
        const a = (TAU * i) / suns.length - Math.PI / 2;
        local.get(s)!.anchor = { x: Math.cos(a) * rho, y: 0, z: Math.sin(a) * rho };
      });
    }

    // Shared bodies: between their suns, spread across the line that joins them.
    const sharedGroups = new Map<string, OrreryBody[]>();
    for (const b of local.values()) {
      if (b.kind !== 'shared') continue;
      const key = b.hosts.join('\u0000');
      sharedGroups.set(key, [...(sharedGroups.get(key) ?? []), b]);
    }
    for (const list of sharedGroups.values()) {
      list.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
      const hs = list[0].hosts.map((h) => local.get(h)!);
      let base: Vec3;
      let perp: Vec3;
      if (hs.length === 2) {
        const [a, b] = hs;
        const ra = reachBySun.get(a.name)!;
        const dx = b.anchor.x - a.anchor.x;
        const dz = b.anchor.z - a.anchor.z;
        const len = Math.hypot(dx, dz) || 1;
        const rb = reachBySun.get(b.name)!;
        // The middle of the gap between the two systems' outer orbits.
        const t = (ra + (len - ra - rb) / 2) / len;
        base = { x: a.anchor.x + dx * t, y: 0, z: a.anchor.z + dz * t };
        perp = { x: -dz / len, y: 0, z: dx / len };
      } else {
        base = {
          x: hs.reduce((s, h) => s + h.anchor.x, 0) / hs.length,
          y: 0,
          z: hs.reduce((s, h) => s + h.anchor.z, 0) / hs.length,
        };
        perp = { x: 0, y: 0, z: 1 };
      }
      const step = Math.max(2.6, ...list.map((b) => b.reach * 2 + 1.2));
      list.forEach((b, k) => {
        const off = (k - (list.length - 1) / 2) * step;
        b.anchor = { x: base.x + perp.x * off, y: 0, z: base.z + perp.z * off };
      });
    }

    let extent = 0;
    for (const b of local.values()) {
      if (b.kind === 'planet') {
        const h = local.get(b.host!)!;
        extent = Math.max(extent, Math.hypot(h.anchor.x, h.anchor.z) + b.orbit + b.reach);
      } else extent = Math.max(extent, Math.hypot(b.anchor.x, b.anchor.z) + b.reach);
    }
    const name =
      suns.length === 1 ? `${suns[0]} system` : suns.length === 2 ? `${suns[0]} and ${suns[1]}` : `${suns[0]} cluster`;
    systems.push({ index: sysIndex, name, kind: 'star', centre: { x: 0, y: 0, z: 0 }, extent: extent + 1.5, suns, bodies: [...local.keys()].sort() });
    bodies.push(...local.values());
  }

  if (rogues.length) {
    const sysIndex = systems.length;
    const local = rogues.map((n) => makeBody(n, 'rogue', sysIndex));
    const maxReach = Math.max(...local.map((b) => b.reach));
    const ring = local.length === 1 ? 0 : Math.max(4, (local.length * (maxReach * 2 + 1.4)) / TAU);
    local.forEach((b, i) => {
      b.orbit = ring;
      b.phase = (TAU * i) / local.length;
      b.speed = ring ? 0.12 / Math.max(ring, 1) : 0;
      b.tilt = (hash01(`${b.name}#tilt`) - 0.5) * 0.1;
    });
    systems.push({
      index: sysIndex,
      name: starGroups.length ? 'Unlinked belt' : 'Tables',
      kind: 'belt',
      centre: { x: 0, y: 0, z: 0 },
      extent: ring + maxReach + 1.5,
      suns: [],
      bodies: rogues,
    });
    bodies.push(...local);
  }

  placeSystems(systems);

  const byName = new Map(bodies.map((b) => [b.name, b]));
  const moons: OrreryMoon[] = [];
  for (const [table, list] of [...measuresOf.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const host = byName.get(table);
    if (!host) continue;
    const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
    const orbits = moonOrbits(host.radius, sorted.length);
    sorted.forEach((m, i) => {
      const o = orbits[i];
      moons.push({
        id: measureId(table, m.name),
        table,
        name: m.name,
        hidden: m.isHidden,
        orbit: o.orbit,
        phase: o.phase,
        speed: (0.55 / Math.sqrt(o.orbit)) * (o.ring % 2 ? -1 : 1),
        tilt: (o.ring % 2 ? -1 : 1) * (0.22 + o.ring * 0.08),
      });
    });
  }

  const trails: OrreryTrail[] = rels
    .filter(({ rel }) => rel.fromTable !== rel.toTable)
    .map(({ rel, index }) => {
      const ends = arrowEnds(rel);
      return {
        id: relId(index),
        index,
        rel,
        from: rel.fromTable,
        to: rel.toTable,
        active: rel.isActive,
        both: rel.crossFilter === 'both',
        manyToMany: rel.cardinality === 'many-to-many',
        towardFrom: ends.start,
        towardTo: ends.end,
      };
    });

  const extent = Math.max(6, ...systems.map((s) => Math.hypot(s.centre.x, s.centre.z) + s.extent));
  return { bodies, systems, moons, trails, byName, extent };
}

/** Largest system at the origin; the others spiral out by the golden angle without overlapping. */
export function placeSystems(systems: OrrerySystem[]): void {
  const order = [...systems].sort((a, b) => (a.kind === b.kind ? b.extent - a.extent : a.kind === 'star' ? -1 : 1));
  const placed: OrrerySystem[] = [];
  order.forEach((s, i) => {
    if (i === 0) {
      s.centre = { x: 0, y: 0, z: 0 };
      placed.push(s);
      return;
    }
    const a = i * GOLDEN * 2 + 0.6;
    const dir = { x: Math.cos(a), z: Math.sin(a) };
    let d = placed[0].extent + s.extent + 3;
    for (let guard = 0; guard < 400; guard++) {
      const c = { x: dir.x * d, y: 0, z: dir.z * d };
      if (placed.every((p) => Math.hypot(p.centre.x - c.x, p.centre.z - c.z) >= p.extent + s.extent + 3)) {
        s.centre = { x: Math.round(c.x * 100) / 100, y: 0, z: Math.round(c.z * 100) / 100 };
        break;
      }
      d += 1.5;
    }
    placed.push(s);
  });
}

function orbitPoint(centre: Vec3, orbit: number, angle: number, tilt: number): Vec3 {
  const c = Math.cos(angle) * orbit;
  const s = Math.sin(angle) * orbit;
  return { x: centre.x + c, y: centre.y + s * Math.sin(tilt), z: centre.z + s * Math.cos(tilt) };
}

/** Current angle of a body on its orbit at time t (seconds). */
export function bodyAngle(o: Orrery, b: OrreryBody, t: number): number {
  if (b.lock) {
    const l = o.byName.get(b.lock);
    if (l) return l.phase + l.speed * t + b.phase;
  }
  return b.phase + b.speed * t;
}

/** Centre of the body's orbit (its host sun, or the belt centre). */
export function orbitCentre(o: Orrery, b: OrreryBody): Vec3 {
  const sys = o.systems[b.system];
  if (b.kind === 'planet' && b.host) {
    const h = o.byName.get(b.host)!;
    return { x: sys.centre.x + h.anchor.x, y: 0, z: sys.centre.z + h.anchor.z };
  }
  return sys.centre;
}

export function bodyPosition(o: Orrery, b: OrreryBody, t: number): Vec3 {
  const sys = o.systems[b.system];
  if (b.kind === 'sun' || b.kind === 'shared') return { x: sys.centre.x + b.anchor.x, y: 0, z: sys.centre.z + b.anchor.z };
  return orbitPoint(orbitCentre(o, b), b.orbit, bodyAngle(o, b, t), b.tilt);
}

export function moonPosition(o: Orrery, m: OrreryMoon, t: number, host?: Vec3): Vec3 {
  const h = host ?? bodyPosition(o, o.byName.get(m.table)!, t);
  return orbitPoint(h, m.orbit, m.phase + m.speed * t, m.tilt);
}

/** How a body is described in the UI. */
export function kindLabel(b: Pick<OrreryBody, 'kind' | 'depth' | 'hosts'>): string {
  switch (b.kind) {
    case 'sun':
      return 'Star · fact table';
    case 'planet':
      return b.depth > 1 ? 'Outer planet · linked dimension' : 'Planet · dimension';
    case 'shared':
      return `Shared · between ${b.hosts.length} stars`;
    case 'rogue':
      return 'Rogue · no relationships';
  }
}

export function kindShort(b: Pick<OrreryBody, 'kind' | 'depth'>): string {
  return b.kind === 'sun' ? 'Star' : b.kind === 'planet' ? (b.depth > 1 ? 'Outer planet' : 'Planet') : b.kind === 'shared' ? 'Shared' : 'Rogue';
}

/** Tables one relationship away from `name`. */
export function neighbours(o: Orrery, name: string): Set<string> {
  const s = new Set([name]);
  for (const t of o.trails) {
    if (t.from === name) s.add(t.to);
    if (t.to === name) s.add(t.from);
  }
  return s;
}
