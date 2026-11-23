/**
 * A static, printable map of the model for the Summary: every table as a labelled box, every relationship as a line
 * with an arrowhead at the filtered end (dashed when inactive). Fact tables are tinted. Layout from domain/diagram.ts.
 */
import { useId, useMemo } from 'react';

import { layoutDiagram } from '../domain/diagram';
import type { TableRole } from '../domain/model';
import type { ModelMetadata } from '../domain/types';

export function ModelMap({ meta, roles, className }: { meta: ModelMetadata; roles: Map<string, TableRole>; className?: string }) {
  const layout = useMemo(
    () => layoutDiagram(meta.tables.map((t) => ({ name: t.name, isHidden: t.isHidden })), meta.relationships),
    [meta.tables, meta.relationships],
  );
  const arrow = `map-arrow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const facts = [...roles.values()].filter((r) => r === 'fact').length;

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label={`Map of the model: ${layout.nodes.length} tables (${facts} fact) and ${layout.edges.length} relationships.`}
      className={className}
      data-testid="model-map"
    >
      <defs>
        <marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--gray-9)' }} />
        </marker>
      </defs>
      {layout.edges.map((e) => (
        <path
          key={e.id}
          d={e.path}
          fill="none"
          style={{ stroke: 'var(--gray-9)' }}
          strokeWidth={1.5}
          strokeDasharray={e.dashed ? '7 5' : undefined}
          markerStart={e.arrowStart ? `url(#${arrow})` : undefined}
          markerEnd={e.arrowEnd ? `url(#${arrow})` : undefined}
        />
      ))}
      {layout.nodes.map((n) => {
        const fact = roles.get(n.id) === 'fact';
        return (
          <g key={n.id} transform={`translate(${n.x - n.w / 2},${n.y - n.h / 2})`}>
            <rect
              width={n.w}
              height={n.h}
              rx={8}
              style={{ fill: fact ? 'var(--accent-3)' : 'var(--surface)', stroke: fact ? 'var(--accent-9)' : 'var(--line-strong)' }}
              strokeWidth={fact ? 1.5 : 1}
              strokeDasharray={n.hidden ? '4 3' : undefined}
            />
            <text
              x={n.w / 2}
              y={n.h / 2 + 4.5}
              textAnchor="middle"
              fontSize={13}
              fontWeight={fact ? 650 : 500}
              fontStyle={n.hidden ? 'italic' : undefined}
              style={{ fill: n.hidden ? 'var(--muted)' : 'var(--text)' }}
            >
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
