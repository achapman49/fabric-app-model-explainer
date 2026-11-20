/**
 * Field guide: every table (body) and measure (moon) in the model, with their columns, row counts on demand and the
 * DAX, highlighted.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Orbit, Scale } from 'lucide-react';

import {
  Badge,
  Button,
  Checkbox,
  cx,
  Dialog,
  EmptyState,
  ErrorPanel,
  FilterSelect,
  LinkButton,
  SearchInput,
  Table,
  TableWrap,
  Tabs,
  Td,
  Th,
  Toolbar,
  Tr,
} from '@x10/shared/ui';

import { BodyGlyph } from '../components/BodyGlyph';
import { HiddenChip, Mono, SectionUnavailable, ToolHeader, WithMetadata } from '../components/common';
import { Dax } from '../components/Dax';
import { RULES } from '../config/rules';
import { countRowsQuery } from '../domain/dax';
import { EXPRESSIONS_HIDDEN_NOTE, expressionsHidden, isNumericMeasure } from '../domain/metadata';
import { buildOrrery, kindShort, measureId, tableId, type Orrery } from '../domain/orrery';
import { countRows, type Outcome } from '../domain/queries';
import type { ColumnInfo, MeasureInfo, ModelMetadata, TableInfo } from '../domain/types';
import { COVERAGE_LABEL, measureCoverage } from '../domain/weather';
import { compactNumber } from '../orrery/look';
import { useModel } from '../state/ModelContext';

const KIND_LABEL: Record<ColumnInfo['kind'], string> = {
  data: 'Data',
  calculated: 'Calculated',
  calculatedTable: 'Calculated table',
  other: 'Other',
};

type Tab = 'tables' | 'measures';

export function FieldGuidePage() {
  return <WithMetadata>{(meta) => <FieldGuide meta={meta} />}</WithMetadata>;
}

function FieldGuide({ meta }: { meta: ModelMetadata }) {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'measures' ? 'measures' : 'tables';
  const open = params.get('table');
  const orrery = useMemo(() => buildOrrery(meta), [meta]);
  const set = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) (v === null ? n.delete(k) : n.set(k, v));
        return n;
      },
      { replace: true },
    );
  const table = meta.tables.find((t) => t.name === open) ?? null;
  return (
    <>
      <ToolHeader icon={<BookOpen />} tool="Field guide" title={tab === 'tables' ? 'Tables' : 'Measures'} />
      <Tabs
        label="Field guide sections"
        className="mb-5"
        value={tab}
        onChange={(v) => set({ tab: v === 'tables' ? null : v })}
        tabs={[
          { value: 'tables', label: 'Tables', count: meta.sections.tables.ok ? meta.tables.length : undefined },
          { value: 'measures', label: 'Measures', count: meta.sections.measures.ok ? meta.measures.length : undefined },
        ]}
      />
      {tab === 'tables' ? <TablesView meta={meta} orrery={orrery} onOpen={(n) => set({ table: n })} /> : <MeasuresView meta={meta} />}
      <TableDrawer meta={meta} orrery={orrery} table={table} onClose={() => set({ table: null })} />
    </>
  );
}

/* ------------------------------------------------------------------ tables */

function TablesView({ meta, orrery, onOpen }: { meta: ModelMetadata; orrery: Orrery; onOpen: (name: string) => void }) {
  const { rows } = useModel();
  const [q, setQ] = useState('');
  const [showHidden, setShowHidden] = useState(true);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return meta.tables
      .filter((t) => showHidden || !t.isHidden)
      .filter((t) => !needle || t.name.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle))
      .sort((a, b) => Number(a.isHidden) - Number(b.isHidden) || a.name.localeCompare(b.name));
  }, [meta, q, showHidden]);

  if (!meta.sections.tables.ok) return <SectionUnavailable meta={meta} section="tables" />;
  if (meta.tables.length === 0)
    return (
      <EmptyState title="No tables" icon={<BookOpen />}>
        The model returned no tables.
      </EmptyState>
    );
  return (
    <>
      <Toolbar>
        <SearchInput value={q} onChange={setQ} label="Search tables" placeholder="Search tables…" />
        <Checkbox label="Show hidden tables" checked={showHidden} onChange={setShowHidden} />
        <div className="ml-auto">
          <Button
            size="sm"
            icon={<Scale aria-hidden="true" />}
            busy={rows.loading}
            onClick={() => rows.weigh(true)}
            data-testid="weigh-all"
          >
            {rows.counts ? 'Weigh again' : 'Count all rows'}
          </Button>
        </div>
      </Toolbar>
      {rows.error && (
        <p className="mt-0 mb-3 text-sm text-bad-text" role="alert">
          Row counts failed: {rows.error.message}
        </p>
      )}
      {list.length === 0 ? (
        <EmptyState title="No tables match" action={<Button onClick={() => setQ('')}>Clear search</Button>}>
          Try a different word.
        </EmptyState>
      ) : (
        <TableWrap label="Tables">
          <Table data-testid="tables-grid">
            <thead>
              <tr>
                <Th>Table</Th>
                <Th>Body</Th>
                <Th numeric>Rows</Th>
                <Th numeric>Columns</Th>
                <Th numeric>Measures</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => {
                const b = orrery.byName.get(t.name);
                const n = rows.counts?.get(t.name);
                return (
                  <Tr key={t.name} onClick={() => onOpen(t.name)}>
                    <Td className="min-w-[220px]">
                      <button
                        type="button"
                        className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left font-semibold text-fg hover:text-brand-text"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(t.name);
                        }}
                        data-testid="open-table"
                      >
                        <BodyGlyph kind={b?.kind ?? 'planet'} hidden={t.isHidden} />
                        {t.name}
                      </button>
                      <div className="mt-0.5 line-clamp-2 pl-6 text-ui text-muted">{t.description || <span className="text-faint">No description</span>}</div>
                    </Td>
                    <Td muted className="whitespace-nowrap">
                      {b ? kindShort(b) : '–'}
                    </Td>
                    <Td numeric>{n !== undefined ? n.toLocaleString() : <span className="text-faint">–</span>}</Td>
                    <Td numeric>{t.columnCount ?? 'n/a'}</Td>
                    <Td numeric>{t.measureCount ?? 'n/a'}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {t.isHidden && <HiddenChip />}
                        {!t.isHidden && !t.description && <Badge tone="info" size="sm">No description</Badge>}
                        {!t.isHidden && (t.columnCount ?? 0) > RULES.wideTableColumns && <Badge tone="info" size="sm">Wide</Badge>}
                        {t.storageMode && <span className="font-mono text-xs text-muted">{t.storageMode}</span>}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
      {!meta.sections.columns.ok && (
        <div className="mt-6">
          <SectionUnavailable meta={meta} section="columns" />
        </div>
      )}
    </>
  );
}

function TableDrawer({ meta, orrery, table, onClose }: { meta: ModelMetadata; orrery: Orrery; table: TableInfo | null; onClose: () => void }) {
  const { client, rows } = useModel();
  const [result, setResult] = useState<Outcome<number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [forTable, setForTable] = useState<string | null>(null);
  if (table && forTable !== table.name) {
    setForTable(table.name);
    setResult(null);
  }
  const columns = table ? meta.columns.filter((c) => c.table === table.name) : [];
  const measures = table ? meta.measures.filter((m) => m.table === table.name) : [];
  const body = table ? orrery.byName.get(table.name) : undefined;
  const cached = table ? rows.counts?.get(table.name) : undefined;
  const run = async () => {
    if (!table) return;
    setBusy(true);
    setResult(await countRows(client, table.name));
    setBusy(false);
  };
  const count = result?.ok ? result.value : null;
  return (
    <Dialog open={!!table} onClose={onClose} title={table?.name ?? ''} drawer>
      {table && (
        <div data-testid="table-drawer" className="space-y-6">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-ui text-muted">
              {body && <BodyGlyph kind={body.kind} hidden={table.isHidden} />}
              {body && <span className="text-fg">{kindShort(body)}</span>}
              {table.isHidden && <HiddenChip />}
              {table.storageMode && <span className="font-mono text-xs">{table.storageMode}</span>}
            </div>
            <p className="m-0 text-sm text-muted">{table.description || 'No description.'}</p>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 border-y border-line py-4">
            <div>
              <div className="x-legend-label text-faint">Rows</div>
              <div className="font-mono text-2xl font-semibold tracking-[-0.02em] num" data-testid={count !== null ? 'row-count' : undefined}>
                {count !== null ? `${count.toLocaleString()} rows` : cached !== undefined ? compactNumber(cached) : '–'}
              </div>
            </div>
            <div className="flex gap-2">
              <LinkButton size="sm" variant="ghost" to={`/?focus=${encodeURIComponent(tableId(table.name))}`} icon={<Orbit aria-hidden="true" />}>
                Fly to it
              </LinkButton>
              <Button variant="primary" size="sm" busy={busy} onClick={run} data-testid="count-rows">
                Count rows
              </Button>
            </div>
            <p className="m-0 w-full text-xs text-muted">
              Runs <Mono>{countRowsQuery(table.name)}</Mono> for this table only.
            </p>
            {result && !result.ok && (
              <div className="w-full">
                <ErrorPanel error={result.error} title="Could not count rows" onRetry={run} />
              </div>
            )}
          </div>

          <section>
            <h3 className="m-0 mb-2 text-sm font-semibold">
              Columns <span className="font-normal text-muted num">{columns.length}</span>
            </h3>
            {!meta.sections.columns.ok ? (
              <SectionUnavailable meta={meta} section="columns" />
            ) : columns.length === 0 ? (
              <p className="m-0 text-sm text-muted">This table has no columns in the metadata.</p>
            ) : (
              <TableWrap label={`Columns of ${table.name}`}>
                <Table density="compact">
                  <thead>
                    <tr>
                      <Th>Column</Th>
                      <Th>Type</Th>
                      <Th>Notes</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {columns.map((c) => (
                      <tr key={c.name}>
                        <Td>
                          <div className={cx('font-medium break-words', c.isHidden && 'text-muted italic')}>{c.name}</div>
                          {c.description && <div className="text-xs text-muted">{c.description}</div>}
                        </Td>
                        <Td muted className="font-mono text-xs whitespace-nowrap">
                          {c.dataType}
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted">
                            {c.isHidden && <HiddenChip />}
                            {c.kind !== 'data' && <Badge tone="info" size="sm">{KIND_LABEL[c.kind]}</Badge>}
                            {c.displayFolder && <span>{c.displayFolder}</span>}
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </section>

          {measures.length > 0 && (
            <section>
              <h3 className="m-0 mb-2 text-sm font-semibold">
                Moons <span className="font-normal text-muted">measures on this table</span>
              </h3>
              <ul className="m-0 list-none divide-y divide-[var(--line)] p-0">
                {measures.map((m) => (
                  <li key={m.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className={cx('min-w-0 break-words', m.isHidden && 'text-muted italic')}>{m.name}</span>
                    <LinkButton size="sm" variant="ghost" to={`/?focus=${encodeURIComponent(measureId(m.table, m.name))}`}>
                      Fly to
                    </LinkButton>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ measures */

function MeasuresView({ meta }: { meta: ModelMetadata }) {
  const [q, setQ] = useState('');
  const [noDesc, setNoDesc] = useState(false);
  const [noFormat, setNoFormat] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [table, setTable] = useState('all');
  const hiddenExpr = expressionsHidden(meta);

  const tables = useMemo(() => [...new Set(meta.measures.map((m) => m.table))].sort(), [meta]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return meta.measures
      .filter((m) => showHidden || !m.isHidden)
      .filter((m) => table === 'all' || m.table === table)
      .filter((m) => !noDesc || !m.description)
      .filter((m) => !noFormat || !m.formatString.trim())
      .filter((m) => !needle || [m.name, m.table, m.displayFolder, m.description, m.expression ?? ''].some((s) => s.toLowerCase().includes(needle)))
      .sort((a, b) => a.table.localeCompare(b.table) || a.displayFolder.localeCompare(b.displayFolder) || a.name.localeCompare(b.name));
  }, [meta, q, noDesc, noFormat, showHidden, table]);

  const reset = () => {
    setQ('');
    setNoDesc(false);
    setNoFormat(false);
    setTable('all');
    setShowHidden(true);
  };

  if (!meta.sections.measures.ok) return <SectionUnavailable meta={meta} section="measures" />;
  if (meta.measures.length === 0)
    return (
      <EmptyState title="No moons: this model has no measures" icon={<BookOpen />}>
        Measures are the calculations report authors drag into visuals. When the model gets some, they show up here with their DAX.
      </EmptyState>
    );
  return (
    <>
      {hiddenExpr && (
        <p className="mt-0 mb-4 border-l-2 border-info-solid pl-3 text-sm text-muted" role="note" data-testid="expressions-hidden">
          {EXPRESSIONS_HIDDEN_NOTE}
        </p>
      )}
      <Toolbar>
        <SearchInput value={q} onChange={setQ} label="Search measures" placeholder="Search names, folders, DAX…" />
        <FilterSelect label="Table" value={table} onChange={setTable} options={[{ value: 'all', label: 'All tables' }, ...tables.map((t) => ({ value: t, label: t }))]} />
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Checkbox label="Missing description" checked={noDesc} onChange={setNoDesc} />
          <Checkbox label="Missing format string" checked={noFormat} onChange={setNoFormat} />
          <Checkbox label="Show hidden" checked={showHidden} onChange={setShowHidden} />
        </div>
      </Toolbar>
      <p className="mt-0 mb-3 text-ui text-muted num" aria-live="polite" data-testid="measure-count">
        Showing {rows.length} of {meta.measures.length} measures
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No measures match" action={<Button onClick={reset}>Clear filters</Button>}>
          Try fewer filters or a different word.
        </EmptyState>
      ) : (
        <ol className="m-0 list-none divide-y divide-[var(--line)] border-y border-line p-0" data-testid="measures-grid">
          {rows.map((m) => (
            <MeasureRow key={`${m.table}|${m.name}`} m={m} hiddenExpr={hiddenExpr} />
          ))}
        </ol>
      )}
    </>
  );
}

function MeasureRow({ m, hiddenExpr }: { m: MeasureInfo; hiddenExpr: boolean }) {
  const expr = m.expression?.trim() ?? '';
  const cov = measureCoverage(m);
  return (
    <li className="grid gap-x-8 gap-y-3 py-4 md:grid-cols-[minmax(220px,1fr)_minmax(0,1.6fr)]" data-testid="measure-row">
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <span className="mt-1">
            <BodyGlyph kind="moon" hidden={m.isHidden} color={cov === 'complete' ? 'var(--ok-solid)' : cov === 'missing-both' ? 'var(--bad-solid)' : 'var(--warn-solid)'} size={14} />
          </span>
          <div className="min-w-0">
            <div className="font-semibold break-words">{m.name}</div>
            <div className="text-xs text-muted">
              {m.table}
              {m.displayFolder ? ` · ${m.displayFolder}` : ''}
            </div>
          </div>
        </div>
        <div className="mt-2 pl-6">
          {m.description ? <p className="m-0 text-sm">{m.description}</p> : <Badge tone="warn" size="sm">No description</Badge>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-muted">
          <span>
            Format{' '}
            {m.formatString ? (
              <Mono className="text-fg">{m.formatString}</Mono>
            ) : isNumericMeasure(m) ? (
              <Badge tone="warn" size="sm">None</Badge>
            ) : (
              <span>(text)</span>
            )}
          </span>
          {m.isHidden && <HiddenChip />}
          <span className="sr-only">{COVERAGE_LABEL[cov]}</span>
          <LinkButton size="sm" variant="ghost" to={`/?focus=${encodeURIComponent(measureId(m.table, m.name))}&lens=coverage`}>
            Fly to
          </LinkButton>
        </div>
      </div>
      <div className="min-w-0">
        {expr ? (
          <Dax code={expr} copy />
        ) : (
          <p className="m-0 pt-1 text-sm text-muted">{hiddenExpr ? 'Not exposed by the query API' : 'Expression not available'}</p>
        )}
      </div>
    </li>
  );
}
