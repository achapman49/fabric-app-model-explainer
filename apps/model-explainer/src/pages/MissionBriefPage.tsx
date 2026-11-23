/** Summary: the printable one-pager (map, numbers, key measures with DAX, relationships, findings) and Markdown. */
import { useMemo } from 'react';
import { Download, FileText, Printer } from 'lucide-react';

import { AppLogo } from '@x10/shared/runtime';
import { downloadText, formatDate } from '@x10/shared/lib';
import { Button, CopyButton } from '@x10/shared/ui';

import { SeverityChip, ToolHeader, WithMetadata } from '../components/common';
import { Dax } from '../components/Dax';
import { ModelMap } from '../components/ModelMap';
import { evaluateHealth, SCORE_FORMULA, scoreLabel } from '../domain/findings';
import { buildMarkdown, cardinalityLabel, crossFilterLabel, measuresByTable } from '../domain/markdown';
import { EXPRESSIONS_HIDDEN_NOTE, expressionsHidden, hiddenObjectCount } from '../domain/metadata';
import { tableRoles } from '../domain/model';
import { SECTION_LABELS, type ModelMetadata, type SectionKey } from '../domain/types';

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model';
}

export function MissionBriefPage() {
  return <WithMetadata>{(meta) => <Brief meta={meta} />}</WithMetadata>;
}

function Brief({ meta }: { meta: ModelMetadata }) {
  const health = evaluateHealth(meta);
  const markdown = () => buildMarkdown(meta, health, new Date());
  const measures = measuresByTable(meta).flatMap((g) => g.measures);
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

      <article className="x-onepager mx-auto max-w-[920px] rounded-2xl border border-line bg-surface p-6 shadow-1 md:p-10" data-testid="one-pager">
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

        <section className="mt-6">
          <h2 className="x-legend-label m-0 mb-3 text-muted">At a glance</h2>
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
          <p className="mb-0 mt-3 text-xs text-muted">
            {scoreLabel(health.score)}. {SCORE_FORMULA}
          </p>
        </section>

        {roles.size > 0 && (
          <section className="mt-8 break-inside-avoid">
            <h2 className="x-legend-label m-0 mb-3 text-muted">Map</h2>
            <div className="rounded-xl border border-line bg-surface-sunken p-3">
              <ModelMap meta={meta} roles={roles} className="block h-auto max-h-[460px] w-full" />
            </div>
            <p className="m-0 mt-2 text-xs text-muted">Tinted boxes are fact tables. Arrows point at the table being filtered (two arrowheads: both ways); dashed lines are inactive relationships.</p>
          </section>
        )}

        <section className="mt-8">
          <h2 className="x-legend-label m-0 mb-3 text-muted">Key measures</h2>
          {!meta.sections.measures.ok ? (
            <p className="text-muted">Measure metadata is not available for this model.</p>
          ) : measures.length === 0 ? (
            <p className="text-muted">This model has no visible measures.</p>
          ) : (
            <>
              {hiddenExpr && <p className="mt-0 text-sm">{EXPRESSIONS_HIDDEN_NOTE}</p>}
              <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                {measures.map((m) => (
                  <div key={`${m.table}|${m.name}`} className="min-w-0 break-inside-avoid">
                    <div className="font-semibold break-words">{m.name}</div>
                    <div className="text-xs text-muted">
                      {m.table}
                      {m.displayFolder ? ` · ${m.displayFolder}` : ''} · Format <span className="font-mono">{m.formatString || '(none)'}</span>
                    </div>
                    {m.description && <p className="m-0 mt-1 text-sm">{m.description}</p>}
                    {!hiddenExpr && (m.expression?.trim() ? <Dax code={m.expression.trim()} compact className="mt-2" /> : <p className="m-0 mt-2 text-xs text-muted">Expression not available</p>)}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="mt-8">
          <h2 className="x-legend-label m-0 mb-3 text-muted">Relationships</h2>
          {!meta.sections.relationships.ok ? (
            <p className="text-muted">Relationship metadata is not available for this model.</p>
          ) : meta.relationships.length === 0 ? (
            <p className="text-muted">This model has no relationships.</p>
          ) : (
            <ul className="m-0 list-none divide-y divide-[var(--line)] p-0 text-sm">
              {meta.relationships.map((r) => (
                <li key={r.name} className="flex flex-wrap justify-between gap-x-4 py-1.5 break-words">
                  <span className="font-mono text-[12.5px]">
                    {r.fromTable}[{r.fromColumn}] → {r.toTable}[{r.toColumn}]
                  </span>
                  <span className="text-muted">
                    {cardinalityLabel(r.cardinality)}, {crossFilterLabel(r.crossFilter).toLowerCase()}
                    {r.isActive ? '' : ', inactive'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="x-legend-label m-0 mb-3 text-muted">Findings</h2>
          {health.findings.length === 0 ? (
            <p className="text-muted">No findings. Every rule that could run passed.</p>
          ) : (
            <ul className="m-0 list-none space-y-2 p-0">
              {health.findings.map((f) => (
                <li key={f.rule} className="flex break-inside-avoid flex-wrap items-baseline gap-x-2 text-sm">
                  <SeverityChip severity={f.severity} /> <strong className="font-semibold">{f.title}.</strong> <span className="text-muted">{f.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>

      <details className="x-noprint mx-auto mt-6 max-w-[920px]">
        <summary className="cursor-pointer text-sm font-medium text-muted hover:text-fg">Preview the Markdown</summary>
        <pre className="x-mono mt-2 max-h-96 overflow-auto rounded-xl border border-line bg-surface-sunken p-4 text-xs whitespace-pre-wrap break-words" data-testid="markdown-preview">
          {markdown()}
        </pre>
      </details>
    </>
  );
}
