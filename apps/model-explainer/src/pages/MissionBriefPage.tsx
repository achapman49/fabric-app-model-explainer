/**
 * Summary: a printable one-pager for sharing a model, in this order: at a glance, the diagram, relationships, every
 * measure with its description and DAX, and the health alerts. The same content copies or downloads as Markdown.
 */
import { useMemo, type ReactNode } from 'react';
import { Download, FileText, ListChecks, Network, Printer } from 'lucide-react';

import { AppLogo } from '@x10/shared/runtime';
import { downloadText, formatDate } from '@x10/shared/lib';
import { Badge, Button, CopyButton, cx, LinkButton } from '@x10/shared/ui';

import { SeverityChip, ToolHeader, WithMetadata } from '../components/common';
import { Dax } from '../components/Dax';
import { SchemaSnapshot } from '../components/SchemaSnapshot';
import { evaluateHealth, SCORE_FORMULA, scoreLabel } from '../domain/findings';
import { buildMarkdown, cardinalityLabel, crossFilterLabel, measuresByTable } from '../domain/markdown';
import { EXPRESSIONS_HIDDEN_NOTE, expressionsHidden, hiddenObjectCount, isNumericMeasure } from '../domain/metadata';
import { tableRoles } from '../domain/model';
import { describeLink } from '../domain/schema';
import { SECTION_LABELS, type MeasureInfo, type ModelMetadata, type SectionKey } from '../domain/types';

/** Affected objects listed per alert before "and N more". */
const ALERT_OBJECTS = 12;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model';
}

export function MissionBriefPage() {
  return <WithMetadata>{(meta) => <Brief meta={meta} />}</WithMetadata>;
}

function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
      <h2 className="x-legend-label m-0 text-muted">{children}</h2>
      {action && <div className="x-noprint">{action}</div>}
    </div>
  );
}

function Brief({ meta }: { meta: ModelMetadata }) {
  const health = useMemo(() => evaluateHealth(meta), [meta]);
  const markdown = () => buildMarkdown(meta, health, new Date());
  const groups = useMemo(() => measuresByTable(meta), [meta]);
  const hiddenExpr = expressionsHidden(meta);
  const roles = useMemo(() => tableRoles(meta), [meta]);
  const unavailable = (Object.keys(meta.sections) as SectionKey[]).filter((k) => !meta.sections[k].ok);
  const n = (k: SectionKey, v: number) => (meta.sections[k].ok ? v.toLocaleString() : 'n/a');
  const facts = [...roles.entries()].filter(([, r]) => r === 'fact').map(([name]) => name);

  return (
    <>
      <ToolHeader
        icon={<FileText />}
        tool="Summary"
        title="Share this model"
        actions={
          <>
            <CopyButton text={markdown} label="Copy as Markdown" size="md" />
            <Button icon={<Download aria-hidden="true" />} onClick={() => downloadText(`${slug(meta.modelLabel)}-summary.md`, markdown(), 'text/markdown;charset=utf-8')}>
              Download .md
            </Button>
            <Button variant="primary" icon={<Printer aria-hidden="true" />} onClick={() => window.print()}>
              Print
            </Button>
          </>
        }
      />

      <article className="x-onepager mx-auto max-w-[1040px] rounded-2xl border border-line bg-surface p-6 shadow-1 md:p-10" data-testid="one-pager">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div className="min-w-0">
            <p className="x-legend-label m-0 text-muted">Summary · semantic model</p>
            <h1 className="m-0 mt-2 font-serif text-4xl leading-tight font-normal tracking-[-0.01em] break-words">{meta.modelLabel}</h1>
            <p className="m-0 mt-2 text-sm text-muted">
              Generated {formatDate(new Date().toISOString())} by Semantic Model Explainer.
              {facts.length > 0 && ` ${facts.length === 1 ? 'Fact table' : 'Fact tables'}: ${facts.join(', ')}.`}
            </p>
            {unavailable.length > 0 && <p className="m-0 mt-2 text-sm">Not available for this model: {unavailable.map((k) => SECTION_LABELS[k]).join(', ')}.</p>}
          </div>
          <AppLogo size={36} />
        </header>

        {/* At a glance */}
        <section className="mt-6">
          <dl className="m-0 grid grid-cols-3 gap-x-6 gap-y-4 sm:grid-cols-6">
            {[
              ['Tables', n('tables', meta.tables.length)],
              ['Columns', n('columns', meta.columns.length)],
              ['Measures', n('measures', meta.measures.length)],
              ['Relationships', n('relationships', meta.relationships.length)],
              ['Hidden', hiddenObjectCount(meta).toLocaleString()],
              ['Health', `${health.score}/100`],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0 border-l border-line pl-3">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="m-0 mt-0.5 font-mono text-xl font-semibold tracking-[-0.02em] num">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Diagram */}
        {roles.size > 0 && (
          <section className="mt-10" aria-labelledby="sum-diagram" data-testid="summary-diagram">
            <SectionTitle
              action={
                <LinkButton size="sm" variant="ghost" to="/" icon={<Network aria-hidden="true" />}>
                  Open the interactive diagram
                </LinkButton>
              }
            >
              Diagram
            </SectionTitle>
            <div className="rounded-xl border border-line bg-surface-sunken p-2">
              <SchemaSnapshot meta={meta} />
            </div>
            <p className="m-0 mt-2 text-xs text-muted">
              Each card lists a table's relationship keys (key mark), then columns and measures (Σ); long tables show the first few, and every measure is
              listed below. Arrows point the way filters flow (two arrowheads: both ways); dashed lines are inactive relationships; cards marked FACT are fact
              tables.
            </p>
          </section>
        )}

        {/* Relationships */}
        <section className="mt-10" aria-label="Relationships" data-testid="summary-relationships">
          <SectionTitle>{`Relationships${meta.sections.relationships.ok ? ` · ${meta.relationships.length}` : ''}`}</SectionTitle>
          {!meta.sections.relationships.ok ? (
            <p className="m-0 text-muted">Relationship metadata is not available for this model.</p>
          ) : meta.relationships.length === 0 ? (
            <p className="m-0 text-muted">This model has no relationships.</p>
          ) : (
            <ul className="m-0 list-none divide-y divide-[var(--line)] p-0 text-sm">
              {meta.relationships.map((r) => (
                <li key={r.name} className="grid gap-x-6 gap-y-0.5 py-2 break-inside-avoid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                  <span className="min-w-0 break-words">
                    {describeLink(r).replace(/ Inactive:.*$/, '')}
                    <span className="block font-mono text-xs text-muted">
                      {r.fromTable}[{r.fromColumn}] → {r.toTable}[{r.toColumn}]
                    </span>
                  </span>
                  <span className="flex flex-wrap items-start gap-x-2 gap-y-1 text-muted md:justify-end">
                    {cardinalityLabel(r.cardinality)} · {crossFilterLabel(r.crossFilter).toLowerCase()}
                    {!r.isActive && (
                      <Badge tone="info" size="sm">
                        Inactive
                      </Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Measures */}
        <section className="mt-10" aria-label="Measures" data-testid="summary-measures">
          <SectionTitle>{`Measures${meta.sections.measures.ok ? ` · ${meta.measures.length}` : ''}`}</SectionTitle>
          {!meta.sections.measures.ok ? (
            <p className="m-0 text-muted">Measure metadata is not available for this model.</p>
          ) : meta.measures.length === 0 ? (
            <p className="m-0 text-muted">This model has no measures.</p>
          ) : (
            <>
              {hiddenExpr && <p className="mt-0 text-sm">{EXPRESSIONS_HIDDEN_NOTE}</p>}
              {groups.map((g) => (
                <div key={g.table} className="mb-6 last:mb-0">
                  <h3 className="m-0 mb-1 text-base font-semibold">
                    {g.table} <span className="text-sm font-normal text-muted">· {g.measures.length}</span>
                  </h3>
                  <ul className="m-0 list-none divide-y divide-[var(--line)] p-0">
                    {g.measures.map((m) => (
                      <MeasureEntry key={m.name} m={m} hiddenExpr={hiddenExpr} />
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
        </section>

        {/* Health alerts */}
        <section className="mt-10" aria-label="Health alerts" data-testid="summary-alerts">
          <SectionTitle
            action={
              <LinkButton size="sm" variant="ghost" to="/space-weather" icon={<ListChecks aria-hidden="true" />}>
                Open the checklist
              </LinkButton>
            }
          >
            Health alerts
          </SectionTitle>
          <p className="m-0 text-sm">
            <strong className="font-semibold">
              Score {health.score}/100 · {scoreLabel(health.score)}.
            </strong>{' '}
            <span className="text-muted">
              {health.warnings} warning{health.warnings === 1 ? '' : 's'}, {health.infos} info. {SCORE_FORMULA}
            </span>
          </p>
          {health.findings.length === 0 ? (
            <p className="m-0 mt-3 text-muted">No alerts. Every rule that could run passed.</p>
          ) : (
            <ul className="m-0 mt-4 list-none space-y-3 p-0">
              {health.findings.map((f) => {
                const shown = f.objects.slice(0, ALERT_OBJECTS);
                return (
                  <li
                    key={f.rule}
                    className={cx('break-inside-avoid border-l-2 py-1 pl-4', f.severity === 'warning' ? 'border-warn-solid' : 'border-info-solid')}
                    data-testid={`alert-${f.rule}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityChip severity={f.severity} />
                      <strong className="font-semibold">{f.title}</strong>
                    </div>
                    <p className="m-0 mt-1 text-sm">{f.summary}</p>
                    <p className="m-0 mt-0.5 text-sm text-muted">{f.advice}</p>
                    {shown.length > 0 && (
                      <p className="m-0 mt-1.5 text-xs break-words text-muted">
                        <span className="font-medium text-fg">Affected:</span> <span className="font-mono">{shown.join(', ')}</span>
                        {f.objects.length > shown.length && ` and ${f.objects.length - shown.length} more`}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {health.skipped.length > 0 && (
            <p className="m-0 mt-4 text-sm text-muted">Not checked (metadata not available): {health.skipped.map((s) => s.rule.title).join(', ')}.</p>
          )}
        </section>
      </article>

      <details className="x-noprint mx-auto mt-6 max-w-[1040px]">
        <summary className="cursor-pointer text-sm font-medium text-muted hover:text-fg">Preview the Markdown</summary>
        <pre className="x-mono mt-2 max-h-96 overflow-auto rounded-xl border border-line bg-surface-sunken p-4 text-xs whitespace-pre-wrap break-words" data-testid="markdown-preview">
          {markdown()}
        </pre>
      </details>
    </>
  );
}

/** One measure: name, where it lives and its format, its description (or that it has none), and its DAX. */
function MeasureEntry({ m, hiddenExpr }: { m: MeasureInfo; hiddenExpr: boolean }) {
  const expr = m.expression?.trim() ?? '';
  return (
    <li className="grid gap-x-6 gap-y-2 py-3 break-inside-avoid md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]" data-testid="summary-measure">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cx('font-semibold break-words', m.isHidden && 'text-muted italic')}>{m.name}</span>
          {m.isHidden && (
            <Badge tone="neutral" size="sm">
              Hidden
            </Badge>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted">
          {m.displayFolder ? `${m.displayFolder} · ` : ''}Format <span className="font-mono">{m.formatString || (isNumericMeasure(m) ? '(none)' : '(text)')}</span>
        </div>
        {m.description ? <p className="m-0 mt-1.5 text-sm">{m.description}</p> : <p className="m-0 mt-1.5 text-sm text-muted italic">No description.</p>}
      </div>
      <div className="min-w-0">
        {hiddenExpr ? null : expr ? <Dax code={expr} compact /> : <p className="m-0 text-xs text-muted">Expression not available.</p>}
      </div>
    </li>
  );
}
