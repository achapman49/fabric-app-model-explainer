/** A printable top-down drawing of the orrery (no WebGL): orbits, trails, stars, planets and moons, with labels. */
import { useMemo } from 'react';

import { bodyPosition, moonPosition, orbitCentre, type Orrery } from '../domain/orrery';

export function SystemSchematic({ orrery, className }: { orrery: Orrery; className?: string }) {
  const d = useMemo(() => {
    const t = 0;
    const pos = new Map(orrery.bodies.map((b) => [b.name, bodyPosition(orrery, b, t)]));
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const b of orrery.bodies) {
      const p = pos.get(b.name)!;
      const r = b.reach + 1.5;
      minX = Math.min(minX, p.x - r);
      maxX = Math.max(maxX, p.x + r);
      minZ = Math.min(minZ, p.z - r);
      maxZ = Math.max(maxZ, p.z + r + 1.6);
      if (b.orbit && b.kind === 'planet') {
        const c = orbitCentre(orrery, b);
        minX = Math.min(minX, c.x - b.orbit);
        maxX = Math.max(maxX, c.x + b.orbit);
        minZ = Math.min(minZ, c.z - b.orbit);
        maxZ = Math.max(maxZ, c.z + b.orbit);
      }
    }
    const pad = 2;
    const vb = { x: minX - pad, y: minZ - pad, w: maxX - minX + pad * 2, h: maxZ - minZ + pad * 2 };
    // Label placement: below each body, dropped when it would overlap one already placed.
    const font = Math.max(0.9, vb.w / 48);
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    const labels = [...orrery.bodies]
      .sort((a, b) => (a.kind === 'sun' ? -1 : 0) - (b.kind === 'sun' ? -1 : 0) || b.radius - a.radius)
      .map((b) => {
        const p = pos.get(b.name)!;
        const w = b.name.length * font * 0.56;
        const y = p.z + b.radius + font * 1.15;
        const box = { l: p.x - w / 2, r: p.x + w / 2, t: y - font, b: y + 0.2 };
        const ok = !placed.some((q) => box.l < q.r && box.r > q.l && box.t < q.b && box.b > q.t);
        if (ok) placed.push(box);
        return { b, x: p.x, y, ok };
      });
    return { pos, vb, font, labels };
  }, [orrery]);

  const { pos, vb, font, labels } = d;
  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      className={className}
      role="img"
      aria-label={`Map of the model: ${orrery.bodies.filter((b) => b.kind === 'sun').length} stars, ${orrery.bodies.length} tables, ${orrery.trails.length} relationships.`}
      data-testid="system-schematic"
    >
      <g fill="none" style={{ stroke: 'var(--gray-8)' }} strokeWidth={vb.w / 900}>
        {orrery.bodies
          .filter((b) => b.kind === 'planet' || (b.kind === 'rogue' && b.orbit && orrery.systems[b.system].bodies[0] === b.name))
          .map((b) => {
            const c = orbitCentre(orrery, b);
            return <circle key={`o-${b.name}`} cx={c.x} cy={c.z} r={b.orbit} opacity={0.6} />;
          })}
      </g>
      <g fill="none" strokeWidth={vb.w / 520}>
        {orrery.trails.map((t) => {
          const a = pos.get(t.from)!;
          const b = pos.get(t.to)!;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const len = Math.hypot(dx, dz) || 1;
          const off = t.both ? 0.22 : 0;
          const lines = t.both ? [-1, 1] : [0];
          return lines.map((k) => (
            <line
              key={`${t.id}-${k}`}
              x1={a.x + (-dz / len) * off * k}
              y1={a.z + (dx / len) * off * k}
              x2={b.x + (-dz / len) * off * k}
              y2={b.z + (dx / len) * off * k}
              style={{ stroke: 'var(--gray-10)' }}
              strokeDasharray={t.active ? undefined : `${vb.w / 160} ${vb.w / 220}`}
            />
          ));
        })}
      </g>
      {orrery.moons.map((m) => {
        const p = moonPosition(orrery, m, 0, pos.get(m.table));
        return <circle key={m.id} cx={p.x} cy={p.z} r={0.16} style={{ fill: 'var(--gray-10)' }} opacity={m.hidden ? 0.4 : 1} />;
      })}
      {orrery.bodies.map((b) => {
        const p = pos.get(b.name)!;
        if (b.kind === 'sun')
          return (
            <g key={b.id}>
              <circle cx={p.x} cy={p.z} r={b.radius * 1.9} style={{ fill: 'var(--accent-9)' }} opacity={0.16} />
              <circle cx={p.x} cy={p.z} r={b.radius} style={{ fill: 'var(--accent-9)' }} />
            </g>
          );
        return (
          <circle
            key={b.id}
            cx={p.x}
            cy={p.z}
            r={b.radius}
            style={{ fill: b.hidden ? 'var(--surface)' : 'var(--gray-9)', stroke: 'var(--gray-9)' }}
            strokeWidth={b.hidden ? vb.w / 500 : 0}
            strokeDasharray={b.hidden ? `${vb.w / 400} ${vb.w / 500}` : undefined}
          />
        );
      })}
      <g style={{ fontSize: font }}>
        {labels
          .filter((l) => l.ok)
          .map((l) => (
            <text
              key={l.b.id}
              x={l.x}
              y={l.y}
              textAnchor="middle"
              fontWeight={l.b.kind === 'sun' ? 650 : 500}
              style={{ fill: l.b.hidden ? 'var(--muted)' : 'var(--text)', stroke: 'var(--surface)', strokeWidth: font * 0.28, paintOrder: 'stroke' }}
            >
              {l.b.name}
            </text>
          ))}
      </g>
    </svg>
  );
}
