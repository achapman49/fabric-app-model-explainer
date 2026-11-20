import { countRowsQuery, daxBracket, daxColumn, daxTable, quotedNames, quotesBalanced, topByQuery } from './dax';

describe('acceptance 2: generated DAX is valid for names containing quote and bracket characters', () => {
  it('quotes table names, doubling apostrophes', () => {
    expect(daxTable('Sales')).toBe("'Sales'");
    expect(daxTable('Sales Order')).toBe("'Sales Order'");
    expect(daxTable("Manager's Targets")).toBe("'Manager''s Targets'");
    expect(daxTable("a''b")).toBe("'a''''b'");
  });

  it('brackets column and measure names, doubling closing brackets', () => {
    expect(daxBracket('Total Sales')).toBe('[Total Sales]');
    expect(daxBracket('Sales [Prior Year]')).toBe('[Sales [Prior Year]]]');
    expect(daxBracket('a]]b')).toBe('[a]]]]b]');
    expect(daxColumn("Manager's Targets", 'Size [cm]')).toBe("'Manager''s Targets'[Size [cm]]]");
  });

  it('builds the Count rows query', () => {
    expect(countRowsQuery('Sales')).toBe(`EVALUATE ROW("n", COUNTROWS('Sales'))`);
    expect(countRowsQuery("Manager's Targets")).toBe(`EVALUATE ROW("n", COUNTROWS('Manager''s Targets'))`);
  });

  it('builds the Try it query', () => {
    expect(topByQuery('Product', 'Category', 'Total Sales')).toBe(
      `EVALUATE TOPN(20, SUMMARIZECOLUMNS('Product'[Category], "v", [Total Sales]), [v], DESC)`,
    );
    expect(topByQuery("Manager's Targets", 'Size [cm]', 'Sales [Prior Year]', 5)).toBe(
      `EVALUATE TOPN(5, SUMMARIZECOLUMNS('Manager''s Targets'[Size [cm]]], "v", [Sales [Prior Year]]]), [v], DESC)`,
    );
  });

  it('round-trips awkward names through the quoting', () => {
    const names = ["O'Brien's", "It''s", 'x]y', ']]', 'Size [cm]', 'plain', "both ' and ]"];
    for (const t of names) {
      for (const c of names) {
        const q = topByQuery(t, c, c);
        expect(quotesBalanced(q)).toBe(true);
        const parts = quotedNames(q);
        expect(parts[0]).toEqual({ kind: 'table', value: t });
        expect(parts[1]).toEqual({ kind: 'bracket', value: c });
        expect(parts[2]).toEqual({ kind: 'string', value: 'v' });
        expect(parts[3]).toEqual({ kind: 'bracket', value: c });
        expect(parts[4]).toEqual({ kind: 'bracket', value: 'v' });
      }
      expect(quotesBalanced(countRowsQuery(t))).toBe(true);
    }
  });

  it('detects unbalanced quoting', () => {
    expect(quotesBalanced("EVALUATE 'Sales")).toBe(false);
    expect(quotesBalanced('EVALUATE [x')).toBe(false);
    expect(quotesBalanced('EVALUATE x]')).toBe(false);
    expect(quotesBalanced(`EVALUATE '${"O'Brien"}'`)).toBe(false);
  });
});
