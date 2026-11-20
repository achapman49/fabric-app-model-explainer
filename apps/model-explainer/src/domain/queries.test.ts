import { errorResult, MockModelClient, tableResult } from '@x10/shared/connectors';

import { mockClient } from '../mock/engine';
import { salesModel } from '../mock/salesModel';
import { topByQuery } from './dax';
import { countRows, formatCell, formatNumber, runQuestion } from './queries';

describe('countRows', () => {
  it('runs one COUNTROWS query for the table', async () => {
    const client = mockClient(salesModel);
    const r = await countRows(client, "Manager's Targets");
    expect(r).toEqual({ ok: true, value: 60, query: `EVALUATE ROW("n", COUNTROWS('Manager''s Targets'))` });
    expect(client.calls).toEqual([`EVALUATE ROW("n", COUNTROWS('Manager''s Targets'))`]);
  });

  it('treats BLANK as zero and passes errors through', async () => {
    const blank = new MockModelClient(() => tableResult(['[n]'], [[null]]));
    expect(await countRows(blank, 'Empty')).toMatchObject({ ok: true, value: 0 });
    const failing = new MockModelClient(() => errorResult('api', 'Forbidden'));
    expect(await countRows(failing, 'Sales')).toMatchObject({ ok: false, error: { category: 'api', message: 'Forbidden' } });
    const odd = new MockModelClient(() => tableResult(['[n]'], [['many']]));
    expect(await countRows(odd, 'Sales')).toMatchObject({ ok: false, error: { category: 'query' } });
  });
});

describe('runQuestion', () => {
  it('returns label and value rows, highest first', async () => {
    const r = await runQuestion(mockClient(salesModel), topByQuery('Product', 'Category', 'Total Sales'), 'Category');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.rows.map((x) => x.label).sort()).toEqual(['Accessories', 'Bikes', 'Clothing', 'Components']);
    const values = r.value.rows.map((x) => x.value!);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(values.every((v) => v >= 180_000 && v <= 2_400_000)).toBe(true);
  });

  it('works for names with apostrophes and brackets', async () => {
    const r = await runQuestion(mockClient(salesModel), topByQuery("Manager's Targets", 'Region', 'Sales [Prior Year]'), 'Region');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.rows).toHaveLength(5);
  });

  it('refuses unbalanced DAX and reports query errors', async () => {
    const client = mockClient(salesModel);
    expect(await runQuestion(client, "EVALUATE 'Sales", 'x')).toMatchObject({ ok: false, error: { category: 'validation' } });
    expect(client.calls).toEqual([]);
    expect(await runQuestion(client, topByQuery('Nope', 'x', 'Total Sales'), 'x')).toMatchObject({ ok: false, error: { category: 'query' } });
  });
});

describe('formatting', () => {
  it('formats cells and numbers', () => {
    expect(formatCell(null)).toBe('(Blank)');
    expect(formatCell('Bikes')).toBe('Bikes');
    expect(formatCell('2026-03-01T00:00:00')).not.toContain('T00');
    expect(formatNumber(1234567.891)).toBe((1234567.891).toLocaleString(undefined, { maximumFractionDigits: 0 }));
    expect(formatNumber(0.4567)).toBe((0.4567).toLocaleString(undefined, { maximumFractionDigits: 3 }));
    expect(formatNumber(null)).toBe('(Blank)');
  });
});
