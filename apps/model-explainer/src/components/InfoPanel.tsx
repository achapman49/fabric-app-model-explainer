/**
 * Details for whatever is focused in the diagram: a table, a column, a measure or a relationship. Every related object
 * in the panel is a link that focuses it, so you can walk the model from here.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { BookOpen, GitFork, KeyRound, MessagesSquare, Sigma, Table2, Type, X } from 'lucide-react';

import { Badge, Button, cx, IconButton, LinkButton } from '@x10/shared/ui';

import { RULE_DEFS } from '../domain/findings';
import { COVERAGE_LABEL, measureCoverage, type Issue, type IssueMap } from '../domain/issues';
import { isNumericMeasure } from '../domain/metadata';
import { cardinalityLabel, crossFilterLabel } from '../domain/markdown';
import { columnId, compactNumber, measureId, relId, ROLE_LABEL, tableId, type ObjectRef, type TableRole } from '../domain/model';
import { countRows } from '../domain/queries';
import { referencedTables } from '../domain/questions';
import { describeLink } from '../domain/schema';
import type { ColumnInfo, MeasureInfo, ModelMetadata, RelationshipInfo } from '../domain/types';
import { measureDependencies, measuresUsingColumn, measuresUsingMeasure } from '../domain/usage';
import { useModel } from '../state/ModelContext';
import { Dax } from './Dax';
import { SeverityChip } from './common';

export interface InfoPanelProps {
  meta: ModelMetadata;
  focus: ObjectRef;
  roles: Map<string, TableRole>;
  issues: IssueMap;
  onFocus: (id: string | null) => void;
  className?: string;
}

export function InfoPanel({ meta, focus, roles, issues, onFocus, className }: InfoPanelProps) {
  let body: ReactNode = null;
  let kind = '';
  let title = '';
  let icon: ReactNode = null;
  if (focus.kind === 'table') {
    kind = 'Table';
    title = focus.table;
    icon = <Table2 />;
    body = <TableInfo meta={meta} table={focus.table} roles={roles} issues={issues} onFocus={onFocus} />;
  } else if (focus.kind === 'column') {
    const c = meta.columns.find((x) => x.table === focus.table && x.name === focus.column);
    kind = 'Column';
    title = focus.column;
    icon = <Type />;
    body = c ? <ColumnInfoView meta={meta} column={c} issues={issues} onFocus={onFocus} /> : <Missing what="column" />;
  } else if (focus.kind === 'measure') {
    const m = meta.measures.find((x) => x.table === focus.table && x.name === focus.measure);
    kind = 'Measure';
    title = focus.measure;
    icon = <Sigma />;
    body = m ? <MeasureInfoView meta={meta} measure={m} issues={issues} onFocus={onFocus} /> : <Missing what="measure" />;
  } else {
    const r = meta.relationships[focus.index];
    kind = 'Relationship';
    title = r ? `${r.fromTable} → ${r.toTable}` : 'Relationship';
    icon = <GitFork />;
    body = r ? <RelationshipInfoView rel={r} index={focus.index} issues={issues} onFocus={onFocus} /> : <Missing what="relationship" />;
  }
  const table = focus.kind === 'column' || focus.kind === 'measure' ? focus.table : null;

  return (
    <aside aria-label={`${kind} details: ${title}`} className={cx('x-glass flex flex-col overflow-hidden', className)} data-testid="info-panel" data-kind={focus.kind}>
      <header className="flex items-start gap-2 border-b border-[var(--line)] px-4 pt-3 pb-3">
        <span className="mt-0.5 text-[var(--accent-11)] [&>svg]:size-4" aria-hidden="true">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[11px] font-semibold tracking-wide text-muted uppercase">
            {kind}
            {table && (
              <>
                {' · '}
                <button type="button" className="cursor-pointer normal-case tracking-normal text-[var(--accent-11)] hover:underline" onClick={() => onFocus(tableId(table))}>
                  {table}
                </button>
              </>
            )}
          </p>
          <h2 className="m-0 mt-0.5 text-base leading-snug font-semibold break-words">{title}</h2>
        </div>
        <IconButton size="sm" label="Close details" icon={<X />} onClick={() => onFocus(null)} />
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3 text-sm">{body}</div>
    </aside>
  );
}

/* ------------------------------------------------------------------ building blocks */

function Missing({ what }: { what: string }) {
  return <p className="m-0 text-muted">This {what} is not in the model any more. Reload the metadata if it changed.</p>;
}

function Section({ title, children, count }: { title: string; children: ReactNode; count?: number }) {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="m-0 mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
        {title}
        {count !== undefined && ` · ${count}`}
      </h3>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="m-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Description({ text, missing }: { text: string; missing: string }) {
  return text.trim() ? <p className="m-0">{text}</p> : <p className="m-0 text-muted italic">{missing}</p>;
}

function ObjectLink({ icon, children, onClick, hint }: { icon: ReactNode; children: ReactNode; onClick: () => void; hint?: ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-left hover:bg-[var(--row-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
      >
        <span className="mt-0.5 shrink-0 text-faint [&>svg]:size-3.5" aria-hidden="true">
          {icon}
        </span>
        <span className="min-w-0 flex-1 break-words">
          {children}
          {hint && <span className="block text-xs text-muted">{hint}</span>}
        </span>
      </button>
    </li>
  );
}

function ObjectList({ children }: { children: ReactNode }) {
  return <ul className="-mx-1.5 m-0 list-none p-0">{children}</ul>;
}

function IssueList({ list }: { list: Issue[] }) {
  if (!list.length) return null;
  return (
    <Section title="Health" count={list.length}>
      <ul className="m-0 list-none space-y-1.5 p-0" data-testid="info-issues">
        {list.map((f, i) => (
          <li key={`${f.rule}-${i}`} className="flex items-start gap-2">
            <SeverityChip severity={f.severity} />
            <span className="min-w-0">
              {RULE_DEFS.find((r) => r.id === f.rule)?.title ?? f.rule}
              <span className="block text-xs text-muted">{f.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function RelationshipList({ meta, rels, onFocus }: { meta: ModelMetadata; rels: RelationshipInfo[]; onFocus: (id: string) => void }) {
  return (
    <ObjectList>
      {rels.map((r) => (
        <ObjectLink
          key={r.name}
          icon={<GitFork />}
          onClick={() => onFocus(relId(meta.relationships.indexOf(r)))}
          hint={`${cardinalityLabel(r.cardinality)} · ${crossFilterLabel(r.crossFilter)}${r.isActive ? '' : ' · inactive'}`}
        >
          {describeLink(r).replace(/ Inactive:.*$/, '')}
        </ObjectLink>
      ))}
    </ObjectList>
  );
}

function MeasureList({ list, onFocus }: { list: MeasureInfo[]; onFocus: (id: string) => void }) {
  return (
    <ObjectList>
      {list.map((m) => (
        <ObjectLink key={`${m.table}|${m.name}`} icon={<Sigma />} onClick={() => onFocus(measureId(m.table, m.name))} hint={m.table}>
          {m.name}
        </ObjectLink>
      ))}
    </ObjectList>
  );
}

const yes = (v: boolean) => (v ? 'Yes' : 'No');

/* ------------------------------------------------------------------ table */

function TableInfo({ meta, table, roles, issues, onFocus }: { meta: ModelMetadata; table: string; roles: Map<string, TableRole>; issues: IssueMap; onFocus: (id: string | null) => void }) {
  const info = meta.tables.find((t) => t.name === table);
  const cols = meta.columns.filter((c) => c.table === table);
  const measures = meta.measures.filter((m) => m.table === table);
  const rels = meta.relationships.filter((r) => r.fromTable === table || r.toTable === table);
  const role = roles.get(table) ?? 'unrelated';
  const own = issues.get(tableId(table)) ?? [];

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Badge tone={role === 'fact' ? 'info' : 'neutral'} size="sm">
          {ROLE_LABEL[role]}
        </Badge>
        {info?.isHidden && (
          <Badge tone="neutral" size="sm">
            Hidden
          </Badge>
        )}
      </div>
      <Description text={info?.description ?? ''} missing="No description." />
      <Section title="About">
        <Facts
          rows={[
            ['Columns', meta.sections.columns.ok ? `${cols.length} (${cols.filter((c) => c.isHidden).length} hidden)` : 'Not available'],
            ['Measures', meta.sections.measures.ok ? `${measures.length}` : 'Not available'],
            ['Storage', info?.storageMode ?? '–'],
            ['Rows', <RowCount key={table} table={table} />],
          ]}
        />
      </Section>
      <IssueList list={own} />
      <Section title="Relationships" count={rels.length}>
        {!meta.sections.relationships.ok ? (
          <p className="m-0 text-muted">Relationships could not be read for this model.</p>
        ) : rels.length ? (
          <RelationshipList meta={meta} rels={rels} onFocus={onFocus} />
        ) : (
          <p className="m-0 text-muted">Not related to any other table.</p>
        )}
      </Section>
      {measures.length > 0 && (
        <Section title="Measures" count={measures.length}>
          <MeasureList list={measures} onFocus={onFocus} />
        </Section>
      )}
      <LinkButton className="mt-4" size="sm" to={`/field-guide?table=${encodeURIComponent(table)}`} icon={<BookOpen aria-hidden="true" />}>
        Open in Tables &amp; measures
      </LinkButton>
    </>
  );
}

/** Row count, on demand (one COUNTROWS query), cached by the model context when the whole model was counted. */
function RowCount({ table }: { table: string }) {
  const { client, rows } = useModel();
  const cached = rows.counts?.get(table);
  const [state, setState] = useState<{ busy: boolean; n?: number; error?: string }>({ busy: false });
  useEffect(() => setState({ busy: false }), [table]);
  const n = state.n ?? cached;
  if (n !== undefined) return <span title={n.toLocaleString()}>{n.toLocaleString()} <span className="text-muted">({compactNumber(n)})</span></span>;
  if (state.error) return <span className="text-[var(--bad-text)]">{state.error}</span>;
  return (
    <Button
      size="sm"
      variant="ghost"
      busy={state.busy}
      onClick={async () => {
        setState({ busy: true });
        const res = await countRows(client, table);
        setState(res.ok ? { busy: false, n: res.value } : { busy: false, error: res.error.message });
      }}
    >
      Count rows
    </Button>
  );
}

/* ------------------------------------------------------------------ column */

function ColumnInfoView({ meta, column: c, issues, onFocus }: { meta: ModelMetadata; column: ColumnInfo; issues: IssueMap; onFocus: (id: string | null) => void }) {
  const rels = meta.relationships.filter((r) => (r.fromTable === c.table && r.fromColumn === c.name) || (r.toTable === c.table && r.toColumn === c.name));
  const usedBy = measuresUsingColumn(meta, c.table, c.name);
  const prefix = `Column ${c.name}:`;
  const own = (issues.get(tableId(c.table)) ?? []).filter((f) => f.note.startsWith(prefix)).map((f) => ({ ...f, note: f.note.slice(prefix.length).trim() }));
  const kind = c.kind === 'calculated' ? 'Calculated column' : c.kind === 'calculatedTable' ? 'Calculated table column' : 'Data column';

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {rels.length > 0 && (
          <Badge tone="warn" size="sm">
            Relationship key
          </Badge>
        )}
        {c.isHidden && (
          <Badge tone="neutral" size="sm">
            Hidden
          </Badge>
        )}
      </div>
      <Description text={c.description} missing="No description." />
      <Section title="About">
        <Facts
          rows={[
            ['Data type', c.dataType],
            ['Kind', kind],
            ['Format', c.formatString ? <code className="x-mono text-xs">{c.formatString}</code> : <span className="text-muted">None</span>],
            ['Folder', c.displayFolder || <span className="text-muted">None</span>],
            ['Hidden', yes(c.isHidden)],
          ]}
        />
      </Section>
      <IssueList list={own} />
      {rels.length > 0 && (
        <Section title="Relationships" count={rels.length}>
          <RelationshipList meta={meta} rels={rels} onFocus={onFocus} />
        </Section>
      )}
      <Section title="Used by measures" count={usedBy.length}>
        {usedBy.length ? (
          <MeasureList list={usedBy} onFocus={onFocus} />
        ) : (
          <p className="m-0 text-muted">{meta.measures.some((m) => m.expression) ? 'No measure refers to it directly.' : 'Measure DAX is not available, so usage is unknown.'}</p>
        )}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ measure */

function MeasureInfoView({ meta, measure: m, issues, onFocus }: { meta: ModelMetadata; measure: MeasureInfo; issues: IssueMap; onFocus: (id: string | null) => void }) {
  const own = issues.get(measureId(m.table, m.name)) ?? [];
  const known = [...new Set([...meta.tables.map((t) => t.name), ...meta.columns.map((c) => c.table)])];
  const tables = referencedTables(m.expression, known);
  const uses = measureDependencies(meta, m);
  const usedBy = measuresUsingMeasure(meta, m);
  const coverage = measureCoverage(m);

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Badge tone={coverage === 'complete' ? 'ok' : coverage === 'missing-both' ? 'bad' : 'warn'} size="sm">
          {COVERAGE_LABEL[coverage]}
        </Badge>
        {m.isHidden && (
          <Badge tone="neutral" size="sm">
            Hidden
          </Badge>
        )}
      </div>
      <Description text={m.description} missing="No description. Reports show it as a tooltip and Copilot reads it." />
      <Section title="About">
        <Facts
          rows={[
            ['Format', m.formatString ? <code className="x-mono text-xs">{m.formatString}</code> : <span className={isNumericMeasure(m) ? 'text-[var(--warn-text)]' : 'text-muted'}>None</span>],
            ['Returns', m.dataType ?? (isNumericMeasure(m) ? 'Number' : 'Text')],
            ['Folder', m.displayFolder || <span className="text-muted">None</span>],
            ['Hidden', yes(m.isHidden)],
          ]}
        />
      </Section>
      {/* The Dax block carries its own "DAX" label and copy button. */}
      <div className="mt-4">
        {m.expression ? (
          <Dax code={m.expression} copy compact testId="info-dax" />
        ) : (
          <Section title="DAX">
            <p className="m-0 text-muted">The query API does not expose this measure's DAX.</p>
          </Section>
        )}
      </div>
      <IssueList list={own} />
      {(tables.length > 0 || uses.length > 0) && (
        <Section title="Uses">
          <ObjectList>
            {tables.map((t) => (
              <ObjectLink key={`t:${t}`} icon={<Table2 />} onClick={() => onFocus(tableId(t))}>
                {t}
              </ObjectLink>
            ))}
            {uses.map((x) => (
              <ObjectLink key={`m:${x.table}|${x.name}`} icon={<Sigma />} onClick={() => onFocus(measureId(x.table, x.name))} hint={x.table}>
                {x.name}
              </ObjectLink>
            ))}
          </ObjectList>
        </Section>
      )}
      {usedBy.length > 0 && (
        <Section title="Used by measures" count={usedBy.length}>
          <MeasureList list={usedBy} onFocus={onFocus} />
        </Section>
      )}
      {isNumericMeasure(m) && !m.isHidden && (
        <LinkButton className="mt-4" size="sm" to="/probes" icon={<MessagesSquare aria-hidden="true" />}>
          Sample questions
        </LinkButton>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ relationship */

function RelationshipInfoView({ rel: r, index, issues, onFocus }: { rel: RelationshipInfo; index: number; issues: IssueMap; onFocus: (id: string | null) => void }) {
  const own = issues.get(relId(index)) ?? [];
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {r.isActive ? (
          <Badge tone="ok" size="sm">
            Active
          </Badge>
        ) : (
          <Badge tone="info" size="sm">
            Inactive
          </Badge>
        )}
      </div>
      <p className="m-0">{describeLink(r)}</p>
      <Section title="About">
        <Facts
          rows={[
            ['Cardinality', cardinalityLabel(r.cardinality)],
            ['Filters', crossFilterLabel(r.crossFilter)],
            ['Active', yes(r.isActive)],
          ]}
        />
      </Section>
      <Section title="Columns">
        <ObjectList>
          <ObjectLink icon={<KeyRound />} onClick={() => onFocus(columnId(r.fromTable, r.fromColumn))} hint={`From · ${r.cardinality.startsWith('many') ? 'many' : 'one'} side`}>
            {r.fromTable}[{r.fromColumn}]
          </ObjectLink>
          <ObjectLink icon={<KeyRound />} onClick={() => onFocus(columnId(r.toTable, r.toColumn))} hint={`To · ${r.cardinality.endsWith('many') ? 'many' : 'one'} side`}>
            {r.toTable}[{r.toColumn}]
          </ObjectLink>
        </ObjectList>
      </Section>
      <IssueList list={own} />
    </>
  );
}
