import { answer, infoViewTable, MOCK_MODELS, unitHash } from './engine';
import { financeModel } from './otherModels';
import { salesModel } from './salesModel';

describe('mock engine', () => {
  it('fails INFO.* and answers INFO.VIEW.* with bracketed columns, like the tenant', () => {
    expect(answer(salesModel, 'EVALUATE INFO.TABLES()')).toMatchObject({ status: 'error', error: { category: 'query' } });
    const r = answer(salesModel, 'EVALUATE  INFO.VIEW.RELATIONSHIPS()');
    expect(r.status).toBe('success');
    if (r.status === 'success') {
      expect(r.table.columns.map((c) => c.name)).toContain('[CrossFilteringBehavior]');
      expect(r.table.rows).toHaveLength(8);
    }
  });

  it('includes a RowNumber column per table', () => {
    const r = infoViewTable(salesModel, 'columns');
    if (r.status !== 'success') throw new Error('expected success');
    const typeIdx = r.table.columns.findIndex((c) => c.name === '[Type]');
    expect(r.table.rows.filter((row) => row[typeIdx] === 'RowNumber')).toHaveLength(salesModel.tables.length);
  });

  it('blocks sections on the finance model', () => {
    expect(answer(financeModel, 'EVALUATE INFO.VIEW.MEASURES()')).toMatchObject({ status: 'error', error: { category: 'api' } });
    expect(answer(financeModel, 'EVALUATE INFO.VIEW.TABLES()').status).toBe('success');
  });

  it('answers Count rows and rejects unknown tables or queries', () => {
    expect(answer(salesModel, `EVALUATE ROW("n", COUNTROWS('Sales'))`)).toMatchObject({ status: 'success', table: { rows: [[1_284_512]] } });
    expect(answer(salesModel, `EVALUATE ROW("n", COUNTROWS('Nope'))`)).toMatchObject({ status: 'error' });
    expect(answer(salesModel, 'EVALUATE Sales')).toMatchObject({ status: 'error' });
  });

  it('is deterministic and caps TOPN', () => {
    const q = `EVALUATE TOPN(3, SUMMARIZECOLUMNS('Product'[Subcategory], "v", [Units Sold]), [v], DESC)`;
    const a = answer(salesModel, q);
    expect(a).toEqual(answer(salesModel, q));
    if (a.status === 'success') {
      expect(a.table.rows).toHaveLength(3);
      expect(a.table.rows.every((r) => Number.isInteger(r[1]))).toBe(true);
    }
  });

  it('every demo model has a unique key and label', () => {
    expect(new Set(MOCK_MODELS.map((m) => m.key)).size).toBe(MOCK_MODELS.length);
    expect(new Set(MOCK_MODELS.map((m) => m.label)).size).toBe(MOCK_MODELS.length);
    expect(unitHash('a')).toBeGreaterThanOrEqual(0);
    expect(unitHash('a')).toBeLessThan(1);
  });
});
