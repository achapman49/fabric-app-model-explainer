import { tableResult, type ModelTable } from '@x10/shared/connectors';

import {
  bareColumnName,
  cardinalityOf,
  dataTypeName,
  emptyLookups,
  normalizeColumnName,
  parseColumns,
  parseMeasures,
  parseRelationships,
  parseTables,
} from './parse';

const t = (cols: string[], rows: unknown[][]): ModelTable => (tableResult(cols, rows) as { table: ModelTable }).table;

describe('normalizeColumnName', () => {
  it('strips brackets, table prefixes and case', () => {
    expect(normalizeColumnName('[Name]')).toBe('name');
    expect(normalizeColumnName('INFO.VIEW.TABLES[IsHidden]')).toBe('ishidden');
    expect(normalizeColumnName('Table')).toBe('table');
    expect(normalizeColumnName('[Size [cm]]]')).toBe('size [cm]');
  });
});

describe('INFO.VIEW shapes', () => {
  it('parses tables', () => {
    const tables = parseTables(
      t(['[ID]', '[Name]', '[Description]', '[IsHidden]', '[DataCategory]', '[StorageMode]'], [
        [1, 'Sales', 'Order lines', false, null, 'Import'],
        [2, "Manager's Targets", null, 'True', 'Time', 'DirectLake'],
      ]),
    );
    expect(tables).toEqual([
      { name: 'Sales', description: 'Order lines', isHidden: false, columnCount: null, measureCount: null, storageMode: 'Import', dataCategory: null },
      { name: "Manager's Targets", description: '', isHidden: true, columnCount: null, measureCount: null, storageMode: 'DirectLake', dataCategory: 'Time' },
    ]);
  });

  it('parses columns and drops RowNumber columns', () => {
    const cols = parseColumns(
      t(['[ID]', '[Name]', '[Table]', '[DataType]', '[DataCategory]', '[Description]', '[IsHidden]', '[Type]', '[FormatString]', '[DisplayFolder]'], [
        [10, 'RowNumber-2662979B17954F74', 'Sales', 'Integer', null, null, true, 'RowNumber', null, null],
        [11, 'Size [cm]', 'Product', 'Text', null, 'Frame size', false, 'Data', null, 'Specs'],
        [12, 'Line Margin', 'Sales', 'Currency', null, null, false, 'Calculated', '$#,0', null],
      ]),
    );
    expect(cols.map((c) => c.name)).toEqual(['Size [cm]', 'Line Margin']);
    expect(cols[0]).toMatchObject({ table: 'Product', dataType: 'Text', description: 'Frame size', displayFolder: 'Specs', kind: 'data', isHidden: false });
    expect(cols[1]).toMatchObject({ kind: 'calculated', formatString: '$#,0' });
  });

  it('parses measures, keeping a null expression as null', () => {
    const ms = parseMeasures(
      t(['[Name]', '[Table]', '[Expression]', '[FormatString]', '[Description]', '[DisplayFolder]', '[IsHidden]', '[DataType]'], [
        ['Total Sales', 'Sales', 'SUM(Sales[Amount])', '$#,0', 'Revenue', 'Sales', false, 'Currency'],
        ['Target Gap', "Manager's Targets", null, null, null, null, 'False', 'Number'],
      ]),
    );
    expect(ms[0]).toEqual({
      table: 'Sales',
      name: 'Total Sales',
      expression: 'SUM(Sales[Amount])',
      formatString: '$#,0',
      description: 'Revenue',
      displayFolder: 'Sales',
      isHidden: false,
      dataType: 'Currency',
    });
    expect(ms[1]).toMatchObject({ expression: null, formatString: '', isHidden: false, dataType: 'Number' });
  });

  it('parses relationships with text enums', () => {
    const rels = parseRelationships(
      t(['[Name]', '[IsActive]', '[CrossFilteringBehavior]', '[FromTable]', '[FromColumn]', '[FromCardinality]', '[ToTable]', '[ToColumn]', '[ToCardinality]'], [
        ['r1', true, 'BothDirections', 'Sales', 'Customer Key', 'Many', 'Customer', 'Customer Key', 'One'],
        ['r2', false, 'OneDirection', "Manager's Targets", 'Region', 'Many', 'Store', 'Region', 'Many'],
      ]),
    );
    expect(rels[0]).toEqual({
      name: 'r1',
      fromTable: 'Sales',
      fromColumn: 'Customer Key',
      toTable: 'Customer',
      toColumn: 'Customer Key',
      isActive: true,
      crossFilter: 'both',
      cardinality: 'many-to-one',
    });
    expect(rels[1]).toMatchObject({ isActive: false, crossFilter: 'single', cardinality: 'many-to-many' });
  });

  it('fails clearly when a required column is missing', () => {
    expect(() => parseTables(t(['[Description]'], [['x']]))).toThrow(/no name column/);
  });
});

describe('INFO.* shapes (ids and numeric enums)', () => {
  it('resolves table and column ids', () => {
    const lookups = emptyLookups();
    parseTables(t(['[ID]', '[Name]', '[IsHidden]'], [[1, 'Sales', 0], [2, 'Date', 0]]), lookups);
    const cols = parseColumns(
      t(['[ID]', '[TableID]', '[ExplicitName]', '[ExplicitDataType]', '[InferredDataType]', '[Type]', '[IsHidden]'], [
        [10, 1, 'RowNumber-1', 6, 6, 3, 1],
        [11, 1, 'Order Date', 1, 9, 1, 0],
        [12, 2, 'Date', 9, 9, 1, 0],
      ]),
      lookups,
    );
    expect(cols).toHaveLength(2);
    expect(cols[0]).toMatchObject({ table: 'Sales', name: 'Order Date', dataType: 'DateTime' });
    const ms = parseMeasures(t(['[TableID]', '[Name]', '[Expression]', '[DataType]'], [[1, 'Orders', 'COUNTROWS(Sales)', 6]]), lookups);
    expect(ms[0]).toMatchObject({ table: 'Sales', dataType: 'Int64' });
    const rels = parseRelationships(
      t(['[ID]', '[IsActive]', '[CrossFilteringBehavior]', '[FromTableID]', '[FromColumnID]', '[FromCardinality]', '[ToTableID]', '[ToColumnID]', '[ToCardinality]'], [
        [99, 1, 2, 1, 11, 2, 2, 12, 1],
      ]),
      lookups,
    );
    expect(rels[0]).toMatchObject({
      fromTable: 'Sales',
      fromColumn: 'Order Date',
      toTable: 'Date',
      toColumn: 'Date',
      crossFilter: 'both',
      cardinality: 'many-to-one',
      isActive: true,
    });
  });

  it('throws when ids cannot be resolved, so the loader falls back', () => {
    expect(() => parseMeasures(t(['[TableID]', '[Name]'], [[7, 'X']]))).toThrow(/could not be resolved/);
  });
});

describe('helpers', () => {
  it('maps data type enums', () => {
    expect(dataTypeName(2)).toBe('String');
    expect(dataTypeName('10')).toBe('Decimal');
    expect(dataTypeName('Currency')).toBe('Currency');
    expect(dataTypeName(null)).toBe('Unknown');
  });
  it('combines cardinalities', () => {
    expect(cardinalityOf('many', 'one')).toBe('many-to-one');
    expect(cardinalityOf('one', 'many')).toBe('one-to-many');
    expect(cardinalityOf('one', 'one')).toBe('one-to-one');
    expect(cardinalityOf('many', 'many')).toBe('many-to-many');
  });
  it('strips a table prefix only when it is the relationship table', () => {
    expect(bareColumnName("'Manager''s Targets'[Region]", "Manager's Targets")).toBe('Region');
    expect(bareColumnName('Sales[Amount]', 'Sales')).toBe('Amount');
    expect(bareColumnName('Size [cm]', 'Product')).toBe('Size [cm]');
  });
});
