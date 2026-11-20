/**
 * Home: the semantic model as a solar system. Fact tables are stars, dimensions planets, measures moons and
 * relationships trails; lenses re-paint it, Today flies to the findings, and the list view holds the same data.
 */
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode, type RefObject } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, CircleSlash, Keyboard, Locate, Minus, Orbit, Pause, PenLine, Play, Plus, RefreshCw, Search, Wrench } from 'lucide-react';

import {
  Badge,
  Button,
  cx,
  IconButton,
  Legend,
  LensBar,
  LinkButton,
  StageMessage,
  StagePage,
  Table,
  TableWrap,
  Td,
  Th,
  TodayPanel,
  Tr,
  useHotkeys,
  useIsDesktop,
  useReducedMotion,
  ViewAsSwitch,
  ViewToggle,
  supportsWebGL,
  type StageView,
  type TodayItem,
} from '@x10/shared/ui';

import { BodyGlyph } from '../components/BodyGlyph';
import { MissingSections, ReloadButton, SeverityChip } from '../components/common';
import { Dax } from '../components/Dax';
import { ShortcutsDialog } from '../components/Shortcuts';
import { StarChart } from '../components/StarChart';
import { evaluateHealth, scoreTone } from '../domain/findings';
import { cardinalityLabel, crossFilterLabel } from '../domain/markdown';
import { buildOrrery, kindLabel, kindShort, measureId, parseObjectId, relId, tableId, type Orrery } from '../domain/orrery';
import type { ModelMetadata } from '../domain/types';
import { COVERAGE_LABEL, flareMap, measureCoverage, tableWeather, todayEntries, type FlareMap, type LensKey } from '../domain/weather';
import { buildLooks, compactNumber, LENSES, legendFor, lensLabel, type Looks } from '../orrery/look';
import type { OrreryApi } from '../orrery/OrreryCanvas';
import { useModel } from '../state/ModelContext';

const OrreryCanvas = lazy(() => import('../orrery/OrreryCanvas'));

type ViewAs = 'modeller' | 'author';

const VIEW_AS = [
  { value: 'modeller' as const, label: 'Modeller', icon: <Wrench /> },
  { value: 'author' as const, label: 'Author', icon: <PenLine /> },
];

const SKY_BG =
  'radial-gradient(ellipse 110% 85% at 42% 38%, color-mix(in oklab, var(--accent-3) 60%, var(--world-sky)) 0%, var(--world-sky) 58%, color-mix(in oklab, var(--world-sky) 86%, var(--gray-12)) 100%)';

const isLens = (v: string | null): v is LensKey => v === 'weather' || v === 'size' || v === 'hidden' || v === 'coverage';

function todayDate(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ------------------------------------------------------------------ page */

export function SystemPage() {
  const { metadata, refresh } = useModel();
  const [view, setView] = useState<StageView>('stage');
  if (metadata.data) return <SystemView meta={metadata.data} view={view} setView={setView} />;
  const failed = !!metadata.error;
  return (
    <StagePage
      label="Model sky"
      title={<ModelTitle />}
      meta={<span>{failed ? 'Could not read the model' : 'Reading the model metadata…'}</span>}
      background={SKY_BG}
      stage={
        failed ? (
          <StageMessage
            icon={<CircleSlash />}
            title="The model could not be read"
            action={
              <Button variant="primary" icon={<RefreshCw aria-hidden="true" />} onClick={() => void refresh()}>
                Retry
              </Button>
            }
          >
            {metadata.error?.message}
          </StageMessage>
        ) : (
          <SkyLoading />
        )
      }
    />
  );
}

function SkyLoading({ label = 'Charting the model…' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="absolute inset-0 grid place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative size-28">
          <span className="absolute inset-0 rounded-full border border-dashed border-[color-mix(in_oklab,var(--gray-12)_18%,transparent)] motion-safe:animate-[spin_14s_linear_infinite]" />
          <span className="absolute inset-5 rounded-full border border-[color-mix(in_oklab,var(--gray-12)_12%,transparent)] motion-safe:animate-[spin_8s_linear_infinite_reverse]">
            <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-gray-10" />
          </span>
          <span className="absolute inset-[42px] rounded-full bg-accent-9 shadow-[0_0_24px_var(--accent-9)]" />
        </div>
        <span className="x-legend-label text-muted">{label}</span>
      </div>
    </div>
  );
}

/** The model name as the stage title, with an invisible native select over it to switch models. */
function ModelTitle() {
  const { choices, current, select } = useModel();
  const multi = choices.length > 1;
  return (
    <span className="relative inline-flex max-w-full items-center gap-1.5 rounded-md focus-within:ring-2 focus-within:ring-[var(--focus)]">
      <span className="truncate" data-testid="model-name">
        {current.label}
      </span>
      {multi && <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted" strokeWidth={2} />}
      {multi && (
        <select
          aria-label="Switch semantic model"
          data-testid="model-picker"
          value={current.key}
          onChange={(e) => select(e.target.value)}
          className="absolute inset-0 w-full cursor-pointer appearance-none opacity-0"
        >
          {choices.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ view */

function SystemView({ meta, view, setView }: { meta: ModelMetadata; view: StageView; setView: (v: StageView) => void }) {
  const { rows, current } = useModel();
  const [params, setParams] = useSearchParams();
  const lens: LensKey = isLens(params.get('lens')) ? (params.get('lens') as LensKey) : 'weather';
  const focus = params.get('focus');
  const [viewAs, setViewAs] = useState<ViewAs>('modeller');
  const [paused, setPaused] = useState(false);
  const [help, setHelp] = useState(false);
  const [glError, setGlError] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const desktop = useIsDesktop();
  const gl = useMemo(() => supportsWebGL(), []);
  const api = useRef<OrreryApi | null>(null);
  const flyInput = useRef<HTMLInputElement>(null);

  const setParam = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
  const setLens = (l: LensKey) => setParam({ lens: l === 'weather' ? null : l });
  const setFocus = (id: string | null) => setParam({ focus: id });

  const report = useMemo(() => evaluateHealth(meta), [meta]);
  const flares = useMemo(() => flareMap(meta, report), [meta, report]);
  const orrery = useMemo(() => buildOrrery(meta, { hideHidden: viewAs === 'author' }), [meta, viewAs]);
  const looks = useMemo(() => buildLooks({ lens, meta, orrery, flares, rows: rows.counts }), [lens, meta, orrery, flares, rows.counts]);
  const entries = useMemo(() => todayEntries(meta, report), [meta, report]);
  const legend = useMemo(() => legendFor(lens, { meta, orrery, flares, rows: rows.counts }), [lens, meta, orrery, flares, rows.counts]);

  // The Size lens needs row counts: weigh every table once per model, on demand.
  const weigh = rows.weigh;
  useEffect(() => {
    if (lens === 'size') weigh();
  }, [lens, weigh]);

  // A focus that does not exist in this model (or this view-as) is dropped.
  const focusOk = !!focus && objectExists(orrery, focus);
  const activeFocus = focusOk ? focus : null;

  const today: TodayItem[] = entries.map((e) => ({
    id: e.id,
    title: e.title,
    severity: e.severity,
    value: e.value,
    unit: e.unit,
    lens: lensLabel(e.lens),
    meta: e.meta,
  }));
  const activeToday = entries.find((e) => e.focus === activeFocus)?.id ?? null;
  const goToday = (step: number) => {
    if (!entries.length) return;
    const i = entries.findIndex((e) => e.id === activeToday);
    const next = entries[(i + step + entries.length) % entries.length];
    setParam({ focus: next.focus, lens: next.lens === 'weather' ? null : next.lens });
  };

  const flyTo = (q: string) => {
    const id = findObject(meta, orrery, q);
    if (id) setFocus(id);
    return !!id;
  };

  useHotkeys({
    escape: () => (activeFocus ? setFocus(null) : undefined),
    '/': () => flyInput.current?.focus(),
    p: () => setPaused((v) => !v),
    '0': () => (activeFocus ? setFocus(null) : api.current?.overview()),
    ']': () => goToday(1),
    '[': () => goToday(-1),
    'shift+?': () => setHelp(true),
  });

  const counts = `${orrery.bodies.length} tables · ${orrery.moons.length} measures · ${orrery.trails.length} relationships`;
  const systemName = (name: string) => orrery.systems[orrery.byName.get(name)?.system ?? 0]?.name;
  const ref = activeFocus ? parseObjectId(activeFocus) : null;
  const focusTable = ref && ref.kind !== 'relationship' ? ref.table : null;
  const focusTitle = !ref
    ? null
    : ref.kind === 'table'
      ? ref.table
      : ref.kind === 'measure'
        ? ref.measure
        : `${meta.relationships[ref.index].fromTable} → ${meta.relationships[ref.index].toTable}`;
  const crumbSystem = focusTable ? systemName(focusTable) : ref?.kind === 'relationship' ? systemName(meta.relationships[ref.index].fromTable) : null;

  const breadcrumb = activeFocus
    ? [
        { label: current.label, onClick: () => setFocus(null) },
        ...(crumbSystem ? [{ label: crumbSystem }] : []),
        ...(ref?.kind === 'measure' ? [{ label: ref.table, onClick: () => setFocus(tableId(ref.table)) }] : []),
        { label: focusTitle },
      ]
    : [{ label: 'Sky' }, { label: skyLabel(orrery) }];

  const tone = scoreTone(report.score);
  const metaLine = activeFocus ? (
    <FocusCard id={activeFocus} meta={meta} orrery={orrery} flares={flares} looks={looks} rows={rows.counts} onFocus={setFocus} onWeigh={() => rows.weigh()} weighing={rows.loading} />
  ) : (
    <>
      <span className="num">{counts}</span>
      <Link to="/space-weather" className="inline-flex items-center gap-1.5 text-muted no-underline hover:text-fg" title="Space weather: the health score">
        <span className={cx('size-2 rounded-full', tone === 'ok' ? 'bg-ok-solid' : tone === 'warn' ? 'bg-warn-solid' : 'bg-bad-solid')} aria-hidden="true" />
        Weather <span className="font-mono font-semibold text-fg num" data-testid="health-score">{report.score}</span>
        <span className="text-faint">/100</span>
      </Link>
      <MissingSections meta={meta} />
      {!(gl && !glError) && (
        <span className="basis-full text-xs text-muted" data-testid="nowebgl-note">
          {glError ? 'The 3D sky stopped, so this is the flat star chart.' : 'Flat star chart: this browser cannot draw the 3D sky.'}
        </span>
      )}
    </>
  );

  const usingGl = gl && !glError;
  const kinds = useMemo(() => new Map(orrery.bodies.map((b) => [b.name, b.kind])), [orrery]);
  const chartTables = useMemo(() => orrery.bodies.map((b) => ({ name: b.name, isHidden: b.hidden })), [orrery]);
  const chartRels = useMemo(() => orrery.trails.map((t) => t.rel), [orrery]);

  const stage = (
    <div className="absolute inset-0" data-testid="orrery" data-lens={lens} data-focus={activeFocus ?? ''} data-mode={usingGl ? 'webgl' : 'chart'}>
      {orrery.bodies.length === 0 ? (
        <StageMessage icon={<Orbit />} title="An empty sky">
          {meta.sections.tables.ok ? 'This model returned no tables.' : 'Table metadata could not be read for this model.'}
        </StageMessage>
      ) : usingGl ? (
        <GlBoundary onError={setGlError}>
          <Suspense fallback={<SkyLoading label="Loading the 3D sky…" />}>
            <OrreryCanvas
              orrery={orrery}
              looks={looks}
              focus={activeFocus}
              reduced={reduced}
              paused={paused}
              onPick={(id) => setFocus(id)}
              onError={setGlError}
              apiRef={api}
            />
          </Suspense>
          <SkyControls
            paused={paused}
            reduced={reduced}
            onPause={() => setPaused((v) => !v)}
            onZoom={(f) => api.current?.zoom(f)}
            onReset={() => (activeFocus ? setFocus(null) : api.current?.overview())}
            onHelp={() => setHelp(true)}
          />
        </GlBoundary>
      ) : (
        <>
          <StarChart
            fill
            tables={chartTables}
            relationships={chartRels}
            kinds={kinds}
            selected={focusTable}
            onSelect={(name) => setFocus(name ? tableId(name) : null)}
            paint={(name) => {
              const l = looks.bodies.get(tableId(name));
              return l ? { fill: `var(${l.paint})`, flare: l.flare, ghost: l.ghost } : undefined;
            }}
            edgeStroke={(i) => {
              const t = looks.trails.get(relId(meta.relationships.indexOf(chartRels[i])));
              return t?.strong ? `var(${t.paint})` : undefined;
            }}
          />
        </>
      )}
    </div>
  );

  return (
    <>
      <StagePage
        label="Model sky: tables as stars and planets, measures as moons"
        view={view}
        background={SKY_BG}
        breadcrumb={breadcrumb}
        title={activeFocus ? <span className="break-words">{focusTitle}</span> : <ModelTitle />}
        meta={metaLine}
        topRight={
          <>
            <FlyTo inputRef={flyInput} meta={meta} orrery={orrery} onFly={flyTo} glass={view === 'stage'} />
            {view === 'list' && <ViewAsSwitch options={VIEW_AS} value={viewAs} onChange={setViewAs} label="View as" glass={false} />}
            <ViewToggle value={view} onChange={setView} stageLabel="Sky" stageIcon={<Orbit />} glass={view === 'stage'} />
          </>
        }
        lenses={<LensBar lenses={LENSES} value={lens} onChange={setLens} />}
        legend={
          <Legend
            title={
              <span className="inline-flex items-center gap-2">
                {lensLabel(lens)}
                {lens === 'size' && rows.loading && <span className="normal-case tracking-normal text-faint">weighing…</span>}
              </span>
            }
            items={legend}
            collapsible
            defaultOpen={desktop}
            key={desktop ? 'd' : 'm'}
          />
        }
        bottomRight={<ViewAsSwitch options={VIEW_AS} value={viewAs} onChange={setViewAs} label="View as" />}
        side={
          <TodayPanel
            bare
            items={today}
            date={todayDate()}
            activeId={activeToday}
            empty="Clear skies: every rule that could run passed."
            onSelect={(it) => {
              const e = entries.find((x) => x.id === it.id);
              if (e) setParam({ focus: e.focus, lens: e.lens === 'weather' ? null : e.lens });
            }}
          />
        }
        sideCount={today.length}
        stage={stage}
        list={<SkyList meta={meta} orrery={orrery} flares={flares} looks={looks} rows={rows.counts} onShow={(id) => (setFocus(id), setView('stage'))} />}
      >
        {view === 'stage' && rows.error && lens === 'size' && (
          <p className="m-0 text-sm text-muted">Row counts failed: {rows.error.message}</p>
        )}
      </StagePage>
      <ShortcutsDialog open={help} onClose={() => setHelp(false)} />
    </>
  );
}

/* ------------------------------------------------------------------ helpers */

/** "Sales system · 1 loose table", "4 star systems · 8 loose tables". */
function skyLabel(o: Orrery): string {
  const stars = o.systems.filter((s) => s.kind === 'star');
  const loose = o.bodies.filter((b) => b.kind === 'rogue').length;
  const head = stars.length === 0 ? 'No relationships' : stars.length === 1 ? stars[0].name : `${stars.length} star systems`;
  return loose ? `${head} · ${loose} loose table${loose === 1 ? '' : 's'}` : head;
}

function objectExists(o: Orrery, id: string): boolean {
  const ref = parseObjectId(id);
  if (!ref) return false;
  if (ref.kind === 'table') return o.byName.has(ref.table);
  if (ref.kind === 'measure') return o.moons.some((m) => m.id === id);
  return o.trails.some((t) => t.index === ref.index);
}

/** Exact table, exact measure, then the first table or measure containing the text. */
function findObject(meta: ModelMetadata, o: Orrery, q: string): string | null {
  const s = q.trim().toLowerCase().replace(/\s+·\s+measure on .*$/, '');
  if (!s) return null;
  const table = o.bodies.find((b) => b.name.toLowerCase() === s) ?? null;
  if (table) return table.id;
  const moon = o.moons.find((m) => m.name.toLowerCase() === s);
  if (moon) return moon.id;
  const t2 = o.bodies.find((b) => b.name.toLowerCase().includes(s));
  if (t2) return t2.id;
  const m2 = o.moons.find((m) => m.name.toLowerCase().includes(s));
  if (m2) return m2.id;
  void meta;
  return null;
}

class GlBoundary extends Component<{ children: ReactNode; onError: (m: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError(error.message || 'The 3D sky failed to start.');
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function FlyTo({
  inputRef,
  meta,
  orrery,
  onFly,
  glass,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  meta: ModelMetadata;
  orrery: Orrery;
  onFly: (q: string) => boolean;
  glass: boolean;
}) {
  const [q, setQ] = useState('');
  const [miss, setMiss] = useState(false);
  const listId = 'fly-to-options';
  void meta;
  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        const ok = onFly(q);
        setMiss(!ok);
        if (ok) {
          setQ('');
          inputRef.current?.blur();
        }
      }}
    >
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 z-[1] size-4 -translate-y-1/2 text-faint" />
      <label htmlFor="fly-to" className="sr-only">
        Fly to a table or measure
      </label>
      <input
        ref={inputRef}
        id="fly-to"
        list={listId}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setMiss(false);
        }}
        placeholder="Fly to…"
        autoComplete="off"
        aria-invalid={miss || undefined}
        data-testid="fly-to"
        className={cx(
          'x-control h-8 w-40 rounded-full pr-8 pl-8 text-ui outline-none sm:w-48',
          glass && 'x-glass border-0',
          miss && 'ring-2 ring-bad-solid',
        )}
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 font-mono text-[10px] text-faint md:block">/</kbd>
      <datalist id={listId}>
        {orrery.bodies.map((b) => (
          <option key={b.id} value={b.name}>
            {kindShort(b)}
          </option>
        ))}
        {orrery.moons.map((m) => (
          <option key={m.id} value={m.name}>
            {`Measure on ${m.table}`}
          </option>
        ))}
      </datalist>
    </form>
  );
}

function SkyControls({
  paused,
  reduced,
  onPause,
  onZoom,
  onReset,
  onHelp,
}: {
  paused: boolean;
  reduced: boolean;
  onPause: () => void;
  onZoom: (f: number) => void;
  onReset: () => void;
  onHelp: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Camera"
      className="x-glass pointer-events-auto absolute bottom-[76px] hidden flex-col gap-0.5 rounded-full! p-1 md:flex"
      style={{ right: 'calc(16px + var(--side-w, 0px))' }}
    >
      <IconButton size="sm" label="Zoom in" icon={<Plus />} onClick={() => onZoom(0.8)} />
      <IconButton size="sm" label="Zoom out" icon={<Minus />} onClick={() => onZoom(1.25)} />
      <IconButton size="sm" label="Whole sky (0)" icon={<Locate />} onClick={onReset} />
      {!reduced && <IconButton size="sm" label={paused ? 'Resume orbits (P)' : 'Pause orbits (P)'} icon={paused ? <Play /> : <Pause />} onClick={onPause} />}
      <IconButton size="sm" label="Keyboard shortcuts (?)" icon={<Keyboard />} onClick={onHelp} />
    </div>
  );
}

/* ------------------------------------------------------------------ focus card */

function Stat2({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="x-legend-label text-faint">{label}</div>
      <div className="font-mono text-sm font-semibold text-fg num">{value}</div>
    </div>
  );
}

function FocusCard({
  id,
  meta,
  orrery,
  flares,
  looks,
  rows,
  onFocus,
  onWeigh,
  weighing,
}: {
  id: string;
  meta: ModelMetadata;
  orrery: Orrery;
  flares: FlareMap;
  looks: Looks;
  rows: Map<string, number> | null;
  onFocus: (id: string | null) => void;
  onWeigh: () => void;
  weighing: boolean;
}) {
  const ref = parseObjectId(id)!;
  let body: ReactNode = null;
  if (ref.kind === 'table') {
    const b = orrery.byName.get(ref.table)!;
    const info = meta.tables.find((t) => t.name === ref.table);
    const own = flares.get(tableId(ref.table)) ?? [];
    // Measure flares are summed per reason ("5 moons: No description") so the card stays short.
    const moonNotes = new Map<string, { severity: string; count: number }>();
    for (const m of meta.measures.filter((x) => x.table === ref.table))
      for (const f of flares.get(measureId(m.table, m.name)) ?? []) {
        const e = moonNotes.get(f.note);
        moonNotes.set(f.note, { severity: e?.severity === 'warning' ? 'warning' : f.severity, count: (e?.count ?? 0) + 1 });
      }
    const lines = [
      ...own.map((f) => ({ severity: f.severity as string, text: f.note })),
      ...[...moonNotes.entries()].map(([note, e]) => ({ severity: e.severity, text: `${e.count} moon${e.count === 1 ? '' : 's'}: ${note.toLowerCase()}` })),
    ];
    const n = rows?.get(ref.table);
    const links = orrery.trails.filter((t) => t.from === b.name || t.to === b.name);
    body = (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <BodyGlyph kind={b.kind} hidden={b.hidden} />
          <span className="text-fg">{kindLabel(b)}</span>
          {b.hidden && <Badge tone="neutral" size="sm">Hidden</Badge>}
        </div>
        {info?.description ? <p className="m-0 line-clamp-2 text-ui text-muted">{info.description}</p> : <p className="m-0 text-ui text-faint">No description.</p>}
        <div className="grid grid-cols-4 gap-3 border-t border-line pt-2.5">
          <Stat2
            label="Rows"
            value={
              n !== undefined ? (
                compactNumber(n)
              ) : (
                <button type="button" className="cursor-pointer border-0 bg-transparent p-0 font-mono text-sm font-semibold text-brand-text hover:underline" onClick={onWeigh} disabled={weighing}>
                  {weighing ? '…' : 'Count'}
                </button>
              )
            }
          />
          <Stat2 label="Columns" value={b.columns ?? '–'} />
          <Stat2 label="Moons" value={orrery.moons.filter((m) => m.table === b.name).length} />
          <Stat2 label="Trails" value={links.length} />
        </div>
        {lines.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-ui" aria-label="Space weather on this table">
            {lines.slice(0, 4).map((f, i) => (
              <li key={i} className="flex min-w-0 items-center gap-2">
                <span className={cx('size-1.5 shrink-0 rounded-full', f.severity === 'warning' ? 'bg-warn-solid' : 'bg-info-solid')} aria-hidden="true" />
                <span className="truncate text-fg">{f.text}</span>
              </li>
            ))}
            {lines.length > 4 && <li className="text-xs text-muted">and {lines.length - 4} more</li>}
          </ul>
        )}
        <div className="flex flex-wrap gap-1.5">
          <LinkButton size="sm" to={`/field-guide?table=${encodeURIComponent(b.name)}`}>
            Field guide
          </LinkButton>
          <LinkButton size="sm" variant="ghost" to={`/star-chart?table=${encodeURIComponent(b.name)}`}>
            Star chart
          </LinkButton>
        </div>
      </>
    );
  } else if (ref.kind === 'measure') {
    const m = meta.measures.find((x) => x.table === ref.table && x.name === ref.measure)!;
    const cov = measureCoverage(m);
    const fl = flares.get(measureId(m.table, m.name)) ?? [];
    body = (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <BodyGlyph kind="moon" color={`var(${looks.moons.get(id)?.paint ?? '--gray-10'})`} />
          <span className="text-fg">Moon · measure on</span>
          <button type="button" className="cursor-pointer rounded border-0 bg-transparent p-0 font-medium text-brand-text hover:underline" onClick={() => onFocus(tableId(m.table))}>
            {m.table}
          </button>
          {m.isHidden && <Badge tone="neutral" size="sm">Hidden</Badge>}
        </div>
        {m.description ? <p className="m-0 line-clamp-2 text-ui text-muted">{m.description}</p> : <p className="m-0 text-ui text-faint">No description.</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ui">
          <Badge tone={cov === 'complete' ? 'ok' : cov === 'missing-both' ? 'bad' : 'warn'} size="sm">
            {COVERAGE_LABEL[cov]}
          </Badge>
          <span className="text-muted">
            Format <code className="x-mono text-fg">{m.formatString || '(none)'}</code>
          </span>
          {fl.length > 0 && <span className="text-muted">{fl.length} flare{fl.length === 1 ? '' : 's'}</span>}
        </div>
        {m.expression?.trim() && <Dax code={m.expression.trim()} compact className="max-h-28 overflow-auto" />}
      </>
    );
  } else {
    const r = meta.relationships[ref.index];
    const fl = flares.get(relId(ref.index)) ?? [];
    body = (
      <>
        <div className="text-fg">Trail · relationship</div>
        <p className="m-0 font-mono text-[12px] leading-5 break-words text-muted">
          {r.fromTable}[{r.fromColumn}] → {r.toTable}[{r.toColumn}]
        </p>
        <div className="flex flex-wrap items-center gap-2 text-ui">
          <Badge tone={r.isActive ? 'ok' : 'info'} size="sm">
            {r.isActive ? 'Active' : 'Inactive'}
          </Badge>
          <span className="text-muted">{cardinalityLabel(r.cardinality)}</span>
          <span className="text-muted">{crossFilterLabel(r.crossFilter)}</span>
        </div>
        {fl.map((f, i) => (
          <div key={i} className="flex items-center gap-2 text-ui">
            <SeverityChip severity={f.severity} />
            <span className="text-fg">{f.note}</span>
          </div>
        ))}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => onFocus(tableId(r.fromTable))}>
            {r.fromTable}
          </Button>
          <Button size="sm" onClick={() => onFocus(tableId(r.toTable))}>
            {r.toTable}
          </Button>
        </div>
      </>
    );
  }
  return (
    <div className="mt-1 flex w-full min-w-0 flex-col gap-2.5" data-testid="focus-card">
      {body}
    </div>
  );
}

/* ------------------------------------------------------------------ list view */

function SkyList({
  meta,
  orrery,
  flares,
  looks,
  rows,
  onShow,
}: {
  meta: ModelMetadata;
  orrery: Orrery;
  flares: FlareMap;
  looks: Looks;
  rows: Map<string, number> | null;
  onShow: (id: string) => void;
}) {
  const ordered = [...orrery.bodies].sort(
    (a, b) => a.system - b.system || (a.kind === 'sun' ? -1 : 0) - (b.kind === 'sun' ? -1 : 0) || a.depth - b.depth || a.name.localeCompare(b.name),
  );
  return (
    <div className="space-y-8">
      <section aria-labelledby="bodies-h">
        <h2 id="bodies-h" className="m-0 mb-3 text-base font-semibold">
          Tables <span className="font-normal text-muted num">{orrery.bodies.length}</span>
        </h2>
        <TableWrap label="Tables in the sky">
          <Table data-testid="system-list">
            <thead>
              <tr>
                <Th>Table</Th>
                <Th>Body</Th>
                <Th>System</Th>
                <Th>Orbits</Th>
                <Th numeric>Rows</Th>
                <Th numeric>Columns</Th>
                <Th numeric>Measures</Th>
                <Th numeric>Trails</Th>
                <Th>Weather</Th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((b) => {
                const w = tableWeather(flares, meta, b.name);
                const n = rows?.get(b.name);
                return (
                  <Tr key={b.id} data-testid="system-row">
                    <Td>
                      <button
                        type="button"
                        className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left font-medium text-fg hover:text-brand-text"
                        onClick={() => onShow(b.id)}
                        aria-label={`Show ${b.name} in the sky`}
                      >
                        <BodyGlyph kind={b.kind} hidden={b.hidden} color={b.kind === 'sun' ? undefined : `var(${looks.bodies.get(b.id)?.paint ?? '--gray-9'})`} />
                        <span className={cx(b.hidden && 'italic text-muted')}>{b.name}</span>
                      </button>
                    </Td>
                    <Td muted>{kindShort(b)}</Td>
                    <Td muted>{orrery.systems[b.system].name}</Td>
                    <Td muted>{b.kind === 'planet' ? (b.parent ?? b.host) : b.kind === 'shared' ? b.hosts.join(', ') : '–'}</Td>
                    <Td numeric>{n !== undefined ? n.toLocaleString() : '–'}</Td>
                    <Td numeric>{b.columns ?? '–'}</Td>
                    <Td numeric>{orrery.moons.filter((m) => m.table === b.name).length}</Td>
                    <Td numeric>{b.links}</Td>
                    <Td>
                      {w.severity ? (
                        <Badge tone={w.severity === 'warning' ? 'warn' : 'info'} size="sm">
                          {w.count} flare{w.count === 1 ? '' : 's'}
                        </Badge>
                      ) : (
                        <span className="text-muted">Clear</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      </section>
      <section aria-labelledby="trails-h">
        <h2 id="trails-h" className="m-0 mb-3 text-base font-semibold">
          Relationships <span className="font-normal text-muted num">{orrery.trails.length}</span>
        </h2>
        {orrery.trails.length === 0 ? (
          <p className="m-0 text-sm text-muted">{meta.sections.relationships.ok ? 'No relationships: every table drifts alone.' : 'Relationship metadata is not available for this model.'}</p>
        ) : (
          <TableWrap label="Relationships">
            <Table>
              <thead>
                <tr>
                  <Th>From</Th>
                  <Th>To</Th>
                  <Th>Cardinality</Th>
                  <Th>Filter</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {orrery.trails.map((t) => (
                  <Tr key={t.id}>
                    <Td>
                      <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left text-fg hover:text-brand-text" onClick={() => onShow(t.id)}>
                        <strong className="font-medium">{t.from}</strong>
                        <span className="text-muted">[{t.rel.fromColumn}]</span>
                      </button>
                    </Td>
                    <Td>
                      <strong className="font-medium">{t.to}</strong>
                      <span className="text-muted">[{t.rel.toColumn}]</span>
                    </Td>
                    <Td muted>{cardinalityLabel(t.rel.cardinality)}</Td>
                    <Td>{t.both ? <Badge tone="warn" size="sm">Both directions</Badge> : <span className="text-muted">Single</span>}</Td>
                    <Td>{t.active ? <Badge tone="ok" size="sm">Active</Badge> : <Badge tone="info" size="sm">Inactive</Badge>}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </section>
      <ReloadRow />
    </div>
  );
}

function ReloadRow() {
  return (
    <div className="flex items-center gap-2 text-ui text-muted">
      <ReloadButton /> Reload metadata
    </div>
  );
}
