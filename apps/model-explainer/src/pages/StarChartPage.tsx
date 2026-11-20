import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Map as MapIcon, Orbit } from 'lucide-react';

import { Badge, Button, EmptyState, LinkButton, StatStrip, Stat, Table, TableWrap, Td, Th, Tr } from '@x10/shared/ui';

import { BodyGlyph } from '../components/BodyGlyph';
import { SectionUnavailable, ToolHeader, WithMetadata } from '../components/common';
import { StarChart } from '../components/StarChart';
import { cardinalityLabel, crossFilterLabel } from '../domain/markdown';
import { buildOrrery, tableId } from '../domain/orrery';
import type { ModelMetadata } from '../domain/types';

export function StarChartPage() {
  return <WithMetadata>{(meta) => <StarChartView meta={meta} />}</WithMetadata>;
}

function StarChartView({ meta }: { meta: ModelMetadata }) {
  const [params, setParams] = useSearchParams();
  const orrery = useMemo(() => buildOrrery(meta), [meta]);
  const names = new Set(orrery.bodies.map((b) => b.name));
  const selected = params.get('table') && names.has(params.get('table')!) ? params.get('table') : null;
  const select = (name: string | null) => setParams(name ? { table: name } : {}, { replace: true });
  const tables = useMemo(() => orrery.bodies.map((b) => ({ name: b.name, isHidden: b.hidden })), [orrery]);
  const kinds = useMemo(() => new Map(orrery.bodies.map((b) => [b.name, b.kind])), [orrery]);
  const rels = useMemo(
    () =>
      [...meta.relationships].sort(
        (a, b) => a.fromTable.localeCompare(b.fromTable) || a.toTable.localeCompare(b.toTable) || Number(b.isActive) - Number(a.isActive),
      ),
    [meta.relationships],
  );
  const shown = selected ? rels.filter((r) => r.fromTable === selected || r.toTable === selected) : rels;
  const stars = orrery.bodies.filter((b) => b.kind === 'sun').length;
  const loose = orrery.bodies.filter((b) => b.kind === 'rogue').length;

  return (
    <>
      <ToolHeader
        icon={<MapIcon />}
        tool="Star chart"
        title="How the tables connect"
        actions={
          <LinkButton to={selected ? `/?focus=${encodeURIComponent(tableId(selected))}` : '/'} icon={<Orbit aria-hidden="true" />}>
            {selected ? `Fly to ${selected}` : 'Open the sky'}
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
        <EmptyState title="Nothing to chart" icon={<MapIcon />}>
          The model returned no tables or relationships.
        </EmptyState>
      ) : (
        <>
          <StatStrip className="mb-5">
            <Stat label="Tables" value={<span className="num">{tables.length}</span>} />
            <Stat label="Stars" value={<span className="num">{stars}</span>} hint="Fact tables" />
            <Stat label="Relationships" value={<span className="num">{meta.relationships.length}</span>} hint={`${meta.relationships.filter((r) => !r.isActive).length} inactive`} />
            <Stat label="Systems" value={<span className="num">{orrery.systems.filter((s) => s.kind === 'star').length}</span>} hint={loose ? `${loose} loose table${loose === 1 ? '' : 's'}` : 'No loose tables'} />
          </StatStrip>
          <StarChart tables={tables} relationships={meta.relationships} selected={selected} onSelect={select} kinds={kinds} />

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
                {selected ? 'It drifts alone: no other table filters it.' : 'This model has tables but no relationships between them.'}
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
                            <BodyGlyph kind={kinds.get(r.fromTable) ?? 'planet'} size={14} />
                            <strong className="font-medium">{r.fromTable}</strong>
                          </span>
                          <span className="text-muted">[{r.fromColumn}]</span>
                        </Td>
                        <Td className="break-words">
                          <span className="inline-flex items-center gap-2">
                            <BodyGlyph kind={kinds.get(r.toTable) ?? 'planet'} size={14} />
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
