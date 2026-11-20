import type { ReactNode } from 'react';
import { BookOpen, CloudSun, FileText, Map as MapIcon, Orbit, Rocket } from 'lucide-react';

import { useApp } from '@x10/shared/runtime';
import { PageHeader } from '@x10/shared/ui';

import { MAX_MODELS } from '../config/models';
import { QUESTIONS, RULES, TRY_ROW_LIMIT } from '../config/rules';
import { RULE_DEFS, SCORE_FORMULA } from '../domain/findings';

const TOOLS: { icon: ReactNode; name: string; text: string }[] = [
  { icon: <Orbit />, name: 'Sky', text: 'The model as a solar system. Fact tables are stars, dimensions planets, measures moons, relationships trails. Four lenses: weather, size, hidden, coverage.' },
  { icon: <MapIcon />, name: 'Star chart', text: 'The same relationships as a flat diagram with arrows and cardinality, plus the list. It is also the sky when 3D is not available.' },
  { icon: <BookOpen />, name: 'Field guide', text: 'Every table with its columns and row count on demand, and every measure with its DAX.' },
  { icon: <CloudSun />, name: 'Space weather', text: 'Eight health rules, the score and every finding, each one a click from the sky.' },
  { icon: <Rocket />, name: 'Probes', text: `Sample questions for up to ${QUESTIONS.maxMeasures} measures, each a TOPN(${QUESTIONS.topN}) query you run on a click.` },
  { icon: <FileText />, name: 'Mission brief', text: 'A printable one-pager, also as Markdown for a wiki or a pull request.' },
];

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-3 border-t border-line py-8 md:grid-cols-[200px_minmax(0,1fr)]">
      <h2 className="m-0 text-sm font-semibold">{title}</h2>
      <div className="min-w-0 text-sm">{children}</div>
    </section>
  );
}

export function AboutPage() {
  const { mode } = useApp();
  return (
    <div className="max-w-[960px]">
      <PageHeader title="About Semantic Model Explainer" subtitle="Open a semantic model and understand it in two minutes." />
      <Block title="What it does">
        <p className="m-0 max-w-[68ch]">
          It reads a Power BI semantic model through a Fabric connector and draws it as a solar system you can fly around, with tools for the details.
          It is read-only: it never changes the model. Up to {MAX_MODELS} models are bound as connectors; pick one from the title.
        </p>
      </Block>
      <Block title="Tools">
        <ul className="m-0 grid list-none gap-x-8 gap-y-4 p-0 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <li key={t.name} className="flex gap-3">
              <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-3 text-accent-11 [&_svg]:size-3.5">{t.icon}</span>
              <span>
                <strong className="font-semibold">{t.name}</strong>
                <span className="mt-0.5 block text-muted">{t.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Block>
      <Block title="Health rules">
        <ul className="m-0 list-none divide-y divide-[var(--line)] p-0">
          {RULE_DEFS.map((r) => (
            <li key={r.id} className="grid gap-x-6 py-2 sm:grid-cols-[220px_minmax(0,1fr)]">
              <span className="font-medium">
                {r.title} <span className="font-mono text-xs text-muted">{r.severity}</span>
              </span>
              <span className="text-muted">{r.condition}</span>
            </li>
          ))}
        </ul>
        <p className="m-0 mt-3 font-medium">{SCORE_FORMULA}</p>
      </Block>
      <Block title="Thresholds">
        <dl className="m-0 grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-1.5">
          {[
            ['Undescribed measures fire above', `${Math.round(RULES.measureDescriptionShare * 100)}%`],
            ['Wide table above', `${RULES.wideTableColumns} columns`],
            ['All-caps names need at least', `${RULES.allCapsMinLetters} letters`],
            ['Sample measures', `up to ${QUESTIONS.maxMeasures}`],
            ['Columns per measure', `up to ${QUESTIONS.maxColumns}`],
            ['Probe row guard', `${TRY_ROW_LIMIT} rows`],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="m-0 text-right font-mono num">{v}</dd>
            </div>
          ))}
        </dl>
      </Block>
      <Block title="How it reads the model">
        <p className="m-0 max-w-[68ch] text-muted">
          Each section tries the DAX <code className="x-mono text-fg">INFO.TABLES()</code> family first, then <code className="x-mono text-fg">INFO.VIEW.TABLES()</code>. If
          neither works, that section says it is not available and the rest keeps working. Some models do not return measure DAX through the query API; the app says so and
          shows everything else. Row counts (the Size lens and Count rows) run one batched COUNTROWS query per 20 tables, only when asked.
        </p>
      </Block>
      <Block title="Privacy and access">
        <ul className="m-0 max-w-[68ch] list-disc space-y-1 pl-5 text-muted">
          <li>Queries run through the Fabric connector as the signed-in user, so people only see models they can already query.</li>
          <li>Nothing is stored: the app has no database. Metadata stays in the browser tab while it is open.</li>
          <li>Queries run when you open the app or ask for something (Size lens, Count rows, Run). Results are capped.</li>
        </ul>
        {mode === 'demo' && <p className="m-0 mt-3 text-muted">Demo mode: the three models are fictional and answered by a built-in mock engine, so nothing leaves this browser.</p>}
      </Block>
      <p className="mt-2 text-xs text-muted">Built by Datachain Consulting for AI @Work. Runs on Microsoft Fabric Apps.</p>
    </div>
  );
}
