import { financeModel, loadMock } from '../test/fixtures';
import { mermaidDiagram } from './mermaid';

describe('Mermaid diagram', () => {
  it('draws every table and points each relationship the way filters flow', async () => {
    const meta = await loadMock();
    const md = mermaidDiagram(meta)!;
    const lines = md.split('\n');
    expect(lines[0]).toBe('flowchart LR');
    const node = (name: string) => lines.find((l) => l.endsWith(`["${name}"]`))!.trim().split('[')[0];
    for (const t of ['Sales', 'Customer', "Manager's Targets", 'Currency Rates']) expect(node(t)).toMatch(/^t\d+$/);
    // Product filters Sales (one side to many side).
    expect(md).toContain(`${node('Product')} -->|"Product Key"| ${node('Sales')}`);
    // Both ways, and inactive is dotted.
    expect(md).toContain(`${node('Sales')} <-->|"Customer Key"| ${node('Customer')}`);
    expect(md).toContain(`${node('Date')} -.->|"Ship Date = Date"| ${node('Sales')}`);
    expect(md).toContain(`class ${node('Sales')} fact`);
    expect(lines.filter((l) => /-->|-\.->|<-->/.test(l))).toHaveLength(meta.relationships.length);
  });

  it('escapes double quotes in names and gives up when relationships are blocked', async () => {
    const meta = await loadMock();
    meta.tables[0] = { ...meta.tables[0], name: 'The "Big" Table' };
    expect(mermaidDiagram(meta)).toContain('["The #quot;Big#quot; Table"]');
    expect(mermaidDiagram(await loadMock(financeModel))).toBeNull();
  });
});
