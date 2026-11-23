import type { TableRole } from '../domain/model';

/** Small inline mark for a table's role in lists: a filled accent tile for facts, grey for dimensions, dashed for unrelated. Decorative. */
export function RoleMark({ role, hidden, size = 16 }: { role: TableRole; hidden?: boolean; size?: number }) {
  const colour = role === 'fact' ? 'var(--accent-9)' : 'var(--gray-9)';
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0" style={{ opacity: hidden ? 0.45 : 1 }}>
      {role === 'unrelated' ? (
        <rect x="2.5" y="3" width="11" height="10" rx="2" fill="none" stroke={colour} strokeWidth="1.5" strokeDasharray="2.2 1.6" />
      ) : (
        <>
          <rect x="2" y="2.5" width="12" height="11" rx="2.2" fill={colour} />
          <path d="M2.5 6.2h11M6.5 6.2v6.8" stroke="white" strokeOpacity="0.45" strokeWidth="1" />
        </>
      )}
    </svg>
  );
}

/** A small status dot (for example a measure's coverage colour). Decorative. */
export function StatusDot({ color, hidden, size = 14 }: { color: string; hidden?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0" style={{ opacity: hidden ? 0.45 : 1 }}>
      <circle cx="8" cy="8" r="4" fill={color} />
    </svg>
  );
}
