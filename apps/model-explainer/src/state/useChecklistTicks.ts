/**
 * Ticked checklist items, remembered per model in this browser's localStorage (a per-viewer convenience: nothing is
 * written to the model or shared). Ticks for objects that were since fixed simply stop matching any item.
 */
import { useCallback, useEffect, useState } from 'react';

import { useApp } from '@x10/shared/runtime';

function read(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function write(key: string, done: Set<string>) {
  try {
    if (done.size) localStorage.setItem(key, JSON.stringify([...done]));
    else localStorage.removeItem(key);
  } catch {
    /* storage full or blocked: ticks just won't survive a reload */
  }
}

export function useChecklistTicks(modelLabel: string) {
  const app = useApp();
  const key = `x10:${app.config.appId}:checklist:${app.mode}:${modelLabel}`;
  // Key and ticks change together, so switching models never writes one model's ticks under another's key.
  const [state, setState] = useState(() => ({ key, done: read(key) }));
  if (state.key !== key) setState({ key, done: read(key) });
  const done = state.key === key ? state.done : read(key);

  useEffect(() => write(state.key, state.done), [state]);

  const toggle = useCallback(
    (id: string, on: boolean) =>
      setState((s) => {
        const next = new Set(s.done);
        if (on) next.add(id);
        else next.delete(id);
        return { key: s.key, done: next };
      }),
    [],
  );
  const reset = useCallback(() => setState((s) => ({ key: s.key, done: new Set() })), []);
  return { done, toggle, reset };
}
