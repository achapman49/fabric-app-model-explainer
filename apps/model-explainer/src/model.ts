/**
 * Runtime entity definitions for the shared identity layer. This app owns no SQL entities: it is a read-only data app
 * over semantic model connectors, and `services.data` is disabled in rayfin/rayfin.yml. Person and AppMarker live in an
 * in-memory store in both modes (see `fabric: { data: false }` in app.config.ts).
 *
 * The semantic model types (TableInfo, ColumnInfo, MeasureInfo, RelationshipInfo, ModelMetadata) are in
 * src/domain/types.ts.
 */
import type { EntityDefs } from '@x10/shared/data';
import { AppMarkerDef, PersonDef, type AppMarker, type Person } from '@x10/shared/identity';

export type Schema = {
  Person: Person;
  AppMarker: AppMarker;
};

export const defs: EntityDefs<Schema> = {
  Person: PersonDef,
  AppMarker: AppMarkerDef,
};
