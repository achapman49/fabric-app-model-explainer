import { expect, test } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

const RULES = [
  'measures-no-description',
  'tables-no-description',
  'measures-no-format',
  'bidirectional',
  'many-to-many',
  'inactive',
  'unfriendly-names',
  'wide-tables',
];

test('AC1: every finding rule fires on the mock model and the score is 52', async ({ page }) => {
  const c = watchConsole(page);
  await openApp(page, '/space-weather');
  await expect(page.getByRole('heading', { name: 'Health findings' })).toBeVisible();
  for (const r of RULES) await expect(page.getByTestId(`finding-${r}`)).toBeVisible();
  await expect(page.getByTestId('health-score')).toContainText('52');
  await expect(page.getByTestId('score-calculation')).toContainText('100 − 40 (4 warnings) − 8 (4 info) = 52');
  await expect(page.getByRole('heading', { name: 'Warnings (4)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Info (4)' })).toBeVisible();
  await assertNoHorizontalScroll(page);
  c.assertClean();
});

test("AC2: generated DAX escapes ' and ] and runs", async ({ page }) => {
  await openApp(page, '/probes');
  const prior = page.getByTestId('question-card').filter({ hasText: 'What is Sales [Prior Year] by Category?' });
  await prior.getByText('Show DAX').click();
  await expect(prior.getByTestId('question-dax')).toHaveText(
    `EVALUATE TOPN(20, SUMMARIZECOLUMNS('Product'[Category], "v", [Sales [Prior Year]]]), [v], DESC)`,
  );
  await prior.getByRole('button', { name: /^Run:/ }).click();
  await expect(prior.getByTestId('result-grid')).toBeVisible();

  const target = page.getByTestId('question-card').filter({ hasText: 'Region comes from Manager' });
  await target.getByText('Show DAX').click();
  await expect(target.getByTestId('question-dax')).toContainText(`'Manager''s Targets'[Region]`);
  await target.getByRole('button', { name: /^Run:/ }).click();
  await expect(target.getByTestId('result-grid')).toContainText('North');
});

test('AC3: the star chart draws every table with the right line styles and has a list', async ({ page }) => {
  const c = watchConsole(page);
  await openApp(page, '/star-chart');
  const diagram = page.getByTestId('relationship-diagram');
  await expect(diagram).toBeVisible();
  await expect(diagram.getByTestId('diagram-node')).toHaveCount(9);
  for (const name of ['Sales', 'Product', 'Customer', 'Date', 'Store', 'dim_Promo_TBL', "Manager's Targets", 'Store Survey', 'Currency Rates']) {
    await expect(diagram.locator(`[data-table="${name}"]`)).toHaveCount(1);
  }
  const edges = diagram.getByTestId('diagram-edge');
  await expect(edges).toHaveCount(8);
  const inactive = diagram.locator('[data-testid="diagram-edge"][data-active="false"]');
  await expect(inactive).toHaveCount(1);
  await expect(inactive).toHaveAttribute('stroke-dasharray', '7 5');
  const both = diagram.locator('[data-testid="diagram-edge"][data-crossfilter="both"]');
  await expect(both).toHaveCount(1);
  await expect(both).toHaveAttribute('marker-start', /url\(#/);
  await expect(both).toHaveAttribute('marker-end', /url\(#/);
  await expect(page.getByTestId('diagram-legend')).toContainText('Inactive (dashed)');
  await expect(page.getByTestId('diagram-legend')).toContainText('Both directions (double arrow)');

  // List alternative
  await expect(page.getByTestId('relationship-row')).toHaveCount(8);

  // Zoom changes the view box; selecting a table filters the list.
  const before = await diagram.getAttribute('viewBox');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  expect(await diagram.getAttribute('viewBox')).not.toBe(before);
  await diagram.locator('[data-table="Store"]').click();
  await expect(page.getByRole('heading', { name: 'Relationships of Store' })).toBeVisible();
  await expect(page.getByTestId('relationship-row')).toHaveCount(3);
  await assertNoHorizontalScroll(page);
  c.assertClean();
});

test('AC4: Copy as Markdown produces a complete one-pager', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openApp(page, '/mission-brief');
  await expect(page.getByTestId('one-pager')).toContainText('Sample Sales Model');
  await page.getByRole('button', { name: 'Copy as Markdown' }).click();
  await expect(page.getByRole('button', { name: /Copied/ })).toBeVisible();
  const md = await page.evaluate(() => navigator.clipboard.readText());
  expect(md).toMatch(/^# Sample Sales Model/);
  for (const part of ['## At a glance', '## Diagram', '```mermaid', '## Relationships', '## Measures', '#### Total Sales', '```dax', '## Health alerts', 'Score 52/100']) {
    expect(md).toContain(part);
  }
  expect(md.match(/^- \*\*(Warning|Info): /gm)).toHaveLength(8);
  await assertNoHorizontalScroll(page);
});

test('Tables: a row opens its columns and Count rows runs on demand', async ({ page }) => {
  await openApp(page, '/field-guide');
  await page.getByTestId('open-table').filter({ hasText: "Manager's Targets" }).click();
  const drawer = page.getByTestId('table-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('Target Amount');
  await drawer.getByTestId('count-rows').click();
  await expect(drawer.getByTestId('row-count')).toHaveText('60 rows');
});

test('Measures: search and filters for missing description and format string', async ({ page }) => {
  await openApp(page, '/field-guide?tab=measures');
  await expect(page.getByTestId('measure-count')).toHaveText('Showing 13 of 14 measures');
  await page.getByLabel('Missing format string').check();
  await expect(page.getByTestId('measure-count')).toHaveText('Showing 6 of 14 measures');
  await page.getByLabel('Missing description').check();
  await expect(page.getByTestId('measure-count')).toHaveText('Showing 3 of 14 measures');
  await page.getByLabel('Missing format string').uncheck();
  await page.getByLabel('Missing description').uncheck();
  await page.getByLabel('Search measures').fill('SAMEPERIODLASTYEAR');
  await expect(page.getByTestId('measure-row')).toHaveCount(1);
  await expect(page.getByTestId('measure-row')).toContainText('Sales [Prior Year]');
});

test('Model picker: a 40+ table model without measures, and a model with blocked metadata', async ({ page }) => {
  const c = watchConsole(page);
  await openApp(page, '/probes');
  const tryLink = page.locator('header a[href="#/probes"]').first();
  if (test.info().project.name === 'desktop') await expect(tryLink).toBeVisible();
  await page.getByTestId('model-picker').selectOption({ label: 'Sample Operations Model' });
  await expect(page.getByTestId('no-questions-reason')).toContainText('This model has no measures');
  await expect(tryLink).toBeHidden(); // no measures: the Probes tab is hidden
  await page.goto('/#/star-chart');
  await expect(page.getByTestId('relationship-diagram').getByTestId('diagram-node')).toHaveCount(43);

  await page.getByTestId('model-picker').selectOption({ label: 'Sample Finance Model' });
  await page.goto('/#/field-guide?tab=measures');
  await expect(page.getByTestId('unavailable-measures')).toContainText('not available for this model');
  await expect(page.getByTestId('unavailable-measures')).toContainText('api');
  // Other tabs keep working.
  await page.goto('/#/field-guide');
  await expect(page.getByTestId('tables-grid')).toContainText('GL Entries');
  await assertNoHorizontalScroll(page);
  c.assertClean();
});
