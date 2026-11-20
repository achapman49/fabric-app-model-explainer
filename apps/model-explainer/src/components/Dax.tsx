import { useMemo } from 'react';

import { CopyButton, cx } from '@x10/shared/ui';

import { tokenizeDax, type DaxTokenKind } from '../domain/daxTokens';

const KIND_CLASS: Record<DaxTokenKind, string> = {
  keyword: 'text-plum-11 font-semibold',
  function: 'text-accent-11 font-medium',
  table: 'text-amber-11',
  column: 'text-blue-11',
  string: 'text-green-11',
  number: 'text-coral-11',
  comment: 'text-faint italic',
  operator: 'text-muted',
  text: 'text-fg',
};

/** DAX with syntax highlighting (functions, tables, columns, strings, numbers, comments) and an optional copy button. */
export function Dax({ code, copy, className, testId, compact }: { code: string; copy?: boolean; className?: string; testId?: string; compact?: boolean }) {
  const tokens = useMemo(() => tokenizeDax(code), [code]);
  return (
    <div className={cx('min-w-0', className)}>
      {copy && (
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="x-legend-label text-faint">DAX</span>
          <CopyButton text={code} label="Copy DAX" size="sm" variant="ghost" />
        </div>
      )}
      <pre
        className={cx(
          'x-mono x-dax m-0 min-w-0 overflow-auto rounded-lg border border-line bg-surface-sunken whitespace-pre-wrap break-words',
          compact ? 'px-2.5 py-1.5 text-[12px] leading-5' : 'px-3 py-2.5 text-[12.5px] leading-[1.6]',
        )}
        data-testid={testId}
      >
        {tokens.map((t, i) => (
          <span key={i} className={KIND_CLASS[t.kind]}>
            {t.text}
          </span>
        ))}
      </pre>
    </div>
  );
}
