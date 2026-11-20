import { mockClient } from '../mock/engine';
import { loadMock, operationsModel, salesModel } from '../test/fixtures';
import { tokenizeDax } from './daxTokens';
import { countAllRowsQuery } from './dax';
import { evaluateHealth } from './findings';
import { countAllRows } from './queries';
import { flareMap, measureCoverage, tableCoverage, tableWeather, todayEntries } from './weather';

describe('space weather', () => {
  it('puts every finding on the objects it affects', async () => {
    const meta = await loadMock();
    const map = flareMap(meta, evaluateHealth(meta));
    expect(map.get('t:dim_Promo_TBL')!.map((f) => f.rule).sort()).toEqual(['tables-no-description', 'unfriendly-names', 'unfriendly-names', 'unfriendly-names', 'unfriendly-names']);
    expect(map.get('t:Store Survey')!.map((f) => f.rule)).toEqual(['wide-tables']);
    expect(map.get('m:Sales|Gross Margin')!.map((f) => f.rule).sort()).toEqual(['measures-no-description', 'measures-no-format']);
    const rels = [...map.keys()].filter((k) => k.startsWith('r:'));
    expect(rels).toHaveLength(3);
    expect(tableWeather(map, meta, 'Sales').severity).toBe('warning');
    expect(tableWeather(map, meta, 'Customer').severity).toBeNull();
  });

  it('ranks today: warnings first, at most five, each pointing at an object', async () => {
    const meta = await loadMock();
    const today = todayEntries(meta, evaluateHealth(meta));
    expect(today).toHaveLength(5);
    expect(today.slice(0, 4).every((t) => t.severity === 'warn')).toBe(true);
    expect(today.find((t) => t.id === 'bidirectional')!.focus).toMatch(/^r:\d+$/);
    expect(today.find((t) => t.id === 'measures-no-description')).toMatchObject({ focus: 't:Sales', value: 6, lens: 'coverage' });
  });

  it('has nothing for a model without findings to show', async () => {
    const meta = await loadMock(operationsModel);
    const today = todayEntries(meta, evaluateHealth(meta));
    expect(today.every((t) => t.severity === 'info')).toBe(true);
  });

  it('grades measure coverage, ignoring the format string of text measures', async () => {
    const meta = await loadMock();
    const m = (n: string) => meta.measures.find((x) => x.name === n)!;
    expect(measureCoverage(m('Total Sales'))).toBe('complete');
    expect(measureCoverage(m('Gross Margin'))).toBe('missing-both');
    expect(measureCoverage(m('Avg Order Value'))).toBe('no-format');
    expect(measureCoverage(m('Sales [Prior Year]'))).toBe('no-description');
    expect(measureCoverage(m('Sales Label'))).toBe('complete');
    expect(tableCoverage(meta, 'Product')).toBeNull();
    expect(tableCoverage(meta, "Manager's Targets")).toBeCloseTo(1 / 3);
  });
});

describe('row counts in one query', () => {
  it('quotes every name and reads the counts back from the mock engine', async () => {
    expect(countAllRowsQuery(["Manager's Targets"])).toBe(`EVALUATE ROW("t", "Manager's Targets", "n", COUNTROWS('Manager''s Targets'))`);
    const names = salesModel.tables.map((t) => t.name);
    const { counts, error } = await countAllRows(mockClient(salesModel), names);
    expect(error).toBeNull();
    expect(counts.get('Sales')).toBe(1_284_512);
    expect(counts.get("Manager's Targets")).toBe(60);
    expect(counts.size).toBe(9);
  });

  it('batches big models and keeps the counts that worked', async () => {
    const names = operationsModel.tables.map((t) => t.name);
    const { counts } = await countAllRows(mockClient(operationsModel), names);
    expect(counts.size).toBe(43);
    const partial = await countAllRows(mockClient(salesModel), ['Sales', 'Nope']);
    expect(partial.error?.message).toContain('Nope');
  });
});

describe('DAX tokens', () => {
  it('round-trips and classifies functions, tables, columns, strings and comments', () => {
    const src = `VAR x = CALCULATE ( [Total Sales], 'Manager''s Targets'[Region] = "North" ) // note\nRETURN DIVIDE ( x, 2.5 )`;
    const toks = tokenizeDax(src);
    expect(toks.map((t) => t.text).join('')).toBe(src);
    const kinds = (k: string) => toks.filter((t) => t.kind === k).map((t) => t.text);
    expect(kinds('function')).toEqual(['CALCULATE', 'DIVIDE']);
    expect(kinds('keyword')).toEqual(['VAR', 'RETURN']);
    expect(kinds('table')).toEqual(["'Manager''s Targets'"]);
    expect(kinds('column')).toEqual(['[Total Sales]', '[Region]']);
    expect(kinds('string')).toEqual(['"North"']);
    expect(kinds('comment')).toEqual(['// note']);
    expect(kinds('number')).toEqual(['2.5']);
  });

  it('treats a bare name before a bracket as a table and survives unterminated quotes', () => {
    const toks = tokenizeDax('SUM(Sales[Amount]) & "open');
    expect(toks.find((t) => t.text === 'Sales')!.kind).toBe('table');
    expect(toks.map((t) => t.text).join('')).toBe('SUM(Sales[Amount]) & "open');
    expect(tokenizeDax('[Sales [Prior Year]]]').map((t) => t.kind)).toEqual(['column']);
  });
});
