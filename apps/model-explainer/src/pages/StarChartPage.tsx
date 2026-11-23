import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GitFork, Network } from 'lucide-react';

import { Badge, Button, EmptyState, LinkButton, StatStrip, Stat, Table, TableWrap, Td, Th, Tr } from '@x10/shared/ui';

import { SectionUnavailable, ToolHeader, WithMetadata } from '../components/common';
import { RoleMark } from '../components/RoleMark';
import { StarChart } from '../components/StarChart';
import { cardinalityLabel, crossFilterLabel } from '../domain/markdown';
import { components } from '../domain/diagram';
import { allTableNames } from '../domain/metadata';
import { tableId, tableRoles } from '../domain/model';
import type { ModelMetadata } from '../domain/types';

export function StarChartPage() {
  return <WithMetadata>{(meta) => <StarChartView meta={meta} />}</WithMetadata>;
}

function StarChartView({ meta }: { meta: ModelMetadata }) {
  const [params, setParams] = useSearchParams();
  const roles = useMemo(() => tableRoles(meta), [meta]);
  const names = new Set(roles.keys());
  const selected = params.get('table') && names.has(params.get('table')!) ? params.get('table') : null;
  const select = (name: string | null) => setParams(name ? { table: name } : {}, { replace: true });
  const tables = useMemo(() => {
    const hidden = new Map(meta.tables.map((t) => [t.name, t.isHidden]));
    return allTableNames(meta).map((name) => ({ name, isHidden: hidden.get(name) ?? false }));
  }, [meta]);
  const rels = useMemo(
    () =>
      [...meta.relationships].sort(
        (a, b) => a.fromTable.localeCompare(b.fromTable) || a.toTable.localeCompare(b.toTable) || Number(b.isActive) - Number(a.isActive),
      ),
    [meta.relationships],
  );
  const shown = selected ? rels.filter((r) => r.fromTable === selected || r.toTable === selected) : rels;
  const facts = [...roles.values()].filter((r) => r === 'fact').length;
  const loose = [...roles.values()].filter((r) => r === 'unrelated').length;
  const groups = useMemo(() => components(allTableNames(meta), meta.relationships).filter((g) => g.length > 1).length, [meta]);

  return (
    <>
      <ToolHeader
        icon={<GitFork />}
        tool="Relationships"
        title="How the tables connect"
        actions={
          <LinkButton to={selected ? `/?focus=${encodeURIComponent(tableId(selected))}` : '/'} icon={<Network aria-hidden="true" />}>
            {selected ? `Show ${selected} in diagram` : 'Open diagram'}
          </LinkButton>
        }
      />
      {!meta.sections.relationships.ok ? (
        <>
          <SectionUnavailable meta={meta} section="relationships" />
          {meta.tables.length > 0 && (
            <p className="mt-4 text-sm text-muted">
              The model has {meta.tables.length} tables, but how they connect could not be read.
            </p>
          )}
        </>
      ) : tables.length === 0 ? (
        <EmptyState title="Nothing to chart" icon={<GitFork />}>
          The model returned no tables or relationships.
        </EmptyState>
      ) : (
        <>
          <StatStrip className="mb-5">
            <Stat label="Tables" value={<span className="num">{tables.length}</span>} />
            <Stat label="Fact tables" value={<span className="num">{facts}</span>} />
            <Stat label="Relationships" value={<span className="num">{meta.relationships.length}</span>} hint={`${meta.relationships.filter((r) => !r.isActive).length} inactive`} />
            <Stat label="Connected groups" value={<span className="num">{groups}</span>} hint={loose ? `${loose} unrelated table${loose === 1 ? '' : 's'}` : 'No unrelated tables'} />
          </StatStrip>
          <StarChart tables={tables} relationships={meta.relationships} selected={selected} onSelect={select} roles={roles} />

          <section className="mt-10" aria-labelledby="rel-h">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="rel-h" className="m-0 text-base font-semibold">
                {selected ? `Relationships of ${selected}` : 'All relationships'}
              </h2>
              {selected && (
                <Button size="sm" onClick={() => select(null)}>
                  Show all
                </Button>
              )}
            </div>
            {shown.length === 0 ? (
              <EmptyState compact bordered title={selected ? `${selected} has no relationships` : 'No relationships'}>
                {selected ? 'No other table filters it, and it filters none.' : 'This model has tables but no relationships between them.'}
              </EmptyState>
            ) : (
              <TableWrap label="Relationship list">
                <Table data-testid="relationship-list">
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
                    {shown.map((r) => (
                      <Tr key={r.name} data-testid="relationship-row">
                        <Td className="break-words">
                          <span className="inline-flex items-center gap-2">
                            <RoleMark role={roles.get(r.fromTable) ?? 'dimension'} size={14} />
                            <strong className="font-medium">{r.fromTable}</strong>
                          </span>
                          <span className="text-muted">[{r.fromColumn}]</span>
                        </Td>
                        <Td className="break-words">
                          <span className="inline-flex items-center gap-2">
                            <RoleMark role={roles.get(r.toTable) ?? 'dimension'} size={14} />
                            <strong className="font-medium">{r.toTable}</strong>
                          </span>
                          <span className="text-muted">[{r.toColumn}]</span>
                        </Td>
                        <Td className="whitespace-nowrap">
                          {r.cardinality === 'many-to-many' ? <Badge tone="warn">{cardinalityLabel(r.cardinality)}</Badge> : <span className="text-muted">{cardinalityLabel(r.cardinality)}</span>}
                        </Td>
                        <Td className="whitespace-nowrap">
                          {r.crossFilter === 'both' ? <Badge tone="warn">{crossFilterLabel(r.crossFilter)}</Badge> : <span className="text-muted">{crossFilterLabel(r.crossFilter)}</span>}
                        </Td>
                        <Td>{r.isActive ? <Badge tone="ok">Active</Badge> : <Badge tone="info">Inactive</Badge>}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </section>
        </>
      )}
    </>
  );
}
