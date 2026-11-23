/**
 * Semantic models this app can explain, keyed by the connector name in rayfin/rayfin.yml.
 *
 * To add a model (up to 3): run `npx rayfin connector add` for a fabric-semanticmodel connector, then add ONE line
 * here with its rayfin.yml name and the label people see in the model picker. The connectors service, its configs and
 * runtimes are derived from this map (see src/config/fabric.ts).
 *
 * The committed default is the fictional sample model the project ships (tools/demo-model builds "X10 Retail Demo
 * Model" in a workspace). To explain your own model, set VITE_MODEL_LABEL in apps/model-explainer/.env.fabric.local
 * and its ids in rayfin/.env (both git-ignored), so its name and ids stay out of the repo. This file is also loaded in
 * Node by tools/seed-fabric.mjs, where import.meta.env does not exist, hence the guarded read.
 */
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

export const MODEL_LABELS = {
  retail: env.VITE_MODEL_LABEL?.trim() || 'X10 Retail Demo Model',
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
