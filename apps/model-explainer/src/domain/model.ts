/**
 * Model-wide helpers shared by every screen: object ids (used in links such as `/?focus=t:Sales`), fact table detection
 * and each table's role. Pure functions over ModelMetadata.
 */
import { components } from './diagram';
import { allTableNames } from './metadata';
import type { ModelMetadata, RelationshipInfo } from './types';

/* ------------------------------------------------------------------ object ids */

export const tableId = (name: string) => `t:${name}`;
export const columnId = (table: string, name: string) => `c:${table}|${name}`;
export const measureId = (table: string, name: string) => `m:${table}|${name}`;
/** A relationship by its index in meta.relationships. */
export const relId = (index: number) => `r:${index}`;

export type ObjectRef =
  | { kind: 'table'; table: string }
  | { kind: 'column'; table: string; column: string }
  | { kind: 'measure'; table: string; measure: string }
  | { kind: 'relationship'; index: number };

export function parseObjectId(id: string): ObjectRef | null {
  if (id.startsWith('t:')) return { kind: 'table', table: id.slice(2) };
  if (id.startsWith('c:') || id.startsWith('m:')) {
    const rest = id.slice(2);
    const bar = rest.indexOf('|');
    if (bar < 0) return null;
    const table = rest.slice(0, bar);
    const name = rest.slice(bar + 1);
    return id[0] === 'c' ? { kind: 'column', table, column: name } : { kind: 'measure', table, measure: name };
  }
  if (id.startsWith('r:')) {
    const n = Number(id.slice(2));
    return Number.isInteger(n) && n >= 0 ? { kind: 'relationship', index: n } : null;
  }
  return null;
}

/** The table an object belongs to (both ends for a relationship: the "from" table). */
export function refTable(ref: ObjectRef, meta: ModelMetadata): string | null {
  if (ref.kind === 'relationship') return meta.relationships[ref.index]?.fromTable ?? null;
  return ref.table;
}

/* ------------------------------------------------------------------ fact tables */

/** The many side of a relationship, or null for one-to-one and many-to-many. */
export function manySide(r: RelationshipInfo): string | null {
  if (r.cardinality === 'many-to-one') return r.fromTable;
  if (r.cardinality === 'one-to-many') return r.toTable;
  return null;
}

export function oneSide(r: RelationshipInfo): string | null {
  if (r.cardinality === 'many-to-one') return r.toTable;
  if (r.cardinality === 'one-to-many') return r.fromTable;
  return null;
}

/** How fact-like a table is: relationships where it is the many side minus those where it is the one side. */
export function factScore(name: string, rels: RelationshipInfo[]): number {
  let s = 0;
  for (const r of rels) {
    if (r.fromTable === r.toTable) continue;
    if (manySide(r) === name) s++;
    if (oneSide(r) === name) s--;
  }
  return s;
}

/** Fact tables of one connected group: every table with a fact score of 2 or more, else the single most fact-like table. */
export function pickFacts(group: string[], rels: RelationshipInfo[]): string[] {
  const inGroup = new Set(group);
  const local = rels.filter((r) => inGroup.has(r.fromTable) && inGroup.has(r.toTable));
  const score = new Map(group.map((n) => [n, factScore(n, local)]));
  const facts = group.filter((n) => score.get(n)! >= 2).sort((a, b) => score.get(b)! - score.get(a)! || a.localeCompare(b));
  if (facts.length) return facts;
  const degree = (n: string) => local.filter((r) => r.fromTable === n || r.toTable === n).length;
  return [[...group].sort((a, b) => score.get(b)! - score.get(a)! || degree(b) - degree(a) || a.localeCompare(b))[0]];
}

export type TableRole = 'fact' | 'dimension' | 'unrelated';

export const ROLE_LABEL: Record<TableRole, string> = {
  fact: 'Fact',
  dimension: 'Dimension',
  unrelated: 'Not related',
};

/** Every table's role: fact tables per connected group, dimensions around them, unrelated tables on their own. */
export function tableRoles(meta: ModelMetadata): Map<string, TableRole> {
  const names = allTableNames(meta);
  const known = new Set(names);
  const rels = meta.relationships.filter((r) => known.has(r.fromTable) && known.has(r.toTable) && r.fromTable !== r.toTable);
  const roles = new Map<string, TableRole>();
  for (const group of components(names, rels)) {
    if (group.length === 1) {
      roles.set(group[0], 'unrelated');
      continue;
    }
    const facts = new Set(pickFacts(group, rels));
    for (const n of group) roles.set(n, facts.has(n) ? 'fact' : 'dimension');
  }
  return roles;
}

/* ------------------------------------------------------------------ numbers */

/** 1284512 -> "1.3M", 1842 -> "1.8K", 42 -> "42". */
export function compactNumber(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
