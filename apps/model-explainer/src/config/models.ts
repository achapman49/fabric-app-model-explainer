/**
 * Semantic models this app can explain, keyed by the connector name in rayfin/rayfin.yml.
 *
 * To add a model (up to 3): run `npx rayfin connector add` for a fabric-semanticmodel connector, then add ONE line
 * here with its rayfin.yml name and the label people see in the model picker. The connectors service, its configs and
 * runtimes are derived from this map (see src/config/fabric.ts).
 */
export const MODEL_LABELS = {
  retail: 'X10 Retail Demo Model',
} as const satisfies Record<string, string>;

export type ModelKey = keyof typeof MODEL_LABELS;

/** The spec allows up to three bound models. */
export const MAX_MODELS = 3;

export interface ModelChoice {
  key: string;
  label: string;
  /** Short note shown under the picker (demo models explain what they show). */
  note?: string;
}

export function fabricModelChoices(): ModelChoice[] {
  return Object.entries(MODEL_LABELS)
    .slice(0, MAX_MODELS)
    .map(([key, label]) => ({ key, label }));
}
