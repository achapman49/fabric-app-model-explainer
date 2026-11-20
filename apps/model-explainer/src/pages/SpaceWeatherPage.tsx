/** Space weather: the eight health rules, the score as a ring, and every finding with a way to fly to it. */
import { CloudSun, Orbit } from 'lucide-react';

import { Badge, cx, EmptyState, LinkButton, ProgressRing } from '@x10/shared/ui';

import { SeverityChip, ToolHeader, WithMetadata } from '../components/common';
import { RULES } from '../config/rules';
import { evaluateHealth, RULE_DEFS, SCORE_FORMULA, scoreLabel, scoreTone, type Finding, type HealthReport, type RuleId, type Severity } from '../domain/findings';
import { todayEntries } from '../domain/weather';
import { SECTION_LABELS, type ModelMetadata } from '../domain/types';

const MAX_OBJECTS = 12;
const S = RULES.score;

export function SpaceWeatherPage() {
  return <WithMetadata>{(meta) => <Weather meta={meta} />}</WithMetadata>;
}

type RuleState = 'warning' | 'info' | 'passed' | 'skipped';

function ruleState(h: HealthReport, id: RuleId): RuleState {
  const f = h.findings.find((x) => x.rule === id);
  if (f) return f.severity;
  if (h.skipped.some((s) => s.rule.id === id)) return 'skipped';
  return 'passed';
}

const STATE_DOT: Record<RuleState, string> = {
  warning: 'bg-warn-solid',
  info: 'bg-info-solid',
  passed: 'bg-ok-solid',
  skipped: 'bg-gray-7',
};
const STATE_LABEL: Record<RuleState, string> = { warning: 'Warning', info: 'Info', passed: 'Passed', skipped: 'Skipped' };

function Weather({ meta }: { meta: ModelMetadata }) {
  const h = evaluateHealth(meta);
  const tone = scoreTone(h.score);
  const focusFor = new Map(todayEntries(meta, h, 99).map((e) => [e.id, e]));
  const groups: { severity: Severity; title: string; points: string }[] = [
    { severity: 'warning', title: 'Warnings', points: `−${S.perWarning} each, at most −${S.warningCap}` },
    { severity: 'info', title: 'Info', points: `−${S.perInfo} each, at most −${S.infoCap}` },
  ];
  const deductW = Math.min(S.warningCap, h.warnings * S.perWarning);
  const deductI = Math.min(S.infoCap, h.infos * S.perInfo);

  return (
    <>
      <ToolHeader icon={<CloudSun />} tool="Space weather" title="Health findings" />

      <section className="mb-10 grid items-center gap-x-10 gap-y-6 border-b border-line pb-8 md:grid-cols-[auto_minmax(0,1fr)]" aria-label="Score">
        <div className="flex items-center gap-5">
          <ProgressRing value={h.score} size={128} thickness={10} tone={tone} label={`Health score ${h.score} out of 100`}>
            <span className="flex flex-col items-center">
              <span className={cx('text-4xl font-semibold tracking-[-0.03em] num', tone === 'ok' ? 'text-ok-text' : tone === 'warn' ? 'text-warn-text' : 'text-bad-text')} data-testid="health-score">
                {h.score}
              </span>
              <span className="font-mono text-[11px] text-muted">/ 100</span>
            </span>
          </ProgressRing>
          <div className="md:hidden">
            <Badge tone={tone}>{scoreLabel(h.score)}</Badge>
          </div>
        </div>
        <div className="min-w-0">
          <div className="hidden md:block">
            <Badge tone={tone}>{scoreLabel(h.score)}</Badge>
          </div>
          <p className="m-0 mt-3 font-mono text-lg text-fg num" data-testid="score-calculation">
            This model: {S.start} − {deductW} ({h.warnings} warning{h.warnings === 1 ? '' : 's'}) − {deductI} ({h.infos} info) = {h.score}.
          </p>
          <p className="m-0 mt-1.5 max-w-[80ch] text-ui text-muted" data-testid="score-formula">
            {SCORE_FORMULA}
          </p>
          <ol className="m-0 mt-5 grid list-none grid-cols-2 gap-x-6 gap-y-2 p-0 sm:grid-cols-4" aria-label="Rules" data-testid="rule-board">
            {RULE_DEFS.map((r) => {
              const st = ruleState(h, r.id);
              return (
                <li key={r.id} className="flex min-w-0 items-start gap-2 text-ui" title={`${STATE_LABEL[st]}: ${r.condition}`}>
                  <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', STATE_DOT[st])} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block leading-5 text-fg">{r.title}</span>
                    <span className="x-legend-label text-faint">{STATE_LABEL[st]}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {h.skipped.length > 0 && (
        <p className="mt-0 mb-6 border-l-2 border-warn-solid pl-3 text-sm text-muted" role="note">
          <strong className="text-fg">
            {h.skipped.length} rule{h.skipped.length === 1 ? ' was' : 's were'} skipped
          </strong>{' '}
          because some metadata is not available: {h.skipped.map((s) => `${s.rule.title} (needs ${s.missing.map((k) => SECTION_LABELS[k]).join(', ')})`).join('; ')}. The score counts only rules that ran.
        </p>
      )}

      {h.findings.length === 0 && (
        <EmptyState title="Clear skies" icon={<CloudSun />}>
          Every rule that could run passed.
        </EmptyState>
      )}

      {groups.map((g) => {
        const list = h.findings.filter((f) => f.severity === g.severity);
        if (!list.length) return null;
        return (
          <section key={g.severity} className="mb-10" aria-labelledby={`h-${g.severity}`}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`h-${g.severity}`} className="m-0 text-base font-semibold">
                {g.title} ({list.length})
              </h2>
              <span className="font-mono text-xs text-muted">{g.points}</span>
            </div>
            <ul className="m-0 list-none divide-y divide-[var(--line)] border-y border-line p-0">
              {list.map((f) => (
                <FindingRow key={f.rule} f={f} focus={focusFor.get(f.rule)?.focus} lens={focusFor.get(f.rule)?.lens} />
              ))}
            </ul>
          </section>
        );
      })}

      {h.passed.length > 0 && (
        <section aria-labelledby="h-passed">
          <h2 id="h-passed" className="m-0 mb-1 text-base font-semibold">
            Passed ({h.passed.length})
          </h2>
          <ul className="m-0 list-none divide-y divide-[var(--line)] border-y border-line p-0" data-testid="passed-rules">
            {h.passed.map((r) => (
              <li key={r.id} className="grid gap-x-6 gap-y-0.5 py-2.5 text-sm md:grid-cols-[minmax(220px,1fr)_2fr]">
                <span className="flex items-center gap-2 font-medium">
                  <span className="size-2 rounded-full bg-ok-solid" aria-hidden="true" />
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

function FindingRow({ f, focus, lens }: { f: Finding; focus?: string; lens?: string }) {
  const def = RULE_DEFS.find((r) => r.id === f.rule)!;
  const shown = f.objects.slice(0, MAX_OBJECTS);
  const href = focus ? `/?focus=${encodeURIComponent(focus)}${lens && lens !== 'weather' ? `&lens=${lens}` : ''}` : '/';
  return (
    <li className="grid gap-x-8 gap-y-3 py-5 md:grid-cols-[minmax(0,1fr)_auto]" data-testid={`finding-${f.rule}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity={f.severity} />
          <h3 className="m-0 text-base font-semibold">{f.title}</h3>
        </div>
        <p className="m-0 mt-1.5">{f.summary}</p>
        <p className="m-0 mt-1 max-w-[80ch] text-sm text-muted">{f.advice}</p>
        {shown.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer font-medium text-muted hover:text-fg">Affected objects ({f.objects.length})</summary>
            <ul className="mb-0 mt-2 flex list-none flex-wrap gap-1.5 p-0">
              {shown.map((o) => (
                <li key={o} className="rounded-md bg-surface-sunken px-2 py-0.5 font-mono text-xs break-words">
                  {o}
                </li>
              ))}
              {f.objects.length > shown.length && <li className="px-1 text-xs text-muted">and {f.objects.length - shown.length} more</li>}
            </ul>
          </details>
        )}
        <p className="m-0 mt-2 text-xs text-faint">Rule: {def.condition}</p>
      </div>
      <div className="md:pt-0.5">
        <LinkButton size="sm" to={href} icon={<Orbit aria-hidden="true" />}>
          Show in the sky
        </LinkButton>
      </div>
    </li>
  );
}
