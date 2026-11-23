import { financeModel, loadMock, operationsModel } from '../test/fixtures';
import { buildChecklist, healthIndicators, progress } from './checklist';
import { evaluateHealth } from './findings';
import { parseObjectId } from './model';

describe('health checklist', () => {
  it('has one group per finding, warnings first, and one item per flagged object', async () => {
    const meta = await loadMock();
    const report = evaluateHealth(meta);
    const groups = buildChecklist(meta, report);
    expect(groups.map((g) => g.rule)).toEqual(report.findings.map((f) => f.rule));
    expect(groups.slice(0, report.warnings).every((g) => g.severity === 'warning')).toBe(true);
    for (const g of groups) {
      const f = report.findings.find((x) => x.rule === g.rule)!;
      expect(g.items, g.rule).toHaveLength(f.objects.length);
    }
  });

  it('gives every item a unique id and a target the diagram can open', async () => {
    const meta = await loadMock();
    const items = buildChecklist(meta, evaluateHealth(meta)).flatMap((g) => g.items);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const i of items) expect(parseObjectId(i.target), i.id).not.toBeNull();
  });

  it('words items as actions on the right objects', async () => {
    const meta = await loadMock();
    const groups = buildChecklist(meta, evaluateHealth(meta));
    const g = (rule: string) => groups.find((x) => x.rule === rule)!.items;
    expect(g('measures-no-format').map((i) => i.action)).toContain('Set a format string on Gross Margin');
    expect(g('tables-no-description')[0]).toMatchObject({ action: 'Describe the dim_Promo_TBL table', target: 't:dim_Promo_TBL' });
    expect(g('bidirectional')[0].action).toBe('Make Sales → Customer filter one way');
    expect(g('bidirectional')[0].target).toMatch(/^r:\d+$/);
    expect(g('unfriendly-names').map((i) => i.target)).toContain('c:dim_Promo_TBL|PROMO_NAME');
  });

  it('counts progress over current items only', async () => {
    const meta = await loadMock();
    const groups = buildChecklist(meta, evaluateHealth(meta));
    const first = groups[0].items[0].id;
    expect(progress(groups, new Set([first, 'measures-no-format|m:Sales|Fixed long ago']))).toEqual({ done: 1, total: groups.flatMap((x) => x.items).length });
  });

  it('is empty when nothing fires', async () => {
    const meta = await loadMock(operationsModel);
    const report = evaluateHealth(meta);
    const groups = buildChecklist(meta, report);
    expect(groups).toHaveLength(report.findings.length);
    expect(groups.every((x) => x.severity === 'info')).toBe(true);
  });
});

describe('health indicators', () => {
  it('summarises the sales model with statuses that match its rules', async () => {
    const meta = await loadMock();
    const byId = new Map(healthIndicators(meta, evaluateHealth(meta)).map((i) => [i.id, i]));
    expect(byId.get('score')).toMatchObject({ value: '52', status: 'bad' });
    expect(byId.get('measures-described')).toMatchObject({ value: '54%', unit: '7 of 13', status: 'bad' });
    expect(byId.get('tables-described')!.status).toBe('warn');
    expect(byId.get('relationship-risks')).toMatchObject({ value: '2', status: 'bad', hint: '1 filter both ways · 1 many-to-many' });
    expect(byId.get('inactive')).toMatchObject({ value: '1', status: 'warn' });
    expect(byId.get('wide-tables')).toMatchObject({ value: '1', status: 'warn' });
    for (const i of byId.values()) if (i.ratio !== null) expect(i.ratio).toBeGreaterThanOrEqual(0);
  });

  it('says n/a and not checked when metadata is blocked', async () => {
    const meta = await loadMock(financeModel);
    const byId = new Map(healthIndicators(meta, evaluateHealth(meta)).map((i) => [i.id, i]));
    expect(byId.get('measures-described')).toMatchObject({ value: 'n/a', status: 'unknown', ratio: null });
    expect(byId.get('relationship-risks')).toMatchObject({ value: 'n/a', status: 'unknown' });
    expect(byId.get('tables-described')!.status).not.toBe('unknown');
  });
});
