/** React wrapper for the three.js orrery. Default export so it can be lazy-loaded (three.js stays out of the main chunk). */
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

import { cssVar, useThemeColors } from '@x10/shared/ui';

import type { Orrery } from '../domain/orrery';
import type { Looks, Paint } from './look';
import { OrreryScene } from './scene';

export interface OrreryApi {
  zoom(factor: number): void;
  overview(): void;
}

export interface OrreryCanvasProps {
  orrery: Orrery;
  looks: Looks;
  focus: string | null;
  reduced: boolean;
  paused: boolean;
  onPick(id: string | null): void;
  onError(message: string): void;
  apiRef?: Ref<OrreryApi | null>;
}

export default function OrreryCanvas({ orrery, looks, focus, reduced, paused, onPick, onError, apiRef }: OrreryCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<OrreryScene | null>(null);
  const [ready, setReady] = useState(false);
  const colors = useThemeColors();
  const pick = useRef(onPick);
  pick.current = onPick;
  const fail = useRef(onError);
  fail.current = onError;

  useEffect(() => {
    const s = new OrreryScene(host.current!, labels.current!, {
      onPick: (id) => pick.current(id),
      onReady: () => setReady(true),
      onError: (m) => fail.current(m),
    });
    scene.current = s;
    return () => {
      s.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.setTheme({ dark: colors.dark, resolve: (p: Paint) => cssVar(p) });
  }, [colors]);
  useEffect(() => {
    scene.current?.setData(orrery);
  }, [orrery]);
  useEffect(() => {
    scene.current?.setLooks(looks);
  }, [looks]);
  useEffect(() => {
    scene.current?.setFocus(focus);
  }, [focus, orrery]);
  useEffect(() => {
    scene.current?.setMotion(reduced, paused);
  }, [reduced, paused]);

  useImperativeHandle(
    apiRef,
    () => ({
      zoom: (f: number) => scene.current?.zoom(f),
      overview: () => scene.current?.overview(reduced),
    }),
    [reduced],
  );

  return (
    <div ref={host} className="absolute inset-0 overflow-hidden" data-testid="orrery-canvas" data-ready={ready ? 'true' : 'false'}>
      <div ref={labels} className="orrery-labels pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
