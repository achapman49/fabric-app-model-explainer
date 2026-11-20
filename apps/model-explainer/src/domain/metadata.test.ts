import { errorResult, MockModelClient, tableResult } from '@x10/shared/connectors';
import { FIXED_NOW } from '@x10/shared/test';

import { financeModel, loadMock, operationsModel } from '../test/fixtures';
import { expressionsHidden, hiddenObjectCount, isNumericMeasure, loadMetadata, metadataQueries } from './metadata';
import type { MeasureInfo } from './types';

describe('loadMetadata', () => {
  it('falls back from INFO.* to INFO.VIEW.* for every section (as on the real tenant)', async () => {
    const meta = await loadMock();
    for (const k of ['tables', 'columns', 'measures', 'relationships'] as const) {
      expect(meta.sections[k]).toEqual({ ok: true, source: 'INFO.VIEW' });
    }
    expect(meta.modelLabel).toBe('Sample Sales Model');
    expect(meta.tables).toHaveLength(9);
    expect(meta.measures).toHaveLength(14);
    expect(meta.relationships).toHaveLength(8);
    expect(meta.loadedAt).toBe(FIXED_NOW.toISOString());
  });

  it('excludes RowNumber columns and counts columns and measures per table', async () => {
    const meta = await loadMock();
    expect(meta.columns.some((c) => c.name.startsWith('RowNumber'))).toBe(false);
    const survey = meta.tables.find((t) => t.name === 'Store Survey')!;
    expect(survey.columnCount).toBe(42);
    const targets = meta.tables.find((t) => t.name === "Manager's Targets")!;
    expect(targets.measureCount).toBe(3);
    expect(targets.columnCount).toBe(4);
  });

  it('uses INFO.* when it works and never asks for INFO.VIEW', async () => {
    const client = new MockModelClient((q) => {
      if (q === 'EVALUATE INFO.TABLES()') return tableResult(['[ID]', '[Name]', '[IsHidden]'], [[1, 'Sales', false]]);
      if (q === 'EVALUATE INFO.COLUMNS()') return tableResult(['[ID]', '[TableID]', '[ExplicitName]', '[ExplicitDataType]', '[Type]'], [[5, 1, 'Amount', 10, 1]]);
      if (q === 'EVALUATE INFO.MEASURES()') return tableResult(['[TableID]', '[Name]', '[Expression]'], [[1, 'Total', 'SUM(Sales[Amount])']]);
      if (q === 'EVALUATE INFO.RELATIONSHIPS()') return tableResult(['[FromTableID]', '[FromColumnID]', '[ToTableID]', '[ToColumnID]'], []);
      return errorResult('query', 'unexpected');
    });
    const meta = await loadMetadata(client);
    expect(Object.values(meta.sections).every((s) => s.ok && s.source === 'INFO')).toBe(true);
    expect(client.calls.some((q) => q.includes('INFO.VIEW'))).toBe(false);
    expect(meta.tables[0]).toMatchObject({ name: 'Sales', columnCount: 1, measureCount: 1 });
    expect(meta.columns[0]).toMatchObject({ table: 'Sales', name: 'Amount', dataType: 'Decimal' });
  });

  it('marks a section unavailable with the last error and keeps the others', async () => {
    const meta = await loadMock(financeModel);
    expect(meta.sections.tables.ok).toBe(true);
    expect(meta.sections.columns.ok).toBe(true);
    const m = meta.sections.measures;
    expect(m.ok).toBe(false);
    if (!m.ok) {
      expect(m.error.category).toBe('api');
      expect(m.error.message).toMatch(/cannot read measures/);
      expect(m.attempts).toEqual(metadataQueries('measures').map((q) => q.query));
    }
    expect(meta.tables[0].measureCount).toBeNull();
    expect(meta.tables[0].columnCount).toBeGreaterThan(0);
  });

  it('treats a thrown or unparseable answer as a failed attempt', async () => {
    const client = new MockModelClient((q) => {
      if (q.includes('TABLES')) return tableResult(['[Oops]'], [[1]]);
      throw new Error('socket closed');
    });
    const meta = await loadMetadata(client);
    const t = meta.sections.tables;
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.error).toEqual({ category: 'parse', message: 'The result has no name column.' });
    const c = meta.sections.columns;
    if (!c.ok) expect(c.error).toEqual({ category: 'unknown', message: 'socket closed' });
  });

  it('loads a 40+ table model without measures', async () => {
    const meta = await loadMock(operationsModel);
    expect(meta.tables.length).toBeGreaterThan(40);
    expect(meta.measures).toEqual([]);
    expect(meta.sections.measures.ok).toBe(true);
  });
});

describe('helpers', () => {
  const m = (over: Partial<MeasureInfo>): MeasureInfo => ({
    table: 'T',
    name: 'M',
    expression: 'SUM(T[x])',
    formatString: '',
    description: '',
    displayFolder: '',
    isHidden: false,
    dataType: null,
    ...over,
  });

  it('decides numeric measures from the data type, else the expression', () => {
    for (const dt of ['Number', 'Currency', 'Integer', 'Decimal', 'Double', 'Int64']) expect(isNumericMeasure(m({ dataType: dt }))).toBe(true);
    expect(isNumericMeasure(m({ dataType: 'Text' }))).toBe(false);
    expect(isNumericMeasure(m({ dataType: null, expression: 'FORMAT([Sales], "0")' }))).toBe(false);
    expect(isNumericMeasure(m({ dataType: null, expression: 'SUM(T[x])' }))).toBe(true);
    expect(isNumericMeasure(m({ dataType: 'Variant', expression: '"label"' }))).toBe(false);
  });

  it('counts hidden objects', async () => {
    const meta = await loadMock();
    // 1 hidden table, 12 hidden columns (+ none for RowNumber), 1 hidden measure.
    expect(hiddenObjectCount(meta)).toBe(1 + meta.columns.filter((c) => c.isHidden).length + 1);
  });

  it('detects models that do not expose measure DAX', async () => {
    const meta = await loadMock();
    expect(expressionsHidden(meta)).toBe(false);
    const stripped = { ...meta, measures: meta.measures.map((x) => ({ ...x, expression: null })) };
    expect(expressionsHidden(stripped)).toBe(true);
    expect(expressionsHidden({ ...meta, measures: [] })).toBe(false);
  });
});
