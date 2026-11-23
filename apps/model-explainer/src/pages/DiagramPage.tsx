/**
 * Home: the model as a schema diagram. Every table is a card with its keys, columns and measures; relationships run
 * between the key columns, with dots flowing the way filters travel. Click a table, column, measure or relationship to
 * read about it in the info panel. The focused object lives in the URL (`?focus=t:Sales`), so other screens link here.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KeyRound, Search, Sigma } from 'lucide-react';

import { Chip, Switch, useIsDesktop, useReducedMotion } from '@x10/shared/ui';

import { MissingSections, ModelSelect, PageSkeleton, ReloadButton, WithMetadata } from '../components/common';
import { InfoPanel } from '../components/InfoPanel';
import { SchemaDiagram } from '../components/SchemaDiagram';
import { evaluateHealth, scoreTone } from '../domain/findings';
import { issueMap } from '../domain/issues';
import { columnId, measureId, parseObjectId, tableId, tableRoles, type ObjectRef } from '../domain/model';
import { layoutSchema } from '../domain/schema';
import type { ModelMetadata } from '../domain/types';

export function DiagramPage() {
  return (
    <WithMetadata
      skeleton={
        <div className="px-4 pt-6 sm:px-6">
          <PageSkeleton />
        </div>
      }
    >
      {(meta) => <DiagramView meta={meta} />}
    </WithMetadata>
  );
}

function DiagramView({ meta }: { meta: ModelMetadata }) {
  const [params, setParams] = useSearchParams();
  const reducedMotion = useReducedMotion();
  const desktop = useIsDesktop();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [showHidden, setShowHidden] = useState(true);
  const [query, setQuery] = useState('');

  const tableNames = useMemo(() => new Set([...meta.tables.map((t) => t.name), ...meta.relationships.flatMap((r) => [r.fromTable, r.toTable])]), [meta]);

  // ?focus=t:<table> | c:<table>|<column> | m:<table>|<measure> | r:<index>. ?table=<name> still works.
  const focus = useMemo((): ObjectRef | null => {
    const legacy = params.get('table');
    const ref = params.get('focus') ? parseObjectId(params.get('focus')!) : legacy ? ({ kind: 'table', table: legacy } as const) : null;
    if (!ref) return null;
    if (ref.kind === 'relationship') return meta.relationships[ref.index] ? ref : null;
    return tableNames.has(ref.table) ? ref : null;
  }, [params, meta.relationships, tableNames]);
  const focusTable = focus && focus.kind !== 'relationship' ? focus.table : null;
  const setFocus = (id: string | null) => setParams(id ? { focus: id } : {}, { replace: true });

  const open = useMemo(() => {
    const s = new Set(expanded);
    if (focusTable) s.add(focusTable);
    return s;
  }, [expanded, focusTable]);
  const layout = useMemo(() => layoutSchema(meta, { expanded: open, showHidden }), [meta, open, showHidden]);
  const health = useMemo(() => evaluateHealth(meta), [meta]);
  const issues = useMemo(() => issueMap(meta, health), [meta, health]);
  const roles = useMemo(() => tableRoles(meta), [meta]);

  const toggle = (name: string) => {
    // "Show less" on the focused card also clears the focus (the focused table's card is always expanded).
    if (name === focusTable) setFocus(null);
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(name) || name === focusTable) n.delete(name);
      else n.add(name);
      return n;
    });
  };

  // Find any table, column or measure by name.
  const findable = useMemo(
    () => [
      ...[...tableNames].sort().map((n) => ({ label: n, id: tableId(n) })),
      ...meta.columns.map((c) => ({ label: `${c.table}[${c.name}]`, id: columnId(c.table, c.name) })),
      ...meta.measures.map((m) => ({ label: `${m.name} (measure on ${m.table})`, id: measureId(m.table, m.name) })),
    ],
    [tableNames, meta.columns, meta.measures],
  );
  const onFind = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    const byLength = [...findable].sort((a, b) => a.label.length - b.label.length);
    const hit =
      byLength.find((f) => f.label.toLowerCase() === q) ??
      byLength.find((f) => f.label.toLowerCase().startsWith(q)) ??
      byLength.find((f) => f.label.toLowerCase().includes(q));
    if (hit) {
      setFocus(hit.id);
      setQuery('');
    }
  };

  const facts = [...roles.values()].filter((r) => r === 'fact').length;
  const tone = scoreTone(health.score);

  return (
    <div className="relative h-[calc(100dvh-7.5rem)] min-h-[480px] md:h-auto md:min-h-0 md:flex-1" data-testid="diagram-page">
      <SchemaDiagram
        layout={layout}
        resetKey={meta.modelLabel}
        focus={focus}
        onFocus={setFocus}
        onToggleExpand={toggle}
        reducedMotion={reducedMotion}
        insets={desktop ? { left: 392, right: focus ? 392 : 72, top: 16, bottom: 16 } : { left: 0, right: 0, top: 230, bottom: focus ? 300 : 0 }}
      />

      {/* Model, counts, find, hidden fields. */}
      <div className="x-glass pointer-events-auto absolute top-4 left-4 w-[min(360px,calc(100%-2rem))] p-3">
        <div className="flex items-center gap-2">
          <ModelSelect variant="title" className="min-w-0 flex-1" />
          <ReloadButton />
        </div>
        <p className="m-0 mt-1 text-xs text-muted">
          {tableNames.size} tables · {meta.measures.length} measures · {meta.relationships.length} relationships
          {facts ? ` · ${facts} fact table${facts === 1 ? '' : 's'}` : ''}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Link to="/space-weather" className="no-underline">
            <Chip tone={tone} icon={false} title="Open the health checks">
              Health {health.score}/100
            </Chip>
          </Link>
          <MissingSections meta={meta} />
        </div>
        <form onSubmit={onFind} className="mt-3 flex items-center gap-2" role="search">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Find a table, column or measure</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              list="diagram-find"
              placeholder="Find a table, column or measure…"
              className="h-8 w-full rounded-lg border border-[var(--line)] bg-[var(--field)] pr-2 pl-8 text-sm text-fg outline-none focus-visible:border-[var(--accent-9)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
            <datalist id="diagram-find">
              {findable.map((f) => (
                <option key={f.id} value={f.label} />
              ))}
            </datalist>
          </label>
        </form>
        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 text-xs text-muted">
          <span>Show hidden columns and measures</span>
          <Switch size="sm" checked={showHidden} onChange={setShowHidden} label="Show hidden columns and measures" />
        </label>
        <details open={desktop} className="mt-3 border-t border-[var(--line)] pt-2">
          <summary className="cursor-pointer text-xs font-medium text-muted">How to read the diagram</summary>
          <DiagramKey animated={!reducedMotion} />
        </details>
      </div>

      {/* Whatever is focused: a table, column, measure or relationship. */}
      {focus && (
        <InfoPanel
          key={JSON.stringify(focus)}
          meta={meta}
          focus={focus}
          roles={roles}
          issues={issues}
          onFocus={setFocus}
          className="pointer-events-auto absolute inset-x-3 bottom-3 max-h-[min(300px,55%)] md:inset-x-auto md:top-4 md:right-4 md:bottom-auto md:max-h-[calc(100%-2rem)] md:w-[360px]"
        />
      )}
    </div>
  );
}

function DiagramKey({ animated }: { animated: boolean }) {
  const line = { stroke: 'var(--line-strong)' };
  return (
    <ul aria-label="Diagram key" data-testid="diagram-key" className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0 text-xs text-muted">
      <li className="flex items-center gap-2">
        <svg width="40" height="12" aria-hidden="true">
          <line x1="2" y1="6" x2="38" y2="6" style={line} strokeWidth="1.5" />
          <circle cx="4" cy="6" r="2.6" style={{ fill: 'var(--accent-9)' }}>
            {animated && <animate attributeName="cx" from="4" to="34" dur="1.6s" repeatCount="indefinite" />}
          </circle>
          {!animated && <path d="M30,2 L38,6 L30,10 z" style={{ fill: 'var(--line-strong)' }} />}
        </svg>
        Filters flow toward the arrow (one → many)
      </li>
      <li className="flex items-center gap-2">
        <svg width="40" height="12" aria-hidden="true">
          <line x1="2" y1="6" x2="38" y2="6" style={line} strokeWidth="1.5" strokeDasharray="6 5" />
        </svg>
        Inactive relationship
      </li>
      <li className="flex items-center gap-2">
        <span className="x-mono w-10 text-center font-semibold text-fg">1 *</span>
        One and many ends
      </li>
      <li className="flex items-center gap-2">
        <span className="flex w-10 justify-center"><KeyRound className="size-3.5 text-[var(--warn-solid)]" aria-hidden="true" /></span>
        Relationship key column
      </li>
      <li className="flex items-center gap-2">
        <span className="flex w-10 justify-center"><Sigma className="size-3.5 text-[var(--accent-11)]" aria-hidden="true" /></span>
        Measure
      </li>
    </ul>
  );
}
