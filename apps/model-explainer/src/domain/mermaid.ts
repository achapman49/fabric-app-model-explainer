/**
 * The model as a Mermaid flowchart for the Markdown summary (GitHub, Azure DevOps and most wikis render it): one node per
 * table, fact tables in bold, one arrow per relationship pointing the way filters flow, dotted when inactive,
 * double-headed when it filters both ways, labelled with the key column.
 */
import { allTableNames } from './metadata';
import { tableRoles } from './model';
import { flowOf } from './schema';
import type { ModelMetadata } from './types';

/** Text inside a quoted Mermaid label: double quotes become an entity, everything else is safe in quotes. */
const label = (s: string) => `"${s.replace(/"/g, '#quot;')}"`;

/** Null when there is nothing to draw (no tables, or relationships could not be read). */
export function mermaidDiagram(meta: ModelMetadata): string | null {
  if (!meta.sections.relationships.ok) return null;
  const names = [...allTableNames(meta)].sort((a, b) => a.localeCompare(b));
  if (!names.length) return null;
  const id = new Map(names.map((n, i) => [n, `t${i}`]));
  const roles = tableRoles(meta);

  const lines = ['flowchart LR'];
  for (const n of names) lines.push(`  ${id.get(n)}[${label(n)}]`);
  for (const r of meta.relationships) {
    const a = id.get(r.fromTable);
    const b = id.get(r.toTable);
    if (!a || !b) continue;
    const flow = flowOf(r);
    const text = label(r.fromColumn === r.toColumn ? r.fromColumn : `${r.fromColumn} = ${r.toColumn}`);
    const [src, dst] = flow === 'backward' ? [b, a] : [a, b];
    const arrow = flow === 'both' ? (r.isActive ? '<-->' : '<-.->') : r.isActive ? '-->' : '-.->';
    lines.push(`  ${src} ${arrow}|${text}| ${dst}`);
  }
  const facts = names.filter((n) => roles.get(n) === 'fact').map((n) => id.get(n)!);
  if (facts.length) {
    lines.push('  classDef fact stroke-width:3px,font-weight:bold');
    lines.push(`  class ${facts.join(',')} fact`);
  }
  return lines.join('\n');
}
