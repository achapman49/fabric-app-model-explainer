import { financeModel, loadMock, operationsModel } from '../test/fixtures';
import { quotesBalanced } from './dax';
import { generateQuestions, isQuestionColumn, noQuestionsReason, referencedTables, slicingTables } from './questions';
import type { RelationshipInfo } from './types';

describe('generateQuestions on the Sample Sales Model', () => {
  it('covers up to 6 visible numeric measures with up to 4 columns each', async () => {
    const groups = generateQuestions(await loadMock());
    expect(groups.map((g) => g.measure.name)).toEqual(['Total Sales', 'Sales [Prior Year]', 'Target Amount', 'Gross Margin', 'Margin %', 'Order Count']);
    for (const g of groups) {
      expect(g.questions.length).toBeGreaterThan(0);
      expect(g.questions.length).toBeLessThanOrEqual(4);
    }
  });

  it('prefers text columns on related tables, one per table first', async () => {
    const [total] = generateQuestions(await loadMock());
    expect(total.questions.map((q) => `${q.column.table}[${q.column.name}]`)).toEqual([
      'Product[Category]',
      'Customer[Segment]',
      'Date[Month]',
      'Store[Store Name]',
    ]);
    expect(total.questions[0].text).toBe('What is Total Sales by Category?');
    expect(total.questions[0].dax).toBe(`EVALUATE TOPN(20, SUMMARIZECOLUMNS('Product'[Category], "v", [Total Sales]), [v], DESC)`);
  });

  it('escapes apostrophes and brackets in the generated DAX', async () => {
    const groups = generateQuestions(await loadMock());
    const prior = groups.find((g) => g.measure.name === 'Sales [Prior Year]')!;
    expect(prior.questions[0].dax).toContain('[Sales [Prior Year]]]');
    const target = groups.find((g) => g.measure.name === 'Target Amount')!;
    expect(target.questions.map((q) => q.dax).join('\n')).toContain(`'Manager''s Targets'[Region]`);
    for (const q of groups.flatMap((g) => g.questions)) expect(quotesBalanced(q.dax)).toBe(true);
  });

  it('replaces measures that have no column to group by with the next ones', async () => {
    const meta = await loadMock();
    const orphan = (name: string) => ({ ...meta.measures[0], table: 'Parameters', name, expression: 'SELECTEDVALUE ( Parameters[Value] )' });
    meta.measures = [orphan('Orphan A'), orphan('Orphan B'), ...meta.measures];
    const groups = generateQuestions(meta);
    expect(groups).toHaveLength(6);
    expect(groups.map((g) => g.measure.name)).toEqual(['Total Sales', 'Sales [Prior Year]', 'Target Amount', 'Gross Margin', 'Margin %', 'Order Count']);
    meta.measures = meta.measures.filter((m) => m.name !== 'Gross Margin');
    expect(generateQuestions(meta).map((g) => g.measure.name)).toContain('Total Cost');
  });

  it('skips hidden, text and key-like objects', async () => {
    const meta = await loadMock();
    const qs = generateQuestions(meta).flatMap((g) => g.questions);
    expect(qs.some((q) => q.measure.isHidden || q.measure.dataType === 'Text')).toBe(false);
    expect(qs.some((q) => q.column.isHidden || /Key$/.test(q.column.name))).toBe(false);
    expect(qs.some((q) => q.column.table === 'Currency Rates')).toBe(false);
  });
});

describe('edge cases', () => {
  it('explains why a model without measures has no questions', async () => {
    const meta = await loadMock(operationsModel);
    const groups = generateQuestions(meta);
    expect(groups).toEqual([]);
    expect(noQuestionsReason(meta, groups)).toMatch(/has no measures/);
  });

  it('explains unavailable measure metadata', async () => {
    const meta = await loadMock(financeModel);
    expect(noQuestionsReason(meta, generateQuestions(meta))).toMatch(/not available/);
  });

  it('returns null when there are questions', async () => {
    const meta = await loadMock();
    expect(noQuestionsReason(meta, generateQuestions(meta))).toBeNull();
  });
});

describe('helpers', () => {
  it('finds tables referenced in DAX', () => {
    const known = ['Sales', "Manager's Targets", 'Date', 'Product'];
    expect(referencedTables("SUM ( 'Manager''s Targets'[Target Amount] )", known)).toEqual(["Manager's Targets"]);
    expect(referencedTables('CALCULATE([x], Date[Year] = 2026, Sales[Qty] > 1)', known)).toEqual(['Sales', 'Date']);
    expect(referencedTables(null, known)).toEqual([]);
  });

  it('follows active relationships from the many side, and both ways for bidirectional ones', () => {
    const r = (from: string, to: string, over: Partial<RelationshipInfo> = {}): RelationshipInfo => ({
      name: `${from}-${to}`,
      fromTable: from,
      fromColumn: 'k',
      toTable: to,
      toColumn: 'k',
      isActive: true,
      crossFilter: 'single',
      cardinality: 'many-to-one',
      ...over,
    });
    const rels = [r('Sales', 'Product'), r('Product', 'Category'), r('Sales', 'Date', { isActive: false }), r('Returns', 'Product')];
    expect(slicingTables(['Sales'], rels)).toEqual(['Sales', 'Product', 'Category']);
    expect(slicingTables(['Product'], rels)).toEqual(['Product', 'Category']);
    expect(slicingTables(['Product'], [r('Sales', 'Product', { crossFilter: 'both' })])).toEqual(['Product', 'Sales']);
    expect(slicingTables(['Product'], [r('Product', 'Sales', { cardinality: 'one-to-many' })])).toEqual(['Product']);
    expect(slicingTables(['Sales'], [r('Product', 'Sales', { cardinality: 'one-to-many' })])).toEqual(['Sales', 'Product']);
  });

  it('accepts visible text and date columns that are not keys', () => {
    const c = { table: 'T', name: 'Region', dataType: 'Text', isHidden: false, description: '', displayFolder: '', kind: 'data' as const, formatString: '' };
    expect(isQuestionColumn(c)).toBe(true);
    expect(isQuestionColumn({ ...c, dataType: 'DateTime' })).toBe(true);
    expect(isQuestionColumn({ ...c, dataType: 'Integer' })).toBe(false);
    expect(isQuestionColumn({ ...c, isHidden: true })).toBe(false);
    expect(isQuestionColumn({ ...c, name: 'Customer Key' })).toBe(false);
    expect(isQuestionColumn({ ...c, name: 'OrderID' })).toBe(false);
  });
});
