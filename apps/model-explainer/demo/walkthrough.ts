import type { DemoScript } from '@x10/shared/demo';

export const script: DemoScript = {
  title: 'Semantic Model Explainer: a semantic model as a solar system',
  persona: 'demo-admin',
  scenes: [
    {
      id: 'hook',
      say: [
        'This is Semantic Model Explainer, a Fabric App that draws a Power BI semantic model as a solar system.',
        'Fact tables are stars, dimensions are planets, measures are moons, and every relationship is a trail between them.',
      ],
      async run(h) {
        await h.goto('/');
        await h.page.getByTestId('orrery-canvas').waitFor();
        await h.pause(2500);
        await h.hover(h.page.locator('[data-testid="body-label"][data-body="Sales"]'));
        await h.pause(2500);
        await h.hover(h.page.locator('[data-testid="body-label"][data-body="Customer"]'));
        await h.pause(1500);
      },
    },
    {
      id: 'weather',
      say: ['The first lens is space weather: health findings show as flares on the tables, measures and relationships they affect.'],
      async run(h) {
        await h.spotlight(h.page.getByRole('radiogroup', { name: 'Lens' }), 1600);
        await h.pause(2200);
      },
    },
    {
      id: 'today',
      say: [
        'Today ranks what to fix first, and one click flies the camera to the relationship that filters both ways.',
        'The next item switches to the coverage lens: green moons are described and formatted, amber and red ones are not.',
      ],
      async run(h) {
        await h.click(h.page.getByRole('button', { name: /Sales → Customer filters both ways/ }));
        await h.pause(3500);
        await h.click(h.page.getByRole('button', { name: /6 measures have no description/ }));
        await h.pause(4000);
      },
    },
    {
      id: 'size',
      say: ['The size lens counts rows with one batched query, so the biggest tables are the biggest planets.'],
      async run(h) {
        await h.page.keyboard.press('Escape');
        await h.click(h.page.getByRole('radio', { name: /Size/ }));
        await h.pause(3500);
      },
    },
    {
      id: 'view-as',
      say: ['View as report author removes the hidden tables and measures, which is what people building reports actually see.'],
      async run(h) {
        await h.click(h.page.getByRole('radio', { name: /Author/ }));
        await h.pause(3000);
        await h.click(h.page.getByRole('radio', { name: /Modeller/ }));
        await h.pause(600);
      },
    },
    {
      id: 'fly-to',
      say: ['Fly to any table or measure by name; the card shows its description, format string and DAX.'],
      async run(h) {
        await h.click(h.page.getByRole('radio', { name: /Weather/ }));
        await h.type(h.page.getByTestId('fly-to'), 'Total Sales');
        await h.page.getByTestId('fly-to').press('Enter');
        await h.spotlight(h.page.getByTestId('focus-card'), 2500);
        await h.pause(1200);
      },
    },
    {
      id: 'field-guide',
      say: [
        'The field guide lists every table and measure, with the DAX highlighted and one click to copy it.',
        'Filter for the measures nobody has described yet, or open a table and count its rows on demand.',
      ],
      async run(h) {
        await h.goto('/field-guide?tab=measures');
        await h.pause(1500);
        await h.click(h.page.getByLabel('Missing description'));
        await h.spotlight(h.page.getByTestId('measure-count'), 1500);
        await h.click(h.page.getByRole('tab', { name: /Tables/ }));
        await h.click(h.page.getByTestId('open-table').filter({ hasText: "Manager's Targets" }));
        await h.pause(800);
        await h.click(h.page.getByTestId('count-rows'));
        await h.spotlight(h.page.getByTestId('row-count'), 1800);
        await h.click(h.page.getByRole('button', { name: 'Close' }));
      },
    },
    {
      id: 'space-weather',
      say: ['Space weather shows the eight rules and the score, with the arithmetic on the page: 100 minus 40 minus 8 is 52.'],
      async run(h) {
        await h.goto('/space-weather');
        await h.spotlight(h.page.getByTestId('score-calculation'), 2500);
        await h.scrollTo(h.page.getByTestId('finding-bidirectional'));
        await h.pause(1800);
      },
    },
    {
      id: 'big-model',
      say: ['A forty-three table model becomes four star systems and a belt of loose tables, and a shared dimension sits between the stars it connects.'],
      async run(h) {
        await h.goto('/');
        await h.page.getByTestId('orrery-canvas').waitFor();
        await h.select(h.page.getByTestId('model-picker'), 'Sample Operations Model');
        await h.pause(3000);
        await h.hover(h.page.locator('[data-testid="body-label"][data-body="Region"]'));
        await h.pause(2000);
      },
    },
    {
      id: 'star-chart',
      say: ['The star chart draws the same relationships flat, with arrows for filter direction, and it is the fallback when 3D is not available.'],
      async run(h) {
        await h.select(h.page.getByTestId('model-picker'), 'Sample Sales Model');
        await h.goto('/star-chart');
        await h.pause(1500);
        await h.click(h.page.getByTestId('relationship-diagram').locator('[data-table="Store"]'));
        await h.pause(2000);
      },
    },
    {
      id: 'mission-brief',
      say: ['The mission brief prints on one page, map included, or copies as Markdown for a wiki.'],
      async run(h) {
        await h.goto('/mission-brief');
        await h.pause(800);
        await h.click(h.page.getByRole('button', { name: 'Copy as Markdown' }));
        await h.scrollTo(h.page.getByTestId('system-schematic'));
        await h.pause(2000);
      },
    },
    {
      id: 'takeaway',
      say: ['Open a model, look at the sky, and you know what is in it and what to fix first.'],
      async run(h) {
        await h.goto('/');
        await h.pause(3000);
      },
    },
  ],
};
