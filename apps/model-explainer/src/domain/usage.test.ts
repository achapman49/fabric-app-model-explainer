import { loadMock } from '../test/fixtures';
import { measureDependencies, measuresUsingColumn, measuresUsingMeasure, refersToColumn, refersToMeasure } from './usage';

describe('column references', () => {
  it('matches quoted and bare table names, with doubled quotes and brackets', () => {
    expect(refersToColumn("SUM ( 'Sales'[Sales Amount] )", 'Sales', 'Sales Amount')).toBe(true);
    expect(refersToColumn('SUM ( Sales[Sales Amount] )', 'Sales', 'Sales Amount')).toBe(true);
    expect(refersToColumn("SUM ( 'Manager''s Targets'[Target Amount] )", "Manager's Targets", 'Target Amount')).toBe(true);
    expect(refersToColumn("MAX ( 'Product'[Size [cm]]] )", 'Product', 'Size [cm]')).toBe(true);
    expect(refersToColumn("SUM ( 'Sales'[Sales Amount] )", 'Sales', 'Sales')).toBe(false);
    expect(refersToColumn('SUM ( OtherSales[Sales Amount] )', 'Sales', 'Sales Amount')).toBe(false);
    expect(refersToColumn('[Sales Amount]', 'Sales', 'Sales Amount')).toBe(false);
  });
});

describe('measure references', () => {
  it('counts unqualified brackets only', () => {
    expect(refersToMeasure('[Total Sales] - [Total Cost]', 'Total Sales')).toBe(true);
    expect(refersToMeasure('DIVIDE ( [Gross Margin], [Total Sales] )', 'Total Sales')).toBe(true);
    expect(refersToMeasure("SUM ( 'Sales'[Total Sales] )", 'Total Sales')).toBe(false);
    expect(refersToMeasure('SUM ( Sales [Total Sales] )', 'Total Sales')).toBe(false);
    expect(refersToMeasure(null, 'Total Sales')).toBe(false);
  });

  it('finds what a measure uses and what uses it in the sample model', async () => {
    const meta = await loadMock();
    const m = (name: string) => meta.measures.find((x) => x.name === name)!;
    expect(measureDependencies(meta, m('Gross Margin')).map((x) => x.name).sort()).toEqual(['Total Cost', 'Total Sales']);
    expect(measuresUsingMeasure(meta, m('Gross Margin')).map((x) => x.name)).toEqual(['Margin %']);
    expect(measuresUsingColumn(meta, 'Sales', 'Quantity').map((x) => x.name).sort()).toEqual(expect.arrayContaining(['Units Sold']));
  });
});
