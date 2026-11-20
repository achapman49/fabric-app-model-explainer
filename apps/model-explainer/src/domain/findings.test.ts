import { financeModel, loadMock, operationsModel } from '../test/fixtures';
import { evaluateHealth, healthScore, RULE_DEFS, scoreLabel, scoreTone, unfriendlyReason, type RuleId } from './findings';
import type { MeasureInfo, ModelMetadata, RelationshipInfo, TableInfo } from './types';

const ALL_RULES = RULE_DEFS.map((r) => r.id);

function blank(): ModelMetadata {
  return {
    modelLabel: 'Test',
    tables: [],
    columns: [],
    measures: [],
    relationships: [],
    sections: {
      tables: { ok: true, source: 'INFO.VIEW' },
      columns: { ok: true, source: 'INFO.VIEW' },
      measures: { ok: true, source: 'INFO.VIEW' },
      relationships: { ok: true, source: 'INFO.VIEW' },
    },
    loadedAt: '2026-11-20T09:00:00.000Z',
  };
}
const table = (name: string, over: Partial<TableInfo> = {}): TableInfo => ({
  name,
  description: 'Described.',
  isHidden: false,
  columnCount: 3,
  measureCount: 0,
  storageMode: 'Import',
  dataCategory: null,
  ...over,
});
const measure = (name: string, over: Partial<MeasureInfo> = {}): MeasureInfo => ({
  table: 'Sales',
  name,
  expression: 'SUM(Sales[x])',
  formatString: '#,0',
  description: 'Described.',
  displayFolder: '',
  isHidden: false,
  dataType: 'Number',
  ...over,
});
const rel = (over: Partial<RelationshipInfo> = {}): RelationshipInfo => ({
  name: 'r',
  fromTable: 'Sales',
  fromColumn: 'Key',
  toTable: 'Product',
  toColumn: 'Key',
  isActive: true,
  crossFilter: 'single',
  cardinality: 'many-to-one',
  ...over,
});
const fired = (m: ModelMetadata) => evaluateHealth(m).findings.map((f) => f.rule);

describe('acceptance 1: the mock model fires every rule and the score matches a hand calculation', () => {
  it('fires all eight rules on the Sample Sales Model', async () => {
    const h = evaluateHealth(await loadMock());
    expect(h.findings.map((f) => f.rule).sort()).toEqual([...ALL_RULES].sort());
    expect(h.passed).toEqual([]);
    expect(h.skipped).toEqual([]);
  });

  it('scores 52: 4 warnings (−40) and 4 info (−8)', async () => {
    const h = evaluateHealth(await loadMock());
    expect(h.warnings).toBe(4);
    expect(h.infos).toBe(4);
    expect(h.score).toBe(100 - 4 * 10 - 4 * 2);
    expect(h.score).toBe(52);
  });

  it('flags the seeded objects', async () => {
    const h = evaluateHealth(await loadMock());
    const objects = (id: RuleId) => h.findings.find((f) => f.rule === id)!.objects;
    expect(objects('measures-no-description')).toHaveLength(6);
    expect(h.findings.find((f) => f.rule === 'measures-no-description')!.summary).toBe('6 of 13 visible measures (46%) have no description.');
    expect(objects('tables-no-description')).toEqual(['dim_Promo_TBL']);
    expect(objects('measures-no-format')).toEqual([
      'Sales[Gross Margin]',
      'Sales[Order Count]',
      'Sales[Avg Order Value]',
      'Sales[TOTAL_DISCOUNT]',
      "Manager's Targets[Target Gap]",
      'Sales[_Base Sales]',
    ]);
    expect(objects('bidirectional')).toEqual(['Sales[Customer Key] → Customer[Customer Key]']);
    expect(objects('many-to-many')).toEqual(["Manager's Targets[Region] → Store[Region]"]);
    expect(objects('inactive')).toEqual(['Sales[Ship Date] → Date[Date]']);
    expect(objects('wide-tables')).toEqual(['Store Survey (42 columns)']);
    expect(objects('unfriendly-names')).toEqual([
      'dim_Promo_TBL (table, underscore)',
      'dim_Promo_TBL[PROMO_NAME] (column, underscore)',
      'dim_Promo_TBL[PROMO_TYPE] (column, underscore)',
      'dim_Promo_TBL[Discount_Pct] (column, underscore)',
      'Sales[TOTAL_DISCOUNT] (measure, underscore)',
    ]);
  });

  it('lists warnings before info', async () => {
    const h = evaluateHealth(await loadMock());
    const sev = h.findings.map((f) => f.severity);
    expect(sev).toEqual([...sev].sort((a, b) => (a === b ? 0 : a === 'warning' ? -1 : 1)));
  });
});

describe('each rule in isolation', () => {
  it('measures without a description: more than 20% of visible measures', () => {
    const m = blank();
    m.measures = [measure('a', { description: '' }), measure('b'), measure('c'), measure('d'), measure('e')];
    expect(fired(m)).not.toContain('measures-no-description'); // exactly 20%
    m.measures.push(measure('f', { description: '' }));
    expect(fired(m)).toContain('measures-no-description'); // 2 of 6
    m.measures = [measure('a'), measure('h', { description: '', isHidden: true })];
    expect(fired(m)).not.toContain('measures-no-description'); // hidden ones do not count
  });

  it('tables without a description: visible tables only', () => {
    const m = blank();
    m.tables = [table('A', { description: '', isHidden: true })];
    expect(fired(m)).not.toContain('tables-no-description');
    m.tables.push(table('B', { description: '' }));
    expect(fired(m)).toContain('tables-no-description');
  });

  it('measures without a format string: numeric only', () => {
    const m = blank();
    m.measures = [measure('Label', { formatString: '', dataType: 'Text' })];
    expect(fired(m)).not.toContain('measures-no-format');
    m.measures.push(measure('Count', { formatString: '  ', dataType: 'Integer' }));
    expect(fired(m)).toContain('measures-no-format');
  });

  it('relationship rules', () => {
    const m = blank();
    m.relationships = [rel()];
    expect(fired(m)).toEqual([]);
    m.relationships = [rel({ crossFilter: 'both' })];
    expect(fired(m)).toEqual(['bidirectional']);
    m.relationships = [rel({ cardinality: 'many-to-many' })];
    expect(fired(m)).toEqual(['many-to-many']);
    m.relationships = [rel({ isActive: false })];
    expect(fired(m)).toEqual(['inactive']);
  });

  it('large wide tables: more than 40 columns, visible tables', () => {
    const m = blank();
    m.tables = [table('W', { columnCount: 40 }), table('H', { columnCount: 90, isHidden: true })];
    expect(fired(m)).not.toContain('wide-tables');
    m.tables.push(table('X', { columnCount: 41 }));
    expect(fired(m)).toContain('wide-tables');
  });

  it('unfriendly names', () => {
    expect(unfriendlyReason('Promo_Name')).toBe('underscore');
    expect(unfriendlyReason('dim_Promo')).toBe('underscore');
    expect(unfriendlyReason('DimDate')).toBe('leading dim');
    expect(unfriendlyReason('tblSales')).toBe('leading tbl');
    expect(unfriendlyReason('Dim Date')).toBe('leading dim');
    expect(unfriendlyReason('REGION')).toBe('all caps');
    expect(unfriendlyReason('Dimension')).toBeNull();
    expect(unfriendlyReason('Tables Sold')).toBeNull();
    expect(unfriendlyReason('ID')).toBeNull();
    expect(unfriendlyReason('YTD Sales')).toBeNull();
    expect(unfriendlyReason("Manager's Targets")).toBeNull();
    const m = blank();
    m.columns = [{ table: 'T', name: 'CUST_ID', dataType: 'Text', isHidden: true, description: '', displayFolder: '', kind: 'data', formatString: '' }];
    expect(fired(m)).not.toContain('unfriendly-names');
  });
});

describe('score', () => {
  it('applies the caps', () => {
    expect(healthScore(0, 0)).toBe(100);
    expect(healthScore(1, 1)).toBe(88);
    expect(healthScore(5, 10)).toBe(30);
    expect(healthScore(9, 30)).toBe(30);
  });
  it('labels and tones', () => {
    expect([scoreLabel(100), scoreTone(100)]).toEqual(['Healthy', 'ok']);
    expect([scoreLabel(70), scoreTone(70)]).toEqual(['Needs attention', 'warn']);
    expect([scoreLabel(52), scoreTone(52)]).toEqual(['Needs work', 'bad']);
  });
});

describe('degraded models', () => {
  it('skips rules whose metadata is unavailable and does not count them', async () => {
    const h = evaluateHealth(await loadMock(financeModel));
    const skipped = h.skipped.map((s) => s.rule.id).sort();
    expect(skipped).toEqual(['bidirectional', 'inactive', 'many-to-many', 'measures-no-description', 'measures-no-format', 'unfriendly-names'].sort());
    expect(h.findings).toEqual([]);
    expect(h.score).toBe(100);
  });

  it('the 40+ table operations model is clean', async () => {
    const h = evaluateHealth(await loadMock(operationsModel));
    expect(h.findings).toEqual([]);
    expect(h.score).toBe(100);
  });
});
