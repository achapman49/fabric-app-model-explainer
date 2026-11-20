/**
 * The star chart: the model's relationship diagram drawn flat, as a chart of the sky. Hand-written SVG (layout in
 * domain/diagram.ts). It is the Star chart tool and the centrepiece when WebGL is not available.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Maximize2, Minus, Plus } from 'lucide-react';

import { cx, IconButton } from '@x10/shared/ui';

import { fitView, layoutDiagram, readableView, zoomView, type DiagramTable, type ViewBox } from '../domain/diagram';
import type { BodyKind } from '../domain/orrery';
import type { RelationshipInfo } from '../domain/types';

const ZOOM_STEP = 1.25;

export interface NodePaint {
  /** Body colour (CSS). */
  fill?: string;
  flare?: 'warn' | 'info' | null;
  ghost?: boolean;
}

export function StarChart({
  tables,
  relationships,
  selected,
  onSelect,
  kinds,
  paint,
  edgeStroke,
  fill,
  className,
}: {
  tables: DiagramTable[];
  relationships: RelationshipInfo[];
  selected: string | null;
  onSelect: (name: string | null) => void;
  /** Body kind per table (stars get the accent glyph). */
  kinds?: Map<string, BodyKind>;
  /** Lens colours per table. */
  paint?: (table: string) => NodePaint | undefined;
  /** Lens colour per relationship (by index in `relationships`). */
  edgeStroke?: (index: number) => string | undefined;
  /** Fill the parent (centrepiece fallback) instead of a fixed height with a toolbar above. */
  fill?: boolean;
  className?: string;
}) {
  const layout = useMemo(() => layoutDiagram(tables, relationships), [tables, relationships]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const aspect = size.width && size.height ? size.width / size.height : 16 / 9;
  const [view, setView] = useState<ViewBox>(() => fitView(layout, 16 / 9));
  const drag = useRef<{ x: number; y: number; view: ViewBox; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const arrowId = `arrow-${uid}`;
  const arrowHiId = `arrow-hi-${uid}`;
  const dotsId = `dots-${uid}`;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) setSize((s) => (s.width === r.width && s.height === r.height ? s : { width: r.width, height: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Over the stage, floating panels cover the edges: leave room around the drawing.
  const pad = useCallback((v: ViewBox): ViewBox => (fill && window.innerWidth >= 768 ? { x: v.x - v.w * 0.2, y: v.y - v.h * 0.24, w: v.w * 1.4, h: v.h * 1.48 } : v), [fill]);
  const fit = useCallback(() => setView(pad(fitView(layout, aspect))), [layout, aspect, pad]);
  useEffect(() => {
    setView(size.width ? pad(readableView(layout, size)) : fitView(layout, 16 / 9));
  }, [layout, size, pad]);

  const center = (v: ViewBox) => ({ x: v.x + v.w / 2, y: v.y + v.h / 2 });
  const zoom = (factor: number) => setView((v) => zoomView(v, factor, center(v), layout));
  const pan = (fx: number, fy: number) => setView((v) => ({ ...v, x: v.x + v.w * fx, y: v.y + v.h * fy }));

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      setView((v) => {
        const at = { x: v.x + ((e.clientX - r.left) / r.width) * v.w, y: v.y + ((e.clientY - r.top) / r.height) * v.h };
        return zoomView(v, e.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, at, layout);
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [layout]);

  // Keep the selected table in view.
  useEffect(() => {
    if (!selected) return;
    const n = layout.nodes.find((x) => x.id === selected);
    if (!n) return;
    setView((v) => (n.x > v.x + 40 && n.x < v.x + v.w - 40 && n.y > v.y + 30 && n.y < v.y + v.h - 30 ? v : { ...v, x: n.x - v.w / 2, y: n.y - v.h / 2 }));
  }, [selected, layout]);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    justDragged.current = false;
    drag.current = { x: e.clientX, y: e.clientY, view, moved: false };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) svgRef.current?.setPointerCapture(e.pointerId);
    d.moved = true;
    const r = svgRef.current!.getBoundingClientRect();
    setView({ ...d.view, x: d.view.x - (dx / r.width) * d.view.w, y: d.view.y - (dy / r.height) * d.view.h });
  };
  const endDrag = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      justDragged.current = true;
      svgRef.current?.releasePointerCapture?.(e.pointerId);
    }
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const map: Record<string, () => void> = {
      '+': () => zoom(1 / ZOOM_STEP),
      '=': () => zoom(1 / ZOOM_STEP),
      '-': () => zoom(ZOOM_STEP),
      '0': fit,
      ArrowLeft: () => pan(-0.15, 0),
      ArrowRight: () => pan(0.15, 0),
      ArrowUp: () => pan(0, -0.15),
      ArrowDown: () => pan(0, 0.15),
      Escape: () => onSelect(null),
    };
    const fn = map[e.key];
    if (fn && e.target === svgRef.current) {
      e.preventDefault();
      e.stopPropagation();
      fn();
    }
  };

  const neighbours = useMemo(() => {
    if (!selected) return null;
    const s = new Set([selected]);
    for (const r of relationships) {
      if (r.fromTable === selected) s.add(r.toTable);
      if (r.toTable === selected) s.add(r.fromTable);
    }
    return s;
  }, [selected, relationships]);

  // Orbit rings around the centre of every connected group (its first node is the hub of the radial layout).
  const hubs = useMemo(() => {
    const seen = new Set<number>();
    const out: { x: number; y: number; r: number }[] = [];
    for (const n of layout.nodes) {
      if (seen.has(n.component)) continue;
      seen.add(n.component);
      const members = layout.nodes.filter((m) => m.component === n.component);
      if (members.length < 2) continue;
      const r = Math.max(...members.map((m) => Math.hypot(m.x - n.x, (m.y - n.y) / 0.7)));
      out.push({ x: n.x, y: n.y, r });
    }
    return out;
  }, [layout]);

  const summary = `${layout.nodes.length} tables and ${layout.edges.length} relationships in ${layout.components} connected group${layout.components === 1 ? '' : 's'}.`;

  const tools: { label: string; icon: ReactNode; run: () => void; pan?: boolean }[] = [
    { label: 'Zoom in', icon: <Plus />, run: () => zoom(1 / ZOOM_STEP) },
    { label: 'Zoom out', icon: <Minus />, run: () => zoom(ZOOM_STEP) },
    { label: 'Fit to view', icon: <Maximize2 />, run: fit },
    { label: 'Pan left', icon: <ArrowLeft />, run: () => pan(-0.2, 0), pan: true },
    { label: 'Pan up', icon: <ArrowUp />, run: () => pan(0, -0.2), pan: true },
    { label: 'Pan down', icon: <ArrowDown />, run: () => pan(0, 0.2), pan: true },
    { label: 'Pan right', icon: <ArrowRight />, run: () => pan(0.2, 0), pan: true },
  ];
  const toolbar = (
    <div
      role="toolbar"
      aria-label="Star chart controls"
      className={cx('flex items-center gap-0.5', fill ? 'x-glass flex-col rounded-full! p-1' : 'flex-wrap')}
    >
      {tools
        .filter((t) => !fill || !t.pan)
        .map((t, i) => (
          <span key={t.label} className="contents">
            {!fill && i === 3 && <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" aria-hidden="true" />}
            <IconButton size="sm" label={t.label} icon={t.icon} onClick={t.run} className={t.pan ? 'hidden sm:inline-flex' : undefined} />
          </span>
        ))}
    </div>
  );

  return (
    <div className={cx(fill ? 'absolute inset-0' : '', className)}>
      {!fill && <div className="mb-2 flex flex-wrap items-center justify-between gap-2">{toolbar}<span className="hidden text-xs text-muted md:inline">Drag to pan · scroll to zoom · click a body</span></div>}
      <div
        ref={wrapRef}
        className={cx(
          'x-starchart overflow-hidden',
          fill ? 'absolute inset-y-0 left-0 w-[calc(100%-var(--side-w,0px))]' : 'relative h-[460px] rounded-xl border border-line md:h-[560px]',
        )}
      >
        <svg
          ref={svgRef}
          role="img"
          aria-label={`Star chart of the model. ${summary}`}
          tabIndex={0}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full cursor-grab touch-none select-none outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-inset"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKey}
          data-testid="relationship-diagram"
        >
          <defs>
            <marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--gray-9)' }} />
            </marker>
            <marker id={arrowHiId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--accent-10)' }} />
            </marker>
            <pattern id={dotsId} width="44" height="44" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="5" r="0.9" style={{ fill: 'var(--world-ink-muted)' }} opacity="0.35" />
              <circle cx="27" cy="31" r="0.6" style={{ fill: 'var(--world-ink-muted)' }} opacity="0.3" />
              <circle cx="35" cy="12" r="0.5" style={{ fill: 'var(--accent-9)' }} opacity="0.4" />
            </pattern>
          </defs>
          <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={`url(#${dotsId})`} />
          <g aria-hidden="true">
            {hubs.map((h, i) =>
              [0.36, 0.68, 1].map((k) => (
                <ellipse key={`${i}-${k}`} cx={h.x} cy={h.y} rx={h.r * k + 20} ry={(h.r * k + 20) * 0.7} fill="none" style={{ stroke: 'var(--world-ink-muted)' }} strokeOpacity={0.16} strokeDasharray={k === 1 ? '2 6' : undefined} />
              )),
            )}
          </g>
          <g>
            {layout.edges.map((e) => {
              const index = relationships.indexOf(e.rel);
              const hi = !!selected && (e.rel.fromTable === selected || e.rel.toTable === selected);
              const dim = !!selected && !hi;
              const lens = edgeStroke?.(index);
              const marker = `url(#${hi ? arrowHiId : arrowId})`;
              return (
                <g key={e.id} opacity={dim ? 0.18 : 1}>
                  <path
                    d={e.path}
                    fill="none"
                    style={{ stroke: hi ? 'var(--accent-10)' : (lens ?? 'var(--gray-9)') }}
                    strokeWidth={hi ? 2.5 : lens ? 2.2 : 1.5}
                    strokeDasharray={e.dashed ? '7 5' : undefined}
                    markerStart={e.arrowStart ? marker : undefined}
                    markerEnd={e.arrowEnd ? marker : undefined}
                    data-testid="diagram-edge"
                    data-active={e.rel.isActive ? 'true' : 'false'}
                    data-crossfilter={e.rel.crossFilter}
                    data-cardinality={e.rel.cardinality}
                  >
                    <title>
                      {`${e.rel.fromTable}[${e.rel.fromColumn}] to ${e.rel.toTable}[${e.rel.toColumn}]: ${e.rel.cardinality}, ${e.rel.crossFilter === 'both' ? 'both directions' : 'single direction'}${e.rel.isActive ? '' : ', inactive'}`}
                    </title>
                  </path>
                  {[e.startLabel, e.endLabel].map((l, i) => (
                    <text
                      key={i}
                      x={l.x}
                      y={l.y}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      className="font-mono"
                      style={{ fill: 'var(--muted)', stroke: 'var(--world-sky)', strokeWidth: 4, paintOrder: 'stroke' }}
                    >
                      {l.text}
                    </text>
                  ))}
                </g>
              );
            })}
          </g>
          <g>
            {layout.nodes.map((n) => {
              const isSel = n.id === selected;
              const dim = !!neighbours && !neighbours.has(n.id);
              const kind = kinds?.get(n.id) ?? 'planet';
              const p = paint?.(n.id);
              const body = kind === 'sun' ? 'var(--accent-9)' : (p?.fill ?? 'var(--gray-9)');
              const ghost = p?.ghost ?? n.hidden;
              const flare = p?.flare ? (p.flare === 'warn' ? 'var(--warn-solid)' : 'var(--info-solid)') : null;
              const r = kind === 'sun' ? 8 : 6;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x - n.w / 2},${n.y - n.h / 2})`}
                  opacity={dim ? 0.3 : 1}
                  className="cursor-pointer"
                  onClick={() => {
                    if (!justDragged.current) onSelect(isSel ? null : n.id);
                  }}
                  data-testid="diagram-node"
                  data-table={n.id}
                >
                  <title>{`${n.id}${n.hidden ? ' (hidden)' : ''}`}</title>
                  <rect
                    width={n.w}
                    height={n.h}
                    rx={n.h / 2}
                    style={{
                      fill: isSel ? 'var(--accent-3)' : 'var(--glass-strong)',
                      stroke: isSel ? 'var(--accent-9)' : kind === 'sun' ? 'var(--accent-7)' : 'var(--line-strong)',
                    }}
                    strokeWidth={isSel ? 2 : 1}
                    strokeDasharray={ghost ? '4 3' : undefined}
                  />
                  {kind === 'sun' && <circle cx={18} cy={n.h / 2} r={r + 5} style={{ fill: 'var(--accent-9)' }} opacity={0.18} />}
                  {flare && <circle cx={18} cy={n.h / 2} r={r + 4} fill="none" style={{ stroke: flare }} strokeWidth={2} />}
                  <circle
                    cx={18}
                    cy={n.h / 2}
                    r={r}
                    style={{ fill: ghost ? 'transparent' : body, stroke: body }}
                    strokeWidth={ghost ? 1.5 : 0}
                    strokeDasharray={ghost ? '2 2' : undefined}
                  />
                  <text
                    x={32}
                    y={n.h / 2 + 4.5}
                    fontSize={13}
                    fontWeight={kind === 'sun' ? 650 : 550}
                    fontStyle={n.hidden ? 'italic' : undefined}
                    style={{ fill: n.hidden ? 'var(--muted)' : 'var(--text)' }}
                  >
                    {n.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        {fill && <div className="pointer-events-auto absolute top-1/2 right-4 -translate-y-1/2">{toolbar}</div>}
      </div>
      {!fill && <StarChartKey />}
    </div>
  );
}

/** Key for the star chart lines and marks (also read by the acceptance test). */
export function StarChartKey({ className }: { className?: string }) {
  const stroke = { stroke: 'var(--gray-9)' };
  const tri = (x: number, flip: boolean) => (
    <path d={flip ? `M${x},0 L${x - 8},4 L${x},8 z` : `M${x},0 L${x + 8},4 L${x},8 z`} transform="translate(0,6)" style={{ fill: 'var(--gray-9)' }} />
  );
  const item = 'flex items-center gap-2';
  return (
    <ul className={cx('m-0 mt-3 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-xs text-muted', className)} aria-label="Star chart key" data-testid="diagram-legend">
      <li className={item}>
        <svg width="16" height="16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" style={{ fill: 'var(--accent-9)' }} opacity="0.2" />
          <circle cx="8" cy="8" r="5" style={{ fill: 'var(--accent-9)' }} />
        </svg>
        Star: fact table
      </li>
      <li className={item}>
        <svg width="36" height="20" aria-hidden="true">
          <line x1="2" y1="10" x2="34" y2="10" style={stroke} strokeWidth="2" />
        </svg>
        Active relationship
      </li>
      <li className={item}>
        <svg width="36" height="20" aria-hidden="true">
          <line x1="2" y1="10" x2="34" y2="10" style={stroke} strokeWidth="2" strokeDasharray="7 5" />
        </svg>
        Inactive (dashed)
      </li>
      <li className={item}>
        <svg width="36" height="20" aria-hidden="true">
          <line x1="10" y1="10" x2="34" y2="10" style={stroke} strokeWidth="2" />
          {tri(10, true)}
        </svg>
        Arrow points at the filtered table
      </li>
      <li className={item}>
        <svg width="36" height="20" aria-hidden="true">
          <line x1="10" y1="10" x2="26" y2="10" style={stroke} strokeWidth="2" />
          {tri(10, true)}
          {tri(26, false)}
        </svg>
        Both directions (double arrow)
      </li>
      <li className={item}>
        <span className="x-mono font-semibold text-fg">1 *</span>
        One and many ends
      </li>
      <li className={item}>
        <svg width="16" height="16" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" fill="none" style={stroke} strokeWidth="1.5" strokeDasharray="2 2" />
        </svg>
        Hidden table
      </li>
    </ul>
  );
}
