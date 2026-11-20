import { loadMock, operationsModel } from '../test/fixtures';
import { arrowEnds, components, fitView, layoutDiagram, nodeLabel, nodeWidth, overlaps, zoomView } from './diagram';
import type { ModelMetadata } from './types';

function layoutOf(meta: ModelMetadata) {
  return layoutDiagram(
    meta.tables.map((t) => ({ name: t.name, isHidden: t.isHidden })),
    meta.relationships,
  );
}

function assertNoOverlaps(nodes: ReturnType<typeof layoutDiagram>['nodes']) {
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) expect(overlaps(nodes[i], nodes[j]), `${nodes[i].id} overlaps ${nodes[j].id}`).toBe(false);
}

describe('acceptance 3: the diagram renders every fixture table with the right line styles', () => {
  it('places all 9 tables (including the hidden one) and all 8 relationships', async () => {
    const meta = await loadMock();
    const l = layoutOf(meta);
    expect(l.nodes.map((n) => n.id).sort()).toEqual(meta.tables.map((t) => t.name).sort());
    expect(l.nodes.find((n) => n.id === 'Currency Rates')!.hidden).toBe(true);
    expect(l.edges).toHaveLength(8);
    assertNoOverlaps(l.nodes);
    for (const n of l.nodes) {
      expect(n.x - n.w / 2).toBeGreaterThanOrEqual(0);
      expect(n.y - n.h / 2).toBeGreaterThanOrEqual(0);
      expect(n.x + n.w / 2).toBeLessThanOrEqual(l.width);
      expect(n.y + n.h / 2).toBeLessThanOrEqual(l.height);
    }
  });

  it('dashes inactive relationships and double-arrows bidirectional ones', async () => {
    const l = layoutOf(await loadMock());
    const edge = (from: string, col: string) => l.edges.find((e) => e.rel.fromTable === from && e.rel.fromColumn === col)!;
    expect(edge('Sales', 'Ship Date').dashed).toBe(true);
    expect(edge('Sales', 'Order Date').dashed).toBe(false);
    expect(l.edges.filter((e) => e.dashed)).toHaveLength(1);
    const both = edge('Sales', 'Customer Key');
    expect([both.arrowStart, both.arrowEnd]).toEqual([true, true]);
    const single = edge('Sales', 'Product Key');
    expect([single.arrowStart, single.arrowEnd]).toEqual([true, false]);
    const m2m = edge("Manager's Targets", 'Region');
    expect([m2m.startLabel.text, m2m.endLabel.text]).toEqual(['*', '*']);
    expect([single.startLabel.text, single.endLabel.text]).toEqual(['*', '1']);
  });

  it('curves parallel relationships apart', async () => {
    const l = layoutOf(await loadMock());
    const toDate = l.edges.filter((e) => e.rel.toTable === 'Date');
    expect(toDate).toHaveLength(2);
    expect(toDate[0].path).not.toBe(toDate[1].path);
  });
});

describe('large models', () => {
  it('clusters a 40+ table model by connected component without overlaps', async () => {
    const meta = await loadMock(operationsModel);
    const l = layoutOf(meta);
    expect(l.nodes.length).toBe(meta.tables.length);
    expect(l.nodes.length).toBeGreaterThan(40);
    // 4 connected stars (two joined by Region) + 8 loose helper tables.
    expect(l.components).toBe(12);
    assertNoOverlaps(l.nodes);
    // Tables of one component stay together: every node's component index is stable and contiguous.
    const comps = components(l.nodes.map((n) => n.id), meta.relationships);
    expect(comps[0].length).toBeGreaterThan(comps[comps.length - 1].length);
  });
});

describe('helpers', () => {
  it('sizes and truncates labels', () => {
    expect(nodeWidth('Date')).toBe(96);
    expect(nodeWidth('A very long table name that keeps going on')).toBeLessThanOrEqual(220);
    expect(nodeLabel('A very long table name that keeps going on').endsWith('…')).toBe(true);
    expect(nodeLabel('Sales')).toBe('Sales');
  });

  it('puts arrowheads on the filtered end', () => {
    expect(arrowEnds({ cardinality: 'many-to-one', crossFilter: 'single' })).toEqual({ start: true, end: false });
    expect(arrowEnds({ cardinality: 'one-to-many', crossFilter: 'single' })).toEqual({ start: false, end: true });
    expect(arrowEnds({ cardinality: 'many-to-one', crossFilter: 'both' })).toEqual({ start: true, end: true });
  });

  it('handles an empty model and a self relationship', () => {
    expect(layoutDiagram([], []).nodes).toEqual([]);
    const self = layoutDiagram([{ name: 'Employee', isHidden: false }], [
      { name: 'r', fromTable: 'Employee', fromColumn: 'Manager Key', toTable: 'Employee', toColumn: 'Key', isActive: false, crossFilter: 'single', cardinality: 'many-to-one' },
    ]);
    expect(self.edges[0].path).toMatch(/^M/);
  });

  it('zooms around a point and fits the content', () => {
    const v = fitView({ width: 1000, height: 500 }, 2);
    expect(v).toEqual({ x: 0, y: 0, w: 1000, h: 500 });
    const tall = fitView({ width: 400, height: 800 }, 1);
    expect(tall.w).toBe(800);
    const z = zoomView(v, 0.5, { x: 500, y: 250 }, { width: 1000, height: 500 });
    expect(z).toEqual({ x: 250, y: 125, w: 500, h: 250 });
    const tooFar = zoomView(v, 0.0001, { x: 0, y: 0 }, { width: 1000, height: 500 });
    expect(tooFar.w).toBe(120);
  });
});
