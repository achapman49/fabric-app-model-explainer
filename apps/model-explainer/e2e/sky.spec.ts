import { expect, test, type Page } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

const isPhone = () => test.info().project.name === 'phone';

/** Pick a Today item: in the side panel on desktop, in the bottom sheet on phones. */
async function openToday(page: Page) {
  if (isPhone()) await page.getByRole('button', { name: /^Today/ }).click();
}

test('the sky renders the model as a solar system', async ({ page }) => {
  const c = watchConsole(page);
  await openApp(page, '/');
  const sky = page.getByTestId('orrery');
  await expect(sky).toHaveAttribute('data-mode', 'webgl');
  await expect(page.getByTestId('orrery-canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('body-label')).toHaveCount(9);
  await expect(page.locator('[data-testid="body-label"][data-kind="sun"]')).toHaveAttribute('data-body', 'Sales');
  await expect(page.getByTestId('model-name')).toHaveText('Sample Sales Model');
  await expect(page.getByTestId('health-score')).toHaveText('52');
  await assertNoHorizontalScroll(page);
  c.assertClean();
});

test('lenses re-paint the sky, by click and by number key', async ({ page }) => {
  await openApp(page, '/');
  const sky = page.getByTestId('orrery');
  await expect(sky).toHaveAttribute('data-lens', 'weather');
  await page.getByRole('radio', { name: /Size/ }).click();
  await expect(sky).toHaveAttribute('data-lens', 'size');
  // The Size lens weighs every table: the labels show row counts.
  await expect(page.locator('[data-body="Sales"] .orrery-label-cap')).toHaveText('1.3M rows');
  await page.keyboard.press('4');
  await expect(sky).toHaveAttribute('data-lens', 'coverage');
  await expect(page.locator('[data-body="Sales"] .orrery-label-cap')).toHaveText('4 of 11 complete');
});

test('a Today item flies to the object behind it and switches lens', async ({ page }) => {
  await openApp(page, '/');
  await openToday(page);
  await page.getByRole('button', { name: /Sales → Customer filters both ways/ }).click();
  const sky = page.getByTestId('orrery');
  await expect(sky).toHaveAttribute('data-focus', /^r:\d+$/);
  await expect(page.getByTestId('focus-card')).toContainText('Both directions');
  await openToday(page);
  await page.getByRole('button', { name: /6 measures have no description/ }).click();
  await expect(sky).toHaveAttribute('data-focus', 't:Sales');
  await expect(sky).toHaveAttribute('data-lens', 'coverage');
  await expect(page.getByTestId('focus-card')).toContainText('Star · fact table');
  // Moons of the focused table get labels.
  await expect(page.getByTestId('moon-label')).toHaveCount(11);
  await page.keyboard.press('Escape');
  await expect(sky).toHaveAttribute('data-focus', '');
});

test('fly to a measure by name, and click a body label', async ({ page }) => {
  await openApp(page, '/');
  await page.getByTestId('fly-to').fill('Total Sales');
  await page.getByTestId('fly-to').press('Enter');
  await expect(page.getByTestId('orrery')).toHaveAttribute('data-focus', 'm:Sales|Total Sales');
  await expect(page.getByTestId('focus-card')).toContainText('Moon · measure on');
  await page.keyboard.press('Escape');
  await page.locator('[data-testid="body-label"][data-body="Customer"]').click();
  await expect(page.getByTestId('orrery')).toHaveAttribute('data-focus', 't:Customer');
});

test('the list view holds the same data, and view as report author drops hidden objects', async ({ page }) => {
  await openApp(page, '/');
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.getByTestId('system-row')).toHaveCount(9);
  await expect(page.getByTestId('system-list')).toContainText('Currency Rates');
  await page.getByRole('radio', { name: /Author/ }).click();
  await expect(page.getByTestId('system-row')).toHaveCount(8);
  await expect(page.getByTestId('system-list')).not.toContainText('Currency Rates');
  await page.getByRole('button', { name: 'Show Store in the sky' }).click();
  await expect(page.getByTestId('orrery')).toHaveAttribute('data-focus', 't:Store');
  await assertNoHorizontalScroll(page);
});

test('without WebGL the sky falls back to the star chart', async ({ page }) => {
  const c = watchConsole(page);
  await page.goto('/?nowebgl#/');
  await expect(page.getByTestId('orrery')).toHaveAttribute('data-mode', 'chart');
  await expect(page.getByTestId('nowebgl-note')).toBeVisible();
  const chart = page.getByTestId('relationship-diagram');
  await expect(chart.getByTestId('diagram-node')).toHaveCount(9);
  await chart.locator('[data-table="Store"]').click();
  await expect(page.getByTestId('orrery')).toHaveAttribute('data-focus', 't:Store');
  await page.getByRole('radio', { name: /Hidden/ }).click();
  await expect(page.getByTestId('orrery')).toHaveAttribute('data-lens', 'hidden');
  await assertNoHorizontalScroll(page);
  c.assertClean();
});

test('the 43-table model draws four star systems and a belt', async ({ page }) => {
  await openApp(page, '/');
  await page.getByTestId('model-picker').selectOption({ label: 'Sample Operations Model' });
  await expect(page.getByTestId('model-name')).toHaveText('Sample Operations Model');
  await expect(page.getByTestId('body-label')).toHaveCount(43);
  await expect(page.locator('[data-testid="body-label"][data-kind="sun"]')).toHaveCount(5);
  await expect(page.getByText('4 star systems · 8 loose tables')).toBeVisible();
});

test('keyboard shortcuts are listed behind ?', async ({ page }) => {
  test.skip(isPhone(), 'Keyboard cheat sheet is a desktop affordance.');
  await openApp(page, '/');
  await page.getByTestId('orrery-canvas').waitFor();
  await page.keyboard.press('Shift+?');
  await expect(page.getByTestId('shortcuts')).toContainText('Pause or resume the orbits');
});

test('earlier routes still open the renamed tools', async ({ page }) => {
  await openApp(page, '/relationships');
  await expect(page).toHaveURL(/#\/star-chart$/);
  await page.goto('/#/one-pager');
  await expect(page.getByTestId('one-pager')).toBeVisible();
});
