/** Probes: ready-made questions sent into the model (a TOPN query each), answered as a bar chart and a grid. */
import { useState } from 'react';
import { Rocket } from 'lucide-react';

import { Button, EmptyState, ErrorPanel, LinkButton, LoadingBlock, Table, TableWrap, Td, Th } from '@x10/shared/ui';

import { BodyGlyph } from '../components/BodyGlyph';
import { ToolHeader, WithMetadata } from '../components/common';
import { Dax } from '../components/Dax';
import { ResultBarChart } from '../components/ResultBarChart';
import { QUESTIONS } from '../config/rules';
import { formatNumber, runQuestion, type Outcome, type QuestionResult } from '../domain/queries';
import { generateQuestions, noQuestionsReason, type SampleQuestion } from '../domain/questions';
import type { ModelMetadata } from '../domain/types';
import { useModel } from '../state/ModelContext';

type RunState = { running: true } | { running: false; outcome: Outcome<QuestionResult> };

export function ProbesPage() {
  return <WithMetadata>{(meta) => <Probes meta={meta} />}</WithMetadata>;
}

function Probes({ meta }: { meta: ModelMetadata }) {
  const groups = generateQuestions(meta);
  const reason = noQuestionsReason(meta, groups);
  const total = groups.reduce((s, g) => s + g.questions.length, 0);
  return (
    <>
      <ToolHeader
        icon={<Rocket />}
        tool="Probes"
        title="Sample questions"
        meta={!reason && <span className="num">{total} questions · top {QUESTIONS.topN} each · run on a click, with your permissions</span>}
      />
      {reason ? (
        <EmptyState title="No probes to launch for this model" icon={<Rocket />} action={<LinkButton to="/field-guide?tab=measures">Open the Field guide</LinkButton>}>
          <span data-testid="no-questions-reason">{reason}</span>
        </EmptyState>
      ) : (
        groups.map((g) => (
          <section key={`${g.measure.table}|${g.measure.name}`} className="mb-10" aria-labelledby={`p-${g.measure.name}`}>
            <div className="mb-1 flex items-center gap-2">
              <BodyGlyph kind="moon" color="var(--accent-9)" size={14} />
              <h2 id={`p-${g.measure.name}`} className="m-0 text-base font-semibold">
                {g.measure.name}
              </h2>
              <span className="text-ui text-muted">on {g.measure.table}</span>
            </div>
            <ul className="m-0 list-none divide-y divide-[var(--line)] border-y border-line p-0">
              {g.questions.map((q) => (
                <QuestionRow key={q.id} q={q} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

function QuestionRow({ q }: { q: SampleQuestion }) {
  const { client } = useModel();
  const [state, setState] = useState<RunState | null>(null);
  const run = async () => {
    setState({ running: true });
    const outcome = await runQuestion(client, q.dax, q.column.name);
    setState({ running: false, outcome });
  };
  return (
    <li className="py-4" data-testid="question-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-sm font-semibold break-words">{q.text}</h3>
          <p className="m-0 mt-0.5 text-xs text-muted">
            {q.column.name} comes from {q.column.table} ({q.column.dataType.toLowerCase()} column)
          </p>
        </div>
        <Button variant="secondary" size="sm" busy={state?.running} onClick={run} aria-label={`Run: ${q.text}`} icon={<Rocket aria-hidden="true" />}>
          {state && !state.running ? 'Run again' : 'Run'}
        </Button>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-muted hover:text-fg">Show DAX</summary>
        <Dax code={q.dax} copy testId="question-dax" className="mt-2" />
      </details>
      {state?.running && (
        <div className="mt-3">
          <LoadingBlock rows={2} label="Running query" />
        </div>
      )}
      {state && !state.running && <ResultView outcome={state.outcome} q={q} onRetry={run} />}
    </li>
  );
}

function ResultView({ outcome, q, onRetry }: { outcome: Outcome<QuestionResult>; q: SampleQuestion; onRetry: () => void }) {
  if (!outcome.ok) {
    return (
      <div className="mt-3">
        <ErrorPanel error={outcome.error} title="The probe came back with an error" onRetry={onRetry} />
      </div>
    );
  }
  const rows = outcome.value.rows;
  if (!rows.length) {
    return <p className="mb-0 mt-3 text-sm text-muted">The query returned no rows: the measure is blank for every {q.column.name}.</p>;
  }
  const data = rows.map((r) => ({ label: r.label, value: r.value ?? 0 }));
  const top = rows[0];
  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" data-testid="question-result">
      <ResultBarChart
        data={data}
        measure={q.measure.name}
        title={`${q.measure.name} by ${q.column.name}, top ${rows.length}`}
        summary={`Highest: ${top.label} at ${formatNumber(top.value)}. ${rows.length} rows.`}
      />
      <TableWrap label={`Result: ${q.text}`} maxHeight={360}>
        <Table density="compact" data-testid="result-grid">
          <thead>
            <tr>
              <Th>{q.column.name}</Th>
              <Th numeric>{q.measure.name}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.label}-${i}`}>
                <Td className="break-words">{r.label}</Td>
                <Td numeric>{formatNumber(r.value)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
