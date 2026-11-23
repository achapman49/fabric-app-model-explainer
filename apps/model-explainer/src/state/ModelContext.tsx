/**
 * Selected semantic model, its query client and its metadata (loaded once per model and shared by every screen).
 * Demo mode serves the fictional mock models; Fabric mode wraps `client.connectors.<name>` from config/models.ts.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { connectorModelClient, errorResult, type ConnectorLike, type ModelClient } from '@x10/shared/connectors';
import { useAsync, type AsyncState } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';

import { fabricModelChoices, type ModelChoice } from '../config/models';
import { allTableNames, loadMetadata } from '../domain/metadata';
import { countAllRows } from '../domain/queries';
import type { ModelMetadata } from '../domain/types';
import { MOCK_MODELS, mockClient } from '../mock/engine';

/** Row counts per table, loaded on demand and cached per model. */
export interface RowCounts {
  counts: Map<string, number> | null;
  loading: boolean;
  error: { category: string; message: string } | null;
  /** Count rows for every table (one batched query per 20 tables). No-op while loading or once loaded. */
  weigh(force?: boolean): void;
}

export interface ModelContextValue {
  choices: ModelChoice[];
  current: ModelChoice;
  client: ModelClient;
  select(key: string): void;
  metadata: AsyncState<ModelMetadata>;
  /** Drop the cached metadata for the current model and load it again. */
  refresh(): Promise<void>;
  rows: RowCounts;
}

const Ctx = createContext<ModelContextValue | null>(null);

export function useModel(): ModelContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useModel must be used inside <ModelProvider>.');
  return v;
}

function readKey(storageKey: string): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}
function writeKey(storageKey: string, value: string) {
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    /* per-viewer convenience only */
  }
}

/** A client whose every query fails with a setup message (connector missing from the build). */
function missingConnector(choice: ModelChoice): ModelClient {
  return {
    label: choice.label,
    executeQuery: async () =>
      errorResult('api', `The connector "${choice.key}" is not registered on this build. Add it with rayfin connector add and redeploy.`),
  };
}

export function ModelProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const storageKey = `x10:${app.config.appId}:model:${app.mode}`;

  const { choices, clients } = useMemo(() => {
    if (app.mode === 'demo') {
      const latency = Number(import.meta.env.VITE_X10_LATENCY ?? 250);
      const ms = Number.isFinite(latency) ? latency : 0;
      return {
        choices: MOCK_MODELS.map((m) => ({ key: m.key, label: m.label, note: m.note })),
        clients: new Map<string, ModelClient>(MOCK_MODELS.map((m) => [m.key, mockClient(m, ms)])),
      };
    }
    const list = fabricModelChoices();
    const connectors = (app.client?.connectors ?? {}) as Record<string, ConnectorLike | undefined>;
    return {
      choices: list,
      clients: new Map<string, ModelClient>(
        list.map((c) => {
          const conn = connectors[c.key];
          return [c.key, conn ? connectorModelClient(conn, c.label) : missingConnector(c)];
        }),
      ),
    };
  }, [app.mode, app.client]);

  const [key, setKey] = useState(() => {
    const saved = readKey(storageKey);
    return choices.some((c) => c.key === saved) ? saved! : choices[0].key;
  });
  const [nonce, setNonce] = useState(0);
  const cache = useRef(new Map<string, ModelMetadata>());

  const current = choices.find((c) => c.key === key) ?? choices[0];
  const client = clients.get(current.key)!;

  const metadata = useAsync(async () => {
    const hit = cache.current.get(current.key);
    if (hit) return hit;
    const meta = await loadMetadata(client);
    cache.current.set(current.key, meta);
    return meta;
  }, [current.key, nonce]);

  const select = useCallback(
    (next: string) => {
      setKey(next);
      writeKey(storageKey, next);
    },
    [storageKey],
  );

  const refresh = useCallback(async () => {
    cache.current.delete(current.key);
    rowCache.current.delete(current.key);
    setRowState((s) => ({ ...s, [current.key]: undefined }));
    setNonce((n) => n + 1);
  }, [current.key]);

  // Row counts: on demand (Count all rows), cached per model.
  const rowCache = useRef(new Map<string, Map<string, number>>());
  const [rowState, setRowState] = useState<Record<string, { loading: boolean; error: RowCounts['error'] } | undefined>>({});
  const loadedMeta = metadata.data && metadata.data.modelLabel === current.label ? metadata.data : undefined;
  const weigh = useCallback(
    (force = false) => {
      const key = current.key;
      if (!loadedMeta || rowState[key]?.loading || (!force && rowCache.current.has(key))) return;
      const names = allTableNames(loadedMeta);
      setRowState((s) => ({ ...s, [key]: { loading: true, error: null } }));
      void countAllRows(client, names).then(({ counts, error }) => {
        if (counts.size) rowCache.current.set(key, counts);
        setRowState((s) => ({ ...s, [key]: { loading: false, error } }));
      });
    },
    [current.key, client, loadedMeta, rowState],
  );
  const rows: RowCounts = {
    counts: rowCache.current.get(current.key) ?? null,
    loading: rowState[current.key]?.loading ?? false,
    error: rowState[current.key]?.error ?? null,
    weigh,
  };

  // useAsync keeps the previous model's data while the next loads; hide it so screens never mix models.
  const stale = metadata.data && metadata.data.modelLabel !== current.label;
  const state: AsyncState<ModelMetadata> = stale ? { ...metadata, data: undefined, loading: true } : metadata;

  const value: ModelContextValue = { choices, current, client, select, metadata: state, refresh, rows };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
