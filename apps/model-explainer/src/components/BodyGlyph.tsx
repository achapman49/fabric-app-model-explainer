import type { BodyKind } from '../domain/orrery';

/** Small inline mark for a body in lists and tables: star, planet, shared, rogue or moon. Decorative. */
export function BodyGlyph({ kind, hidden, color, size = 16 }: { kind: BodyKind | 'moon'; hidden?: boolean; color?: string; size?: number }) {
  const fill = color ?? (kind === 'sun' ? 'var(--accent-9)' : 'var(--gray-9)');
  const op = hidden ? 0.45 : 1;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0" style={{ opacity: op }}>
      {kind === 'sun' && (
        <>
          <circle cx="8" cy="8" r="7.5" fill={fill} opacity="0.18" />
          <circle cx="8" cy="8" r="5" fill={fill} />
          <circle cx="6.6" cy="6.6" r="1.8" fill="white" opacity="0.55" />
        </>
      )}
      {kind === 'planet' && (
        <>
          <circle cx="8" cy="8" r="5" fill={fill} />
          <path d="M3.4 7.2h9.2M3.6 9.4h8.8" stroke="white" strokeOpacity="0.35" strokeWidth="1" />
          {hidden && <circle cx="8" cy="8" r="6.8" fill="none" stroke={fill} strokeDasharray="2 1.6" />}
        </>
      )}
      {kind === 'shared' && (
        <>
          <circle cx="8" cy="8" r="4.5" fill={fill} />
          <circle cx="8" cy="8" r="7" fill="none" stroke={fill} strokeOpacity="0.5" />
        </>
      )}
      {kind === 'rogue' && <circle cx="8" cy="8" r="4.5" fill="none" stroke={fill} strokeWidth="1.6" strokeDasharray="2.2 1.6" />}
      {kind === 'moon' && <circle cx="8" cy="8" r="3" fill={color ?? 'var(--gray-10)'} />}
    </svg>
  );
}
