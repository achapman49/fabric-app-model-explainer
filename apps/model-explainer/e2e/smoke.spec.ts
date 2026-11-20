import { expect, test } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

// A read-only data app has no records to create. The equivalent flow: load the model, run a sample question
// (which creates a result), and see its rows listed.
test('loads, runs a sample question, sees the result listed, no console errors', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/');
  await expect(page.getByTestId('model-name')).toHaveText('Sample Sales Model');
  await expect(page.getByTestId('health-score')).toContainText('52');
  await assertNoHorizontalScroll(page);

  await openApp(page, '/probes');
  await expect(page.getByRole('heading', { name: 'Sample questions' })).toBeVisible();
  const first = page.getByTestId('question-card').first();
  await expect(first.getByRole('heading', { name: 'What is Total Sales by Category?' })).toBeVisible();
  await first.getByRole('button', { name: /^Run:/ }).click();
  const grid = first.getByTestId('result-grid');
  await expect(grid).toBeVisible();
  await expect(grid.getByRole('row')).toHaveCount(5); // header + 4 categories
  await expect(grid).toContainText('Bikes');
  await assertNoHorizontalScroll(page);
  consoleWatch.assertClean();
});
