import type { DataStore } from '@x10/shared/data';
import type { SeedContext } from '@x10/shared/runtime';

import type { Schema } from './model';

/**
 * No SQL rows to seed: the app reads semantic models through connectors. The offline demo data is the fictional
 * mock models in src/mock (served by MockModelClient). runSeed still creates the persona Person rows and the marker.
 */
export async function seed(_store: DataStore<Schema>, _ctx: SeedContext): Promise<void> {
  // Intentionally empty.
}
