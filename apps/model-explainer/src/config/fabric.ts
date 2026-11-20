/**
 * Fabric-mode connector wiring. Every semantic model connector has the same generated config
 * (`{ connector: 'fabric-semanticmodel' }`; the workspace and item ids stay server-side in rayfin.yml), so the configs
 * and runtimes are built from MODEL_LABELS and adding a model never touches this file.
 */
import { fabricSemanticModel } from '@microsoft/rayfin-connector-fabric-semanticmodel';
import { connectorsService } from '@microsoft/rayfin-connectors';
import type { ConnectorConfigs } from '@microsoft/rayfin-connectors';

import { connectorConfig as semanticModelConfig, type RetailSchema } from '../../rayfin/connectors/retail/schema';
import { MODEL_LABELS, type ModelKey } from './models';

/** All semantic model connectors share the generated marker type (one operation: executeQuery). */
export type AppConnectorsSchema = { [K in ModelKey]: RetailSchema };

const keys = Object.keys(MODEL_LABELS) as ModelKey[];

/** Row cap applied to every query unless a call sets its own (the connector has no default). */
export const DEFAULT_ROW_LIMIT = 5000;

export function connectorServices(): Record<string, unknown> {
  const configs = Object.fromEntries(keys.map((k) => [k, semanticModelConfig])) as ConnectorConfigs<AppConnectorsSchema>;
  const runtime = Object.fromEntries(keys.map((k) => [k, fabricSemanticModel({ resultSetRowCountLimit: DEFAULT_ROW_LIMIT })]));
  return { connectors: connectorsService<AppConnectorsSchema>({ configs, runtime }) };
}
