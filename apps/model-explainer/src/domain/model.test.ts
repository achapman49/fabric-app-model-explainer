import { financeModel, loadMock, operationsModel } from '../test/fixtures';
import { columnId, factScore, measureId, parseObjectId, pickFacts, relId, tableId, tableRoles } from './model';
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

describe('fact detection', () => {
  it('scores the many side up and the one side down', () => {
    const rels = [rel('Sales', 'Date'), rel('Sales', 'Product'), rel('Product', 'Category')];
    expect(factScore('Sales', rels)).toBe(2);
    expect(factScore('Product', rels)).toBe(0);
    expect(factScore('Category', rels)).toBe(-1);
    expect(pickFacts(['Sales', 'Date', 'Product', 'Category'], rels)).toEqual(['Sales']);
  });

  it('falls back to the most fact-like table, and handles one-to-many written the other way round', () => {
    expect(pickFacts(['A', 'B'], [rel('B', 'A', { cardinality: 'one-to-many' })])).toEqual(['A']);
  });
});

describe('table roles', () => {
  it('finds the fact table, its dimensions and the unrelated table in the sales model', async () => {
    const roles = tableRoles(await loadMock());
    expect(roles.get('Sales')).toBe('fact');
    expect(roles.get('Customer')).toBe('dimension');
    expect(roles.get('Store Survey')).toBe('dimension');
    expect(roles.get('Currency Rates')).toBe('unrelated');
    expect([...roles.values()].filter((r) => r === 'fact')).toHaveLength(1);
  });

  it('finds several fact tables in a large model', async () => {
    const roles = tableRoles(await loadMock(operationsModel));
    expect(roles.size).toBe(43);
    expect([...roles.values()].filter((r) => r === 'fact').length).toBeGreaterThan(1);
  });

  it('calls every table unrelated when relationships cannot be read', async () => {
    const roles = tableRoles(await loadMock(financeModel));
    expect([...roles.values()].every((r) => r === 'unrelated')).toBe(true);
  });
});

describe('object ids', () => {
  it('round-trips table, column, measure and relationship ids', () => {
    expect(parseObjectId(tableId('Sales'))).toEqual({ kind: 'table', table: 'Sales' });
    expect(parseObjectId(columnId('Product', 'Size [cm]'))).toEqual({ kind: 'column', table: 'Product', column: 'Size [cm]' });
    expect(parseObjectId(measureId("Manager's Targets", 'Target Gap'))).toEqual({ kind: 'measure', table: "Manager's Targets", measure: 'Target Gap' });
    expect(parseObjectId(relId(3))).toEqual({ kind: 'relationship', index: 3 });
    expect(parseObjectId('x:1')).toBeNull();
    expect(parseObjectId('m:no-bar')).toBeNull();
  });
});
