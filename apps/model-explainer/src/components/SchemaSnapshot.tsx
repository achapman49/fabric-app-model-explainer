/**
 * A static, printable drawing of the schema diagram for the Summary: the same layout as the home screen (cards with
 * keys, columns and measures; links between key rows), drawn as one SVG with no animation or interaction, so it scales
 * to the page and prints cleanly. On screen it keeps text readable by scrolling sideways instead of shrinking.
 */
import { useId, useMemo } from 'react';

import { BORDER, HEADER_H, layoutSchema, ROW_H, SECTION_H, type CardRow, type SchemaCard, type SchemaLink } from '../domain/schema';
import type { ModelMetadata } from '../domain/types';
import { typeLabel } from './SchemaDiagram';

/** On screen the drawing never shrinks below this scale; it scrolls instead. Print fits it to the page. */
const MIN_SCREEN_SCALE = 0.72;
const PAD_X = 12;
const NAME_CHARS = 27;

const clip = (s: string, n = NAME_CHARS) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function SchemaSnapshot({ meta }: { meta: ModelMetadata }) {
  const layout = useMemo(() => layoutSchema(meta), [meta]);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const arrow = `snap-arrow-${uid}`;
  if (!layout.cards.length) return null;

  return (
    <div className="x-snapshot overflow-x-auto">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={`Diagram of the model: ${layout.cards.length} tables and ${layout.links.length} relationships, with each table's keys, columns and measures.`}
        className="block h-auto w-full"
        style={{ minWidth: Math.round(layout.width * MIN_SCREEN_SCALE) }}
        data-testid="schema-snapshot"
      >
        <defs>
          <marker id={arrow} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,1 L10,5 L0,9 z" style={{ fill: 'var(--gray-10)' }} />
          </marker>
        </defs>
        {layout.labels.map((g) => (
          <text key={g.text} x={g.x} y={g.y + 12} fontSize={12} fontWeight={600} letterSpacing="0.04em" style={{ fill: 'var(--muted)' }}>
            {g.text.toUpperCase()}
          </text>
        ))}
        {layout.links.map((l) => (
          <Link key={l.index} link={l} marker={`url(#${arrow})`} />
        ))}
        {layout.cards.map((c) => (
          <Card key={c.name} card={c} />
        ))}
      </svg>
    </div>
  );
}

function Link({ link: l, marker }: { link: SchemaLink; marker: string }) {
  const toEnd = l.flow === 'forward' || l.flow === 'both';
  const toStart = l.flow === 'backward' || l.flow === 'both';
  const lab = (p: { x: number; y: number }, side: 1 | -1, text: string) => (
    <text x={p.x + side * 8} y={p.y - 6} textAnchor={side === 1 ? 'start' : 'end'} fontSize={11} fontWeight={600} className="font-mono" style={{ fill: 'var(--muted)' }}>
      {text}
    </text>
  );
  return (
    <g data-testid="snapshot-link">
      <path
        d={l.path}
        fill="none"
        style={{ stroke: 'var(--gray-10)' }}
        strokeWidth={1.5}
        strokeDasharray={l.rel.isActive ? undefined : '6 5'}
        markerEnd={toEnd ? marker : undefined}
        markerStart={toStart ? marker : undefined}
      />
      {lab(l.start, l.startSide, l.startCard)}
      {lab(l.end, l.endSide, l.endCard)}
    </g>
  );
}

/** A rectangle with only its top corners rounded (the card header). */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function Card({ card: c }: { card: SchemaCard }) {
  const fact = c.kind === 'fact';
  const top = c.y + BORDER;
  return (
    <g data-testid="snapshot-card" data-table={c.name}>
      <rect
        x={c.x}
        y={c.y}
        width={c.w}
        height={c.h}
        rx={10}
        style={{ fill: 'var(--surface)', stroke: fact ? 'var(--accent-9)' : 'var(--line-strong)' }}
        strokeWidth={fact ? 1.5 : 1}
        strokeDasharray={c.hidden ? '5 4' : undefined}
      />
      <path d={topRounded(c.x + 0.5, c.y + 0.5, c.w - 1, HEADER_H, 9.5)} style={{ fill: fact ? 'var(--accent-3)' : 'var(--surface-sunken)' }} />
      <line x1={c.x} x2={c.x + c.w} y1={top + HEADER_H} y2={top + HEADER_H} style={{ stroke: 'var(--line)' }} />
      <text
        x={c.x + PAD_X}
        y={top + HEADER_H / 2 + 4.5}
        fontSize={13}
        fontWeight={650}
        fontStyle={c.hidden ? 'italic' : undefined}
        style={{ fill: c.hidden ? 'var(--muted)' : 'var(--text)' }}
      >
        {clip(c.name, fact ? 22 : NAME_CHARS)}
      </text>
      {fact && (
        <g>
          <rect x={c.x + c.w - PAD_X - 38} y={top + HEADER_H / 2 - 8} width={38} height={16} rx={4} style={{ fill: 'var(--accent-9)' }} />
          <text x={c.x + c.w - PAD_X - 19} y={top + HEADER_H / 2 + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} letterSpacing="0.06em" style={{ fill: 'var(--accent-contrast)' }}>
            FACT
          </text>
        </g>
      )}
      {c.rows.map((r) => (
        <Row key={`${r.kind}:${r.top}`} row={r} card={c} />
      ))}
    </g>
  );
}

function Row({ row: r, card: c }: { row: CardRow; card: SchemaCard }) {
  const y = c.y + BORDER + r.top;
  const mid = y + ROW_H / 2 + 4;
  const x = c.x + PAD_X;
  switch (r.kind) {
    case 'section':
      return (
        <g>
          <line x1={c.x} x2={c.x + c.w} y1={y} y2={y} style={{ stroke: 'var(--line)' }} />
          <text x={x} y={y + SECTION_H / 2 + 3.5} fontSize={10} fontWeight={650} letterSpacing="0.05em" style={{ fill: 'var(--muted)' }}>
            {r.label.toUpperCase()}
          </text>
        </g>
      );
    case 'note':
      return (
        <text x={x} y={mid} fontSize={12} fontStyle="italic" style={{ fill: 'var(--muted)' }}>
          {r.text}
        </text>
      );
    case 'toggle':
      return r.more > 0 ? (
        <text x={x} y={mid} fontSize={11.5} style={{ fill: 'var(--muted)' }}>
          + {r.more} more (listed below)
        </text>
      ) : null;
    case 'measure': {
      const m = r.measure;
      return (
        <g>
          <text x={x} y={mid} fontSize={12.5} fontWeight={600} style={{ fill: 'var(--accent-11)' }}>
            Σ
          </text>
          <text x={x + 16} y={mid} fontSize={12.5} fontStyle={m.isHidden ? 'italic' : undefined} style={{ fill: m.isHidden ? 'var(--muted)' : 'var(--text)' }}>
            {clip(m.name)}
          </text>
        </g>
      );
    }
    case 'column': {
      const col = r.column;
      return (
        <g>
          {r.isKey ? (
            <g transform={`translate(${x + 5},${y + ROW_H / 2})`} aria-hidden="true">
              <circle r={3.2} cx={-1.5} fill="none" style={{ stroke: 'var(--warn-solid)' }} strokeWidth={1.6} />
              <line x1={1.7} x2={6.5} y1={0} y2={0} style={{ stroke: 'var(--warn-solid)' }} strokeWidth={1.6} />
            </g>
          ) : (
            <circle cx={x + 4} cy={y + ROW_H / 2} r={1.6} style={{ fill: 'var(--faint)' }} />
          )}
          <text
            x={x + 16}
            y={mid}
            fontSize={12.5}
            fontWeight={r.isKey ? 600 : undefined}
            fontStyle={col.isHidden ? 'italic' : undefined}
            style={{ fill: col.isHidden ? 'var(--muted)' : 'var(--text)' }}
          >
            {clip(col.name, 24)}
          </text>
          <text x={c.x + c.w - PAD_X} y={mid} textAnchor="end" fontSize={10.5} className="font-mono" style={{ fill: 'var(--faint)' }}>
            {typeLabel(col.dataType)}
          </text>
        </g>
      );
    }
  }
}
