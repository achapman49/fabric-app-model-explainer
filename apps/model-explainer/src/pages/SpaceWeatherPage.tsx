/**
 * Health: the score as the headline (a ring), tiles for the numbers behind it and the checklist's progress, then a
 * checklist with one item per object a rule flags, to tick off while fixing the model. Ticks are remembered per model
 * in this browser.
 */
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { CircleCheck, CircleDashed, HeartPulse, Info, ListChecks, Network, OctagonAlert, RotateCcw, TriangleAlert } from 'lucide-react';

import { Button, cx, EmptyState, LinkButton, ProgressRing, Switch, useReducedMotion } from '@x10/shared/ui';

import { SeverityChip, ToolHeader, WithMetadata } from '../components/common';
import { RULES } from '../config/rules';
import { buildChecklist, healthIndicators, progress, type ChecklistGroup, type Indicator, type IndicatorStatus } from '../domain/checklist';
import { evaluateHealth, SCORE_FORMULA, type Severity } from '../domain/findings';
import { SECTION_LABELS, type ModelMetadata } from '../domain/types';
import { useChecklistTicks } from '../state/useChecklistTicks';

const S = RULES.score;
/** Items shown per group before "Show N more". */
const GROUP_PREVIEW = 8;

export function SpaceWeatherPage() {
  return <WithMetadata>{(meta) => <Health meta={meta} />}</WithMetadata>;
}

/** Status colours: the fill is the solid step, the track a lighter step of the same ramp. Text stays in text tokens. */
const TONE: Record<IndicatorStatus, { fill: string; track: string; icon: string; Icon: ComponentType<{ className?: string }> }> = {
  ok: { fill: 'var(--ok-solid)', track: 'var(--ok-soft)', icon: 'text-ok-text', Icon: CircleCheck },
  info: { fill: 'var(--info-solid)', track: 'var(--info-soft)', icon: 'text-info-text', Icon: Info },
  warn: { fill: 'var(--warn-solid)', track: 'var(--warn-soft)', icon: 'text-warn-text', Icon: TriangleAlert },
  bad: { fill: 'var(--bad-solid)', track: 'var(--bad-soft)', icon: 'text-bad-text', Icon: OctagonAlert },
  unknown: { fill: 'var(--gray-8)', track: 'var(--gray-4)', icon: 'text-faint', Icon: CircleDashed },
};

function Bar({ ratio, fill, track, label, thin }: { ratio: number; fill: string; track: string; label: string; thin?: boolean }) {
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${pct}%`}
      className={cx('w-full overflow-hidden rounded-full', thin ? 'h-1' : 'h-1.5')}
      style={{ background: track }}
    >
      <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${pct}%`, background: fill }} />
    </div>
  );
}

function Health({ meta }: { meta: ModelMetadata }) {
  const h = useMemo(() => evaluateHealth(meta), [meta]);
  const indicators = useMemo(() => healthIndicators(meta, h), [meta, h]);
  const groups = useMemo(() => buildChecklist(meta, h), [meta, h]);
  const { done, toggle, reset } = useChecklistTicks(meta.modelLabel);
  const [hideDone, setHideDone] = useState(false);
  const reducedMotion = useReducedMotion();
  const overall = progress(groups, done);
  const deductW = Math.min(S.warningCap, h.warnings * S.perWarning);
  const deductI = Math.min(S.infoCap, h.infos * S.perInfo);
  const sections: { severity: Severity; title: string; points: string }[] = [
    { severity: 'warning', title: 'Warnings', points: `−${S.perWarning} each, at most −${S.warningCap}` },
    { severity: 'info', title: 'Info', points: `−${S.perInfo} each, at most −${S.infoCap}` },
  ];

  const jumpTo = (elementId: string) => {
    const el = document.getElementById(elementId);
    el?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    el?.focus({ preventScroll: true });
  };

  return (
    <>
      <ToolHeader icon={<HeartPulse />} tool="Health" title="Health findings" />

      {/* The score is the headline; the tiles are the numbers behind it. */}
      <section aria-label="Health indicators" data-testid="health-indicators">
        <ScoreHero indicator={indicators.find((i) => i.id === 'score')!} score={h.score}>
          <p className="m-0 mt-3 font-mono text-sm text-fg num" data-testid="score-calculation">
            This model: {S.start} − {deductW} ({h.warnings} warning{h.warnings === 1 ? '' : 's'}) − {deductI} ({h.infos} info) = {h.score}.
          </p>
          <p className="m-0 mt-1 max-w-[70ch] text-xs text-muted" data-testid="score-formula">
            {SCORE_FORMULA}
          </p>
        </ScoreHero>
        <ul className="m-0 mt-3 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {indicators
            .filter((i) => i.id !== 'score')
            .map((i) => {
              const rule = i.rules.find((r) => groups.some((g) => g.rule === r));
              return <IndicatorTile key={i.id} indicator={i} onJump={rule ? () => jumpTo(`check-${rule}`) : undefined} />;
            })}
          <ChecklistTile done={overall.done} total={overall.total} onJump={() => jumpTo('checklist')} />
        </ul>
      </section>

      {h.skipped.length > 0 && (
        <p className="mt-6 mb-0 border-l-2 border-warn-solid pl-3 text-sm text-muted" role="note">
          <strong className="text-fg">
            {h.skipped.length} rule{h.skipped.length === 1 ? ' was' : 's were'} skipped
          </strong>{' '}
          because some metadata is not available: {h.skipped.map((s) => `${s.rule.title} (needs ${s.missing.map((k) => SECTION_LABELS[k]).join(', ')})`).join('; ')}. The score counts only rules that ran.
        </p>
      )}

      {/* Checklist */}
      <section id="checklist" tabIndex={-1} className="mt-10 scroll-mt-24 outline-none" aria-labelledby="checklist-h" data-testid="checklist">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line pb-4">
          <div className="min-w-0">
            <h2 id="checklist-h" className="m-0 flex items-center gap-2 text-lg font-semibold">
              <ListChecks className="size-5 text-[var(--accent-11)]" aria-hidden="true" />
              Checklist
            </h2>
            <p className="m-0 mt-1 max-w-[70ch] text-sm text-muted">
              One item per object a rule flags. Fix it in the model, tick it off here; items disappear once the fix is in and the metadata is reloaded. Ticks are saved in this browser only.
            </p>
          </div>
          {overall.total > 0 && (
            <div className="flex w-full flex-col gap-2 sm:w-72">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted">Done</span>
                <span className="font-medium num" data-testid="checklist-progress">
                  {overall.done} of {overall.total}
                </span>
              </div>
              <Bar ratio={overall.total ? overall.done / overall.total : 0} fill="var(--accent-9)" track="var(--accent-3)" label="Checklist done" />
              <div className="flex items-center justify-between gap-3 text-xs text-muted">
                <label className="flex cursor-pointer items-center gap-2">
                  <Switch size="sm" checked={hideDone} onChange={setHideDone} label="Hide done items" />
                  Hide done
                </label>
                <Button size="sm" variant="ghost" icon={<RotateCcw aria-hidden="true" />} onClick={reset} disabled={!overall.done}>
                  Clear ticks
                </Button>
              </div>
            </div>
          )}
        </div>

        {groups.length === 0 ? (
          <EmptyState title="Nothing to do" icon={<CircleCheck />}>
            Every rule that could run passed.
          </EmptyState>
        ) : (
          sections.map((sec) => {
            const list = groups.filter((g) => g.severity === sec.severity);
            if (!list.length) return null;
            return (
              <section key={sec.severity} className="mb-8" aria-labelledby={`h-${sec.severity}`}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 id={`h-${sec.severity}`} className="m-0 text-base font-semibold">
                    {sec.title} ({list.length})
                  </h3>
                  <span className="font-mono text-xs text-muted">{sec.points}</span>
                </div>
                <div className="space-y-3">
                  {list.map((g) => (
                    <GroupCard key={g.rule} group={g} done={done} hideDone={hideDone} onToggle={toggle} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </section>

      {h.passed.length > 0 && (
        <section aria-labelledby="h-passed" className="mt-4">
          <h2 id="h-passed" className="m-0 mb-1 text-base font-semibold">
            Passed checks ({h.passed.length})
          </h2>
          <ul className="m-0 list-none divide-y divide-[var(--line)] border-y border-line p-0" data-testid="passed-rules">
            {h.passed.map((r) => (
              <li key={r.id} className="grid gap-x-6 gap-y-0.5 py-2.5 text-sm md:grid-cols-[minmax(220px,1fr)_2fr]">
                <span className="flex items-center gap-2 font-medium">
                  <CircleCheck className="size-4 shrink-0 text-ok-text" aria-hidden="true" />
                  {r.title}
                </span>
                <span className="text-muted">{r.condition}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** The headline: the score inside a ring in its status colour, with its status in words and the breakdown beside it. */
function ScoreHero({ indicator: i, score, children }: { indicator: Indicator; score: number; children: ReactNode }) {
  const tone = TONE[i.status];
  const ringTone = i.status === 'ok' || i.status === 'warn' || i.status === 'bad' ? i.status : 'brand';
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-xl border border-line bg-surface p-5" data-testid="indicator-score" data-status={i.status}>
      <ProgressRing value={score} size={152} thickness={11} tone={ringTone} label={`Health score ${score} out of 100`}>
        <span className="flex flex-col items-center">
          <span className="text-5xl leading-none font-semibold tracking-[-0.03em] num" data-testid="health-score">
            {score}
          </span>
          <span className="mt-1 font-mono text-xs text-muted">/ 100</span>
        </span>
      </ProgressRing>
      <div className="min-w-[220px] flex-1">
        <p className="m-0 text-sm text-muted">Health score</p>
        <p className="m-0 mt-1 flex items-center gap-2 text-2xl font-semibold tracking-[-0.01em]">
          <tone.Icon className={cx('size-6', tone.icon)} aria-hidden="true" />
          {i.statusLabel}
        </p>
        <p className="m-0 mt-1 text-sm text-muted">{i.hint}</p>
        {children}
      </div>
    </div>
  );
}

/** Checklist progress as a tile, so the dashboard also says how much is done. */
function ChecklistTile({ done, total, onJump }: { done: number; total: number; onJump: () => void }) {
  const complete = total > 0 && done === total;
  const tone = complete ? TONE.ok : null;
  return (
    <li data-testid="indicator-checklist">
      <button
        type="button"
        onClick={onJump}
        className={cx(TILE, 'w-full cursor-pointer transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--row-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none')}
        aria-label={`Checklist: ${done} of ${total} done. Go to the checklist.`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm text-muted">Checklist</span>
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-fg">
            {tone ? <tone.Icon className={cx('size-3.5', tone.icon)} aria-hidden="true" /> : <ListChecks className="size-3.5 text-[var(--accent-11)]" aria-hidden="true" />}
            {total === 0 ? 'Nothing to do' : complete ? 'All done' : 'To do'}
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-3xl leading-none font-semibold tracking-[-0.02em] num">{done}</span>
          <span className="text-sm text-muted num">of {total} done</span>
        </div>
        {total > 0 && (
          <div className="mt-3">
            <Bar ratio={done / total} fill={tone ? tone.fill : 'var(--accent-9)'} track={tone ? tone.track : 'var(--accent-3)'} label="Checklist done" />
          </div>
        )}
        <p className="m-0 mt-auto pt-3 text-xs text-muted">Items ticked off in this browser</p>
      </button>
    </li>
  );
}

const TILE = 'flex h-full flex-col rounded-xl border border-line bg-surface p-4 text-left';

/** A stat tile: label and status (icon + words), the figure, a meter for shares, and a one-line hint. */
function IndicatorTile({ indicator: i, onJump }: { indicator: Indicator; onJump?: () => void }) {
  const tone = TONE[i.status];
  const body: ReactNode = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted">{i.label}</span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-fg">
          <tone.Icon className={cx('size-3.5', tone.icon)} aria-hidden="true" />
          {i.statusLabel}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-3xl leading-none font-semibold tracking-[-0.02em] num">{i.value}</span>
        {i.unit && <span className="text-sm text-muted num">{i.unit}</span>}
      </div>
      {i.ratio !== null && (
        <div className="mt-3">
          <Bar ratio={i.ratio} fill={tone.fill} track={tone.track} label={i.label} />
        </div>
      )}
      <p className="m-0 mt-auto pt-3 text-xs text-muted">{i.hint}</p>
    </>
  );
  return (
    <li data-testid={`indicator-${i.id}`} data-status={i.status}>
      {onJump ? (
        <button
          type="button"
          onClick={onJump}
          className={cx(TILE, 'w-full cursor-pointer transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--row-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none')}
          aria-label={`${i.label}: ${i.value}${i.unit ? ` ${i.unit}` : ''}, ${i.statusLabel}. Go to its checklist items.`}
        >
          {body}
        </button>
      ) : (
        <div className={TILE}>{body}</div>
      )}
    </li>
  );
}

function GroupCard({
  group: g,
  done,
  hideDone,
  onToggle,
}: {
  group: ChecklistGroup;
  done: ReadonlySet<string>;
  hideDone: boolean;
  onToggle: (id: string, on: boolean) => void;
}) {
  const [all, setAll] = useState(false);
  const count = g.items.filter((i) => done.has(i.id)).length;
  const complete = count === g.items.length;
  const visible = hideDone ? g.items.filter((i) => !done.has(i.id)) : g.items;
  const shown = all ? visible : visible.slice(0, GROUP_PREVIEW);

  return (
    <article id={`check-${g.rule}`} tabIndex={-1} className="scroll-mt-24 rounded-xl border border-line bg-surface outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]" data-testid={`finding-${g.rule}`}>
      <header className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityChip severity={g.severity} />
            <h4 className="m-0 text-base font-semibold">{g.title}</h4>
          </div>
          <p className="m-0 mt-1.5 max-w-[80ch] text-sm text-muted">{g.advice}</p>
        </div>
        <div className="flex w-28 shrink-0 flex-col items-end gap-1.5 pt-0.5">
          <span className={cx('flex items-center gap-1 text-sm num', complete ? 'font-medium text-fg' : 'text-muted')}>
            {complete && <CircleCheck className="size-4 text-ok-text" aria-hidden="true" />}
            {count}/{g.items.length} done
          </span>
          <Bar ratio={g.items.length ? count / g.items.length : 0} fill="var(--accent-9)" track="var(--accent-3)" label={`${g.title}: done`} thin />
        </div>
      </header>
      <ul className="m-0 list-none divide-y divide-[var(--line)] border-t border-line p-0">
        {shown.map((it) => {
          const ticked = done.has(it.id);
          const id = `chk-${it.id}`;
          return (
            <li key={it.id} className="flex items-start gap-3 px-4 py-2.5" data-testid="checklist-item" data-done={ticked ? 'true' : 'false'}>
              <input id={id} type="checkbox" className="x-checkbox mt-1 shrink-0" checked={ticked} onChange={(e) => onToggle(it.id, e.target.checked)} />
              <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                <span className={cx('block text-sm break-words', ticked ? 'text-muted line-through' : 'font-medium text-fg')}>{it.action}</span>
                <span className="block text-xs break-words text-muted">{it.detail}</span>
              </label>
              <LinkButton size="sm" variant="ghost" to={`/?focus=${encodeURIComponent(it.target)}`} icon={<Network aria-hidden="true" />} aria-label={`Show in diagram: ${it.action}`}>
                Show
              </LinkButton>
            </li>
          );
        })}
        {hideDone && visible.length === 0 && (
          <li className="flex items-center gap-2 px-4 py-3 text-sm text-muted">
            <CircleCheck className="size-4 text-ok-text" aria-hidden="true" />
            All {g.items.length} done.
          </li>
        )}
      </ul>
      {visible.length > GROUP_PREVIEW && (
        <div className="border-t border-line px-4 py-2">
          <Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>
            {all ? 'Show fewer' : `Show ${visible.length - GROUP_PREVIEW} more`}
          </Button>
        </div>
      )}
      <p className="m-0 border-t border-line px-4 py-2 text-xs text-faint">Rule: {g.condition}</p>
    </article>
  );
}
