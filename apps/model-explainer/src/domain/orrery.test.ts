import { financeModel, loadMock, operationsModel } from '../test/fixtures';
import { bodyPosition, buildOrrery, factScore, moonPosition, parseObjectId, pickSuns, type Orrery } from './orrery';
import type { RelationshipInfo } from './types';

const rel = (fromTable: string, toTable: string, extra: Partial<RelationshipInfo> = {}): RelationshipInfo => ({
  name: `${fromTable}-${toTable}`,
  fromTable,
  fromColumn: 'k',
  toTable,
  toColumn: 'k',
  isActive: true,
  crossFilter: 'single',
  cardinality: 'many-to-one',
  ...extra,
});

function dist(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** No two bodies overlap at a few moments in time. */
function assertNoCollisions(o: Orrery) {
  for (const t of [0, 7, 31, 120]) {
    const pos = o.bodies.map((b) => ({ b, p: bodyPosition(o, b, t) }));
    for (let i = 0; i < pos.length; i++)
      for (let j = i + 1; j < pos.length; j++) {
        const d = Math.hypot(pos[i].p.x - pos[j].p.x, pos[i].p.y - pos[j].p.y, pos[i].p.z - pos[j].p.z);
        expect(d, `${pos[i].b.name} and ${pos[j].b.name} at t=${t}`).toBeGreaterThan(pos[i].b.radius + pos[j].b.radius);
      }
  }
}

describe('fact detection', () => {
  it('scores the many side up and the one side down', () => {
    const rels = [rel('Sales', 'Date'), rel('Sales', 'Product'), rel('Product', 'Category')];
    expect(factScore('Sales', rels)).toBe(2);
    expect(factScore('Product', rels)).toBe(0);
    expect(factScore('Date', rels)).toBe(-1);
    expect(pickSuns(['Sales', 'Date', 'Product', 'Category'], rels)).toEqual(['Sales']);
  });

  it('falls back to the most fact-like table, and handles one-to-many written the other way round', () => {
    expect(pickSuns(['A', 'B'], [rel('B', 'A', { cardinality: 'one-to-many' })])).toEqual(['A']);
  });
});

describe('the sample sales model as a solar system', () => {
  it('has Sales as the only sun, outriggers on locked outer orbits and the hidden loose table in the belt', async () => {
    const meta = await loadMock();
    const o = buildOrrery(meta);
    expect(o.bodies).toHaveLength(9);
    const k = (n: string) => o.byName.get(n)!;
    expect(o.bodies.filter((b) => b.kind === 'sun').map((b) => b.name)).toEqual(['Sales']);
    for (const n of ['Product', 'Customer', 'Date', 'Store', 'dim_Promo_TBL']) {
      expect(k(n).kind).toBe('planet');
      expect(k(n).depth).toBe(1);
      expect(k(n).host).toBe('Sales');
    }
    for (const n of ["Manager's Targets", 'Store Survey']) {
      expect(k(n).depth).toBe(2);
      expect(k(n).parent).toBe('Store');
      expect(k(n).lock).toBe('Store');
      expect(k(n).orbit).toBeGreaterThan(k('Store').orbit);
    }
    expect(k('Currency Rates').kind).toBe('rogue');
    expect(k('Currency Rates').hidden).toBe(true);
    expect(o.systems.map((s) => s.kind)).toEqual(['star', 'belt']);
    expect(o.moons).toHaveLength(14);
    expect(o.trails).toHaveLength(8);
    expect(o.trails.filter((t) => !t.active)).toHaveLength(1);
    expect(o.trails.filter((t) => t.both)).toHaveLength(1);
    assertNoCollisions(o);
  });

  it('keeps every orbit unique and moons outside their host', async () => {
    const o = buildOrrery(await loadMock());
    const orbits = o.bodies.filter((b) => b.kind === 'planet').map((b) => b.orbit);
    expect(new Set(orbits).size).toBe(orbits.length);
    for (const m of o.moons) {
      const host = o.byName.get(m.table)!;
      const p = moonPosition(o, m, 12);
      const h = bodyPosition(o, host, 12);
      expect(Math.hypot(p.x - h.x, p.y - h.y, p.z - h.z)).toBeGreaterThan(host.radius);
    }
  });

  it('keeps an outer planet next to the planet it hangs off as time passes', async () => {
    const o = buildOrrery(await loadMock());
    const store = o.byName.get('Store')!;
    const survey = o.byName.get('Store Survey')!;
    const gap = (t: number) => dist(bodyPosition(o, store, t), bodyPosition(o, survey, t));
    expect(Math.abs(gap(0) - gap(500))).toBeLessThan(0.01);
  });

  it('leaves hidden tables and measures out for a report author', async () => {
    const o = buildOrrery(await loadMock(), { hideHidden: true });
    expect(o.byName.has('Currency Rates')).toBe(false);
    expect(o.moons.some((m) => m.name === '_Base Sales')).toBe(false);
    expect(o.systems).toHaveLength(1);
  });
});

describe('the 43-table operations model', () => {
  it('builds a binary system around a shared Region and one belt of loose tables', async () => {
    const meta = await loadMock(operationsModel);
    const o = buildOrrery(meta);
    expect(o.bodies).toHaveLength(43);
    const suns = o.bodies.filter((b) => b.kind === 'sun').map((b) => b.name).sort();
    expect(suns).toEqual(['Deliveries', 'Inspections', 'Purchase Order Lines', 'Stock Movements', 'Work Orders']);
    const region = o.byName.get('Region')!;
    expect(region.kind).toBe('shared');
    expect(region.hosts.sort()).toEqual(['Deliveries', 'Stock Movements']);
    const binary = o.systems[region.system];
    expect(binary.suns.sort()).toEqual(['Deliveries', 'Stock Movements']);
    expect(o.byName.get('Item Group')!.parent).toBe('Item');
    expect(o.systems.filter((s) => s.kind === 'belt')).toHaveLength(1);
    expect(o.bodies.filter((b) => b.kind === 'rogue')).toHaveLength(8);
    expect(o.moons).toHaveLength(0);
    // Systems never overlap.
    for (let i = 0; i < o.systems.length; i++)
      for (let j = i + 1; j < o.systems.length; j++)
        expect(dist(o.systems[i].centre, o.systems[j].centre)).toBeGreaterThanOrEqual(o.systems[i].extent + o.systems[j].extent);
    assertNoCollisions(o);
  });
});

describe('a model whose relationships are blocked', () => {
  it('draws every table as a loose body', async () => {
    const o = buildOrrery(await loadMock(financeModel));
    expect(o.bodies).toHaveLength(4);
    expect(o.bodies.every((b) => b.kind === 'rogue')).toBe(true);
    expect(o.systems).toHaveLength(1);
    expect(o.systems[0].name).toBe('Tables');
    assertNoCollisions(o);
  });
});

describe('object ids', () => {
  it('round-trips table, measure and relationship ids', () => {
    expect(parseObjectId('t:Sales')).toEqual({ kind: 'table', table: 'Sales' });
    expect(parseObjectId("m:Manager's Targets|Target Gap")).toEqual({ kind: 'measure', table: "Manager's Targets", measure: 'Target Gap' });
    expect(parseObjectId('r:3')).toEqual({ kind: 'relationship', index: 3 });
    expect(parseObjectId('x:1')).toBeNull();
  });
});
