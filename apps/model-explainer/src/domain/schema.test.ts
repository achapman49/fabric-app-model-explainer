import { financeModel, loadMock, operationsModel } from '../test/fixtures';
import { anchorY, BORDER, COMPACT_COLUMNS, COMPACT_MEASURES, describeLink, flowOf, layoutSchema, type SchemaCard } from './schema';
import type { ModelMetadata, RelationshipInfo } from './types';

function overlap(a: SchemaCard, b: SchemaCard) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function assertNoOverlaps(cards: SchemaCard[]) {
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++) expect(overlap(cards[i], cards[j]), `${cards[i].name} and ${cards[j].name}`).toBe(false);
}

const card = (meta: ModelMetadata, name: string, opts?: Parameters<typeof layoutSchema>[1]) => layoutSchema(meta, opts).cards.find((c) => c.name === name)!;

describe('layoutSchema', () => {
  it('puts the fact table in the centre column with its dimensions either side', async () => {
    const meta = await loadMock();
    const { cards } = layoutSchema(meta);
    const sales = cards.find((c) => c.name === 'Sales')!;
    expect(sales.kind).toBe('fact');
    expect(sales.column).toBe(0);
    const ring = cards.filter((c) => Math.abs(c.column) === 1).map((c) => c.column);
    expect(ring).toContain(1);
    expect(ring).toContain(-1);
    assertNoOverlaps(cards);
  });

  it('places tables with no relationships in their own labelled grid', async () => {
    const meta = await loadMock();
    const { cards, labels } = layoutSchema(meta);
    const loose = cards.filter((c) => c.kind === 'loose').map((c) => c.name);
    expect(loose).toEqual(['Currency Rates']);
    expect(labels.map((l) => l.text)).toEqual(['Not related to any other table']);
  });

  it('draws one link per relationship, from the key row on one card to the key row on the other', async () => {
    const meta = await loadMock();
    const { cards, links } = layoutSchema(meta);
    expect(links).toHaveLength(meta.relationships.length);
    const byName = new Map(cards.map((c) => [c.name, c]));
    for (const l of links) {
      const from = byName.get(l.rel.fromTable)!;
      const to = byName.get(l.rel.toTable)!;
      expect(l.start.y).toBe(anchorY(from, l.rel.fromColumn));
      expect(l.end.y).toBe(anchorY(to, l.rel.toColumn));
      // The anchor is a listed key row, not the header fallback.
      expect(l.start.y).not.toBe(from.y + BORDER + 20);
      expect([from.x, from.x + from.w]).toContain(l.start.x);
      expect([to.x, to.x + to.w]).toContain(l.end.x);
    }
  });

  it('always lists relationship keys, even hidden ones with hidden fields switched off', async () => {
    const meta = await loadMock();
    const sales = card(meta, 'Sales', { showHidden: false });
    const listed = sales.rows.flatMap((r) => (r.kind === 'column' ? [r] : []));
    expect(listed.filter((r) => r.isKey).map((r) => r.column.name)).toEqual(
      expect.arrayContaining(['Order Date', 'Product Key', 'Customer Key', 'Store Key', 'Promo Key']),
    );
    expect(listed.filter((r) => !r.isKey).every((r) => !r.column.isHidden)).toBe(true);
  });

  it('caps a collapsed card and lists everything once expanded', async () => {
    const meta = await loadMock();
    const collapsed = card(meta, 'Store Survey');
    const others = collapsed.rows.filter((r) => r.kind === 'column' && !r.isKey);
    expect(others).toHaveLength(COMPACT_COLUMNS);
    const toggle = collapsed.rows.find((r) => r.kind === 'toggle');
    const total = meta.columns.filter((c) => c.table === 'Store Survey').length;
    expect(toggle).toMatchObject({ kind: 'toggle', expanded: false, more: total - collapsed.rows.filter((r) => r.kind === 'column').length });

    const open = card(meta, 'Store Survey', { expanded: new Set(['Store Survey']) });
    expect(open.rows.filter((r) => r.kind === 'column')).toHaveLength(total);
    expect(open.rows.find((r) => r.kind === 'toggle')).toMatchObject({ expanded: true, more: 0 });
    expect(open.h).toBeGreaterThan(collapsed.h);

    const sales = card(meta, 'Sales');
    expect(sales.rows.filter((r) => r.kind === 'measure').length).toBeLessThanOrEqual(COMPACT_MEASURES);
  });

  it('keeps cards apart in a large model with several fact tables', async () => {
    const meta = await loadMock(operationsModel);
    const { cards, links } = layoutSchema(meta);
    expect(cards.length).toBe(43);
    expect(cards.filter((c) => c.kind === 'fact').length).toBeGreaterThan(1);
    expect(links).toHaveLength(meta.relationships.length);
    assertNoOverlaps(cards);
  });

  it('degrades when relationships cannot be read', async () => {
    const meta = await loadMock(financeModel);
    const { cards, links, labels } = layoutSchema(meta);
    expect(links).toHaveLength(0);
    expect(cards.every((c) => c.kind === 'loose')).toBe(true);
    expect(labels[0].text).toBe('Relationships could not be read for this model');
    assertNoOverlaps(cards);
  });
});

const rel = (extra: Partial<RelationshipInfo>): RelationshipInfo => ({
  name: 'r',
  fromTable: 'Sales',
  fromColumn: 'Customer Key',
  toTable: 'Customer',
  toColumn: 'Customer Key',
  isActive: true,
  crossFilter: 'single',
  cardinality: 'many-to-one',
  ...extra,
});

describe('flowOf and describeLink', () => {
  it('sends filters from the one side to the many side', () => {
    expect(flowOf(rel({}))).toBe('backward');
    expect(flowOf(rel({ cardinality: 'one-to-many' }))).toBe('forward');
    expect(flowOf(rel({ crossFilter: 'both' }))).toBe('both');
  });

  it('describes a relationship from the filtering table', () => {
    expect(describeLink(rel({}))).toBe('Customer filters Sales on [Customer Key].');
    expect(describeLink(rel({ crossFilter: 'both' }))).toBe('Customer filters Sales on [Customer Key] (and back: filters both ways).');
    expect(describeLink(rel({ isActive: false, toColumn: 'Key' }))).toBe(
      'Customer filters Sales on [Customer Key] = [Key]. Inactive: only used when a measure calls USERELATIONSHIP.',
    );
  });
});
