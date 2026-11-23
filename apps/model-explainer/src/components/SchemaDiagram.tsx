/**
 * The schema diagram: one card per table listing its relationship keys, columns and measures, with every relationship
 * drawn from the key column on one card to the key column on the other. Dots flow along active relationships in the
 * direction filters travel (from the one side to the many side); inactive relationships are dashed and still.
 * Clicking a table, a column, a measure or a relationship line focuses it (the page shows its details).
 * Layout in domain/schema.ts. Cards are HTML (crisp text, focusable), links an SVG layer underneath, both inside one
 * panned and zoomed plane.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { Calendar, ChevronsDownUp, ChevronsUpDown, EyeOff, Hash, KeyRound, Maximize2, Minus, Plus, Sigma, Table2, ToggleLeft, Type } from 'lucide-react';

import { cx, IconButton } from '@x10/shared/ui';

import { columnId, measureId, relId, tableId, type ObjectRef } from '../domain/model';
import { isDateType, isNumericType, isTextType } from '../domain/parse';
import { BORDER, colKey, HEADER_H, ROW_H, SECTION_H, type CardRow, type SchemaCard, type SchemaLayout, type SchemaLink } from '../domain/schema';

interface View {
  x: number;
  y: number;
  k: number;
}

const MIN_K = 0.25;
const MAX_K = 1.75;
/** The starting view never shrinks text below this scale; it centres on the main fact table instead. */
const READABLE_K = 0.6;
const ZOOM_STEP = 1.2;

const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

/** Space covered by floating panels, in screen pixels; the view fits the drawing into what is left. */
export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const NO_INSETS: Insets = { left: 0, right: 0, top: 0, bottom: 0 };

function fitView(layout: SchemaLayout, w0: number, h0: number, readable: boolean, inset: Insets): View {
  const w = Math.max(200, w0 - inset.left - inset.right);
  const h = Math.max(200, h0 - inset.top - inset.bottom);
  const k = Math.min(1, w / layout.width, h / layout.height);
  if (readable && k < READABLE_K && layout.focus) {
    return { k: READABLE_K, x: inset.left + w / 2 - layout.focus.x * READABLE_K, y: inset.top + h / 2 - layout.focus.y * READABLE_K };
  }
  const kk = clampK(k);
  return { k: kk, x: inset.left + (w - layout.width * kk) / 2, y: inset.top + (h - layout.height * kk) / 2 };
}

function zoomAt(v: View, factor: number, at: { x: number; y: number }): View {
  const k = clampK(v.k * factor);
  const f = k / v.k;
  return { k, x: at.x - (at.x - v.x) * f, y: at.y - (at.y - v.y) * f };
}

export function typeLabel(dataType: string): string {
  if (/currency|decimal/i.test(dataType)) return dataType.toLowerCase().startsWith('cur') ? '$' : '1.2';
  if (/^(int|int64|integer|whole)/i.test(dataType)) return '123';
  if (isNumericType(dataType)) return '1.2';
  if (isDateType(dataType)) return 'date';
  if (/bool/i.test(dataType)) return 'y/n';
  if (isTextType(dataType)) return 'abc';
  return dataType.slice(0, 5).toLowerCase();
}

function TypeIcon({ dataType }: { dataType: string }) {
  const cls = 'size-3.5 shrink-0 text-faint';
  if (isDateType(dataType)) return <Calendar className={cls} aria-hidden="true" />;
  if (/bool/i.test(dataType)) return <ToggleLeft className={cls} aria-hidden="true" />;
  if (isNumericType(dataType)) return <Hash className={cls} aria-hidden="true" />;
  return <Type className={cls} aria-hidden="true" />;
}

export interface SchemaDiagramProps {
  layout: SchemaLayout;
  /** Changing this re-fits the view (a different model); expanding cards does not. */
  resetKey: string;
  /** The focused table, column, measure or relationship. */
  focus: ObjectRef | null;
  /** Called with an object id (t:, c:, m:, r:) or null to clear. */
  onFocus: (id: string | null) => void;
  onToggleExpand: (table: string) => void;
  reducedMotion?: boolean;
  insets?: Insets;
  className?: string;
}

export function SchemaDiagram({ layout, resetKey, focus, onFocus, onToggleExpand, reducedMotion, insets = NO_INSETS, className }: SchemaDiagramProps) {
  const focusTable = focus && focus.kind !== 'relationship' ? focus.table : null;
  const focusRel = focus?.kind === 'relationship' ? focus.index : null;
  const focusCol = focus?.kind === 'column' ? colKey(focus.table, focus.column) : null;
  /** The card to keep in view: the focused object's table, or the "from" end of a focused relationship. */
  const anchorTable = focusTable ?? (focusRel !== null ? (layout.links.find((l) => l.index === focusRel)?.rel.fromTable ?? null) : null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [hoverTable, setHoverTable] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean; id: number } | null>(null);
  const justDragged = useRef(false);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const insetRef = useRef(insets);
  insetRef.current = insets;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit when the model changes, and when the container resizes until someone pans or zooms.
  const fittedFor = useRef<string | null>(null);
  const touched = useRef(false);
  useEffect(() => {
    if (!size.w) return;
    if (fittedFor.current === resetKey && touched.current) return;
    fittedFor.current = resetKey;
    touched.current = false;
    setView(fitView(layoutRef.current, size.w, size.h, true, insetRef.current));
  }, [resetKey, size]);

  const fit = useCallback(() => {
    if (!size.w) return;
    touched.current = false;
    setView(fitView(layoutRef.current, size.w, size.h, false, insetRef.current));
  }, [size]);
  const zoom = useCallback(
    (f: number) => {
      touched.current = true;
      setView((v) => zoomAt(v, f, { x: size.w / 2, y: size.h / 2 }));
    },
    [size],
  );
  const pan = (dx: number, dy: number) => {
    touched.current = true;
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };

  // Keep the focused card in view.
  useEffect(() => {
    if (!anchorTable || !size.w) return;
    const c = layoutRef.current.cards.find((x) => x.name === anchorTable);
    if (!c) return;
    const i = insetRef.current;
    setView((v) => {
      const left = c.x * v.k + v.x;
      const top = c.y * v.k + v.y;
      const h = Math.min(c.h, 320) * v.k;
      const inside = left > i.left + 16 && top > i.top + 16 && left + c.w * v.k < size.w - i.right - 16 && top + h < size.h - i.bottom - 16;
      if (inside) return v;
      const cx = i.left + (size.w - i.left - i.right) / 2;
      const cy = i.top + (size.h - i.top - i.bottom) / 2;
      return { ...v, x: cx - (c.x + c.w / 2) * v.k, y: cy - (c.y + Math.min(c.h, 320) / 2) * v.k };
    });
  }, [anchorTable, focusCol, size]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      touched.current = true;
      const r = el.getBoundingClientRect();
      const at = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        setView((v) => zoomAt(v, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), at));
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    justDragged.current = false;
    drag.current = { x: e.clientX, y: e.clientY, view, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) wrapRef.current?.setPointerCapture(d.id);
    d.moved = true;
    touched.current = true;
    setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy });
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      justDragged.current = true;
      wrapRef.current?.releasePointerCapture?.(d.id);
    }
  };
  const onBackgroundClick = (e: MouseEvent) => {
    if (justDragged.current) return;
    if (!(e.target as Element).closest('[data-card], [data-link]')) onFocus(null);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== wrapRef.current) return;
    const map: Record<string, () => void> = {
      '+': () => zoom(ZOOM_STEP),
      '=': () => zoom(ZOOM_STEP),
      '-': () => zoom(1 / ZOOM_STEP),
      '0': fit,
      ArrowLeft: () => pan(80, 0),
      ArrowRight: () => pan(-80, 0),
      ArrowUp: () => pan(0, 80),
      ArrowDown: () => pan(0, -80),
      Escape: () => onFocus(null),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  const keyCols = useMemo(() => {
    const k = new Set<string>();
    for (const l of layout.links) k.add(colKey(l.rel.fromTable, l.rel.fromColumn)).add(colKey(l.rel.toTable, l.rel.toColumn));
    return k;
  }, [layout.links]);
  // Hover wins over the focus: a key column, then a table; otherwise the focused relationship, key column or table.
  const isHot = useCallback(
    (l: SchemaLink) => {
      const onCol = (k: string) => colKey(l.rel.fromTable, l.rel.fromColumn) === k || colKey(l.rel.toTable, l.rel.toColumn) === k;
      const onTable = (t: string) => l.rel.fromTable === t || l.rel.toTable === t;
      if (hoverCol) return onCol(hoverCol);
      if (hoverTable) return onTable(hoverTable);
      if (focusRel !== null) return l.index === focusRel;
      if (focusCol && keyCols.has(focusCol)) return onCol(focusCol);
      return !!focusTable && onTable(focusTable);
    },
    [hoverCol, hoverTable, focusRel, focusCol, focusTable, keyCols],
  );
  const anyFocus = !!(hoverCol || hoverTable || focus);
  const hotCols = useMemo(() => {
    const s = new Set<string>();
    for (const l of layout.links) {
      if (!isHot(l)) continue;
      s.add(colKey(l.rel.fromTable, l.rel.fromColumn));
      s.add(colKey(l.rel.toTable, l.rel.toColumn));
    }
    return s;
  }, [layout.links, isHot]);
  const litTables = useMemo(() => {
    if (!anyFocus) return null;
    const s = new Set<string>();
    const own = hoverTable ?? (hoverCol ? null : focusTable);
    if (own) s.add(own);
    for (const l of layout.links) if (isHot(l)) s.add(l.rel.fromTable).add(l.rel.toTable);
    return s;
  }, [anyFocus, hoverTable, hoverCol, focusTable, layout.links, isHot]);

  /** Focus an object unless the click ended a drag. */
  const pick = (id: string | null) => {
    if (!justDragged.current) onFocus(id);
  };
  const focusedRow = focus?.kind === 'column' ? columnId(focus.table, focus.column) : focus?.kind === 'measure' ? measureId(focus.table, focus.measure) : null;

  const arrow = `arrow-${uid}`;
  const arrowHot = `arrow-hot-${uid}`;
  const grid = 24 * view.k;

  return (
    <div className={cx('relative h-full w-full overflow-hidden', className)}>
      <div
        ref={wrapRef}
        tabIndex={0}
        role="group"
        aria-label={`Model diagram: ${layout.cards.length} tables and ${layout.links.length} relationships. Drag to pan, scroll to zoom, select a table to list all of its fields.`}
        data-testid="schema-diagram"
        className="absolute inset-0 cursor-grab touch-none select-none outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-inset"
        style={{
          backgroundImage: 'radial-gradient(circle, var(--line) 1px, transparent 1.2px)',
          backgroundSize: `${grid}px ${grid}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={onBackgroundClick}
        onKeyDown={onKey}
      >
        <div className="absolute top-0 left-0 origin-top-left" style={{ width: layout.width, height: layout.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg className="pointer-events-none absolute inset-0 overflow-visible" width={layout.width} height={layout.height} aria-hidden="true">
            <defs>
              <marker id={arrow} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,1 L10,5 L0,9 z" style={{ fill: 'var(--line-strong)' }} />
              </marker>
              <marker id={arrowHot} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,1 L10,5 L0,9 z" style={{ fill: 'var(--accent-9)' }} />
              </marker>
            </defs>
            {layout.links.map((l) => (
              <Link
                key={`${l.index}`}
                link={l}
                hot={isHot(l)}
                picked={l.index === focusRel}
                dim={anyFocus && !isHot(l)}
                marker={isHot(l) ? arrowHot : arrow}
                still={!!reducedMotion}
                onPick={() => pick(l.index === focusRel ? null : relId(l.index))}
              />
            ))}
          </svg>
          {layout.labels.map((g) => (
            <div key={g.text} className="absolute text-xs font-medium tracking-wide text-muted uppercase" style={{ left: g.x, top: g.y }}>
              {g.text}
            </div>
          ))}
          {layout.cards.map((c) => (
            <Card
              key={c.name}
              card={c}
              selected={c.name === focusTable}
              dim={!!litTables && !litTables.has(c.name)}
              hotCols={hotCols}
              pickedRow={focusTable === c.name ? focusedRow : null}
              onSelect={() => pick(focus?.kind === 'table' && focus.table === c.name ? null : tableId(c.name))}
              onPick={(id) => pick(id === focusedRow ? tableId(c.name) : id)}
              onToggle={() => onToggleExpand(c.name)}
              onHover={(on) => setHoverTable(on ? c.name : null)}
              onHoverCol={setHoverCol}
            />
          ))}
        </div>
      </div>
      <div role="toolbar" aria-label="Diagram controls" className="x-glass absolute right-4 bottom-4 flex flex-col gap-0.5 rounded-full! p-1">
        <IconButton size="sm" label="Zoom in" icon={<Plus />} onClick={() => zoom(ZOOM_STEP)} />
        <IconButton size="sm" label="Zoom out" icon={<Minus />} onClick={() => zoom(1 / ZOOM_STEP)} />
        <IconButton size="sm" label="Fit to view" icon={<Maximize2 />} onClick={fit} />
      </div>
    </div>
  );
}

/** One relationship: the line, an arrowhead at each filtered end and, when active, dots flowing with the filter. */
function Link({
  link: l,
  hot,
  picked,
  dim,
  marker,
  still,
  onPick,
}: {
  link: SchemaLink;
  hot: boolean;
  picked: boolean;
  dim: boolean;
  marker: string;
  still: boolean;
  onPick: () => void;
}) {
  const stroke = hot ? 'var(--accent-9)' : 'var(--line-strong)';
  const toEnd = l.flow === 'forward' || l.flow === 'both';
  const toStart = l.flow === 'backward' || l.flow === 'both';
  const dur = Math.min(6, Math.max(1.8, l.length / 80));
  const dots = l.rel.isActive && !still ? (l.flow === 'both' ? 2 : 3) : 0;
  const lab = (p: { x: number; y: number }, side: 1 | -1, text: string) => (
    <text x={p.x + side * 8} y={p.y - 6} textAnchor={side === 1 ? 'start' : 'end'} fontSize={11} fontWeight={600} className="font-mono" style={{ fill: hot ? 'var(--accent-11)' : 'var(--muted)' }}>
      {text}
    </text>
  );
  const flowDots = (reverse: boolean) =>
    Array.from({ length: dots }, (_, i) => (
      <circle key={`${reverse ? 'r' : 'f'}${i}`} r={hot ? 3.4 : 2.6} style={{ fill: 'var(--accent-9)' }} opacity={hot ? 1 : 0.75}>
        <animateMotion
          dur={`${dur}s`}
          begin={`${(-dur * i) / dots}s`}
          repeatCount="indefinite"
          path={l.path}
          calcMode="linear"
          keyPoints={reverse ? '1;0' : '0;1'}
          keyTimes="0;1"
        />
      </circle>
    ));
  return (
    <g
      opacity={dim ? 0.18 : 1}
      style={{ transition: 'opacity 150ms' }}
      data-testid="schema-link"
      data-from={l.rel.fromTable}
      data-to={l.rel.toTable}
      data-active={l.rel.isActive ? 'true' : 'false'}
      data-flow={l.flow}
    >
      <path
        d={l.path}
        fill="none"
        style={{ stroke }}
        strokeWidth={picked ? 3 : hot ? 2.25 : 1.5}
        strokeDasharray={l.rel.isActive ? undefined : '6 5'}
        markerEnd={toEnd ? `url(#${marker})` : undefined}
        markerStart={toStart ? `url(#${marker})` : undefined}
      />
      {/* A wide invisible stroke makes the line easy to click. */}
      <path
        d={l.path}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        data-link
        onClick={(e) => {
          e.stopPropagation();
          onPick();
        }}
      >
        <title>{`${l.rel.fromTable}[${l.rel.fromColumn}] to ${l.rel.toTable}[${l.rel.toColumn}]: select for details`}</title>
      </path>
      {lab(l.start, l.startSide, l.startCard)}
      {lab(l.end, l.endSide, l.endCard)}
      {toEnd && flowDots(false)}
      {toStart && flowDots(true)}
    </g>
  );
}

function Card({
  card: c,
  selected,
  dim,
  hotCols,
  pickedRow,
  onSelect,
  onPick,
  onToggle,
  onHover,
  onHoverCol,
}: {
  card: SchemaCard;
  selected: boolean;
  dim: boolean;
  hotCols: Set<string>;
  /** The focused column or measure on this card (c: or m: id). */
  pickedRow: string | null;
  onSelect: () => void;
  onPick: (id: string) => void;
  onToggle: () => void;
  onHover: (on: boolean) => void;
  onHoverCol: (key: string | null) => void;
}) {
  const fact = c.kind === 'fact';
  const counts = [`${c.columnCount} col${c.columnCount === 1 ? '' : 's'}`, c.measureCount ? `${c.measureCount} meas.` : null].filter(Boolean).join(' · ');
  return (
    <div
      data-card
      data-testid="schema-card"
      data-table={c.name}
      data-kind={c.kind}
      className={cx(
        'absolute overflow-hidden rounded-xl border bg-[var(--surface)] text-[12.5px] shadow-[var(--shadow-float)]',
        selected ? 'border-[var(--accent-9)] ring-2 ring-[var(--ring)]' : fact ? 'border-[var(--accent-7)]' : 'border-[var(--line-strong)]',
        c.hidden && !selected && 'border-dashed',
      )}
      style={{ left: c.x, top: c.y, width: c.w, height: c.h, borderWidth: BORDER, opacity: dim ? 0.45 : 1, transition: 'opacity 150ms' }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onClick={onSelect}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${c.name}${fact ? ', fact table' : ''}${c.hidden ? ', hidden' : ''}. ${counts}. ${selected ? 'Selected.' : 'Select to list every field.'}`}
        className={cx(
          'flex w-full cursor-pointer items-center gap-2 border-b border-[var(--line)] px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-inset',
          fact ? 'bg-[var(--accent-3)]' : 'bg-[var(--surface-sunken)]',
        )}
        style={{ height: HEADER_H }}
      >
        <Table2 className={cx('size-4 shrink-0', fact ? 'text-[var(--accent-11)]' : 'text-muted')} aria-hidden="true" />
        <span className={cx('min-w-0 flex-1 truncate font-semibold', c.hidden ? 'text-muted italic' : 'text-fg')} title={c.name}>
          {c.name}
        </span>
        {fact && <span className="rounded bg-[var(--accent-9)] px-1.5 py-px text-[10px] font-semibold tracking-wide text-[var(--accent-contrast)] uppercase">Fact</span>}
        {c.hidden && <EyeOff className="size-3.5 shrink-0 text-faint" aria-label="Hidden table" />}
      </button>
      <ul className="m-0 list-none p-0">
        {c.rows.map((r) => (
          <Row key={rowKey(r)} row={r} table={c.name} hotCols={hotCols} pickedRow={pickedRow} onPick={onPick} onToggle={onToggle} onHoverCol={onHoverCol} />
        ))}
      </ul>
    </div>
  );
}

const ROW_BUTTON =
  'flex h-full w-full cursor-pointer items-center gap-2 px-3 text-left outline-none hover:bg-[var(--row-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-inset';
/** A focused column or measure row: tinted, with an accent bar on the left. */
const PICKED = 'bg-[var(--accent-4)] shadow-[inset_3px_0_0_var(--accent-9)]';

function rowKey(r: CardRow): string {
  switch (r.kind) {
    case 'column':
      return `c:${r.column.name}`;
    case 'measure':
      return `m:${r.measure.name}`;
    default:
      return `${r.kind}:${r.top}`;
  }
}

function Row({
  row: r,
  table,
  hotCols,
  pickedRow,
  onPick,
  onToggle,
  onHoverCol,
}: {
  row: CardRow;
  table: string;
  hotCols: Set<string>;
  pickedRow: string | null;
  onPick: (id: string) => void;
  onToggle: () => void;
  onHoverCol: (key: string | null) => void;
}) {
  const base = 'flex items-center gap-2 px-3';
  if (r.kind === 'section') {
    return (
      <li className={cx(base, 'border-t border-[var(--line)] text-[10.5px] font-semibold tracking-wide text-muted uppercase')} style={{ height: SECTION_H }}>
        {r.label}
      </li>
    );
  }
  if (r.kind === 'note') {
    return (
      <li className={cx(base, 'text-muted italic')} style={{ height: ROW_H }}>
        {r.text}
      </li>
    );
  }
  if (r.kind === 'toggle') {
    return (
      <li style={{ height: ROW_H }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="flex h-full w-full cursor-pointer items-center gap-1.5 px-3 text-left text-[11.5px] font-medium text-[var(--accent-11)] outline-none hover:bg-[var(--row-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-inset"
        >
          {r.expanded ? <ChevronsDownUp className="size-3.5" aria-hidden="true" /> : <ChevronsUpDown className="size-3.5" aria-hidden="true" />}
          {r.expanded ? 'Show less' : `Show ${r.more} more`}
        </button>
      </li>
    );
  }
  if (r.kind === 'measure') {
    const m = r.measure;
    const id = measureId(table, m.name);
    const picked = pickedRow === id;
    return (
      <li className={cx(picked && PICKED)} style={{ height: ROW_H }} data-testid="schema-measure">
        <button
          type="button"
          className={ROW_BUTTON}
          aria-pressed={picked}
          aria-label={`Measure ${m.name}${m.isHidden ? ', hidden' : ''}: show details`}
          title={m.description || m.name}
          onClick={(e) => {
            e.stopPropagation();
            onPick(id);
          }}
        >
          <Sigma className="size-3.5 shrink-0 text-[var(--accent-11)]" aria-hidden="true" />
          <span className={cx('min-w-0 flex-1 truncate', m.isHidden && 'text-muted italic')}>{m.name}</span>
          {m.isHidden && <EyeOff className="size-3 shrink-0 text-faint" aria-hidden="true" />}
        </button>
      </li>
    );
  }
  const c = r.column;
  const key = colKey(table, c.name);
  const id = columnId(table, c.name);
  const picked = pickedRow === id;
  const hot = r.isKey && hotCols.has(key);
  return (
    <li
      className={cx(picked ? PICKED : hot && 'bg-[var(--accent-3)]')}
      style={{ height: ROW_H }}
      onPointerEnter={r.isKey ? () => onHoverCol(key) : undefined}
      onPointerLeave={r.isKey ? () => onHoverCol(null) : undefined}
      data-testid="schema-column"
      data-key={r.isKey ? 'true' : undefined}
    >
      <button
        type="button"
        className={ROW_BUTTON}
        aria-pressed={picked}
        aria-label={`Column ${c.name}, ${c.dataType}${r.isKey ? ', relationship key' : ''}${c.isHidden ? ', hidden' : ''}: show details`}
        title={c.description || c.name}
        onClick={(e) => {
          e.stopPropagation();
          onPick(id);
        }}
      >
        {r.isKey ? <KeyRound className={cx('size-3.5 shrink-0', hot || picked ? 'text-[var(--accent-11)]' : 'text-[var(--warn-solid)]')} aria-hidden="true" /> : <TypeIcon dataType={c.dataType} />}
        <span className={cx('min-w-0 flex-1 truncate', c.isHidden && 'text-muted italic', r.isKey && 'font-medium')}>{c.name}</span>
        {c.kind === 'calculated' && <span className="x-mono text-[10px] text-[var(--accent-11)]">fx</span>}
        {c.isHidden && <EyeOff className="size-3 shrink-0 text-faint" aria-hidden="true" />}
        <span className="x-mono w-8 shrink-0 text-right text-[10.5px] text-faint">{typeLabel(c.dataType)}</span>
      </button>
    </li>
  );
}
