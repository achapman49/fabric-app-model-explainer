import { test, type Locator } from '@playwright/test';

import type { DemoHelpers } from '@x10/shared/demo';
import { watchConsole } from '@x10/shared/e2e';

import { script } from '../demo/walkthrough';

// Dry run of the narrated walkthrough with instant helpers, so every locator it uses is known to resolve.
test('walkthrough scenes run against the demo app', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'The recorder runs at desktop size.');
  test.setTimeout(120_000);
  const c = watchConsole(page);
  const loc = (t: Locator | string) => (typeof t === 'string' ? page.locator(t) : t);
  let first = true;
  const h: DemoHelpers = {
    page,
    async goto(path, persona) {
      const q = first && persona ? `?as=${encodeURIComponent(persona)}` : '';
      first = false;
      await page.goto(`/${q}#${path}`);
      await page.getByTestId('demo-banner').waitFor();
    },
    click: (t) => loc(t).click({ timeout: 5000 }),
    type: (t, text) => loc(t).fill(text, { timeout: 5000 }),
    fill: (t, text) => loc(t).fill(text, { timeout: 5000 }),
    async select(t, label) {
      await loc(t).selectOption({ label }, { timeout: 5000 });
    },
    hover: (t) => loc(t).hover({ timeout: 5000 }),
    scrollTo: (t) => loc(t).scrollIntoViewIfNeeded({ timeout: 5000 }),
    async spotlight(t) {
      await loc(t).waitFor({ state: 'visible', timeout: 5000 });
    },
    pause: async () => {},
  };
  for (const scene of script.scenes) {
    await test.step(scene.id, () => scene.run(h));
  }
  c.assertClean();
});
