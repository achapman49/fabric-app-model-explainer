import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, Database, RefreshCw } from 'lucide-react';

import { formatRelative } from '@x10/shared/lib';
import { Badge, Button, Chip, cx, DataState, IconButton, Skeleton, type Tone } from '@x10/shared/ui';

import type { Severity } from '../domain/findings';
import { generateQuestions } from '../domain/questions';
import { SECTION_LABELS, type ModelMetadata, type SectionKey } from '../domain/types';
import { useModel } from '../state/ModelContext';

/** Shown in place of a section whose metadata could not be read: category, message, what was tried, Retry. */
export function SectionUnavailable({ meta, section }: { meta: ModelMetadata; section: SectionKey }) {
  const { refresh } = useModel();
  const status = meta.sections[section];
  if (status.ok) return null;
  return (
    <div role="alert" className="border-l-2 border-warn-solid py-1 pl-4 text-fg" data-testid={`unavailable-${section}`}>
      <div className="flex flex-wrap items-center gap-2">
        <strong className="font-semibold">{SECTION_LABELS[section]}: not available for this model</strong>
        <Badge tone="bad" variant="soft" size="sm">
          {status.error.category}
        </Badge>
      </div>
      <p className="m-0 mt-1.5 max-w-[72ch] text-sm break-words text-muted">{status.error.message}</p>
      <p className="m-0 mt-1.5 text-xs text-muted">
        Tried <code className="x-mono">{status.attempts.join(' then ')}</code>. Everything else still works.
      </p>
      <Button className="mt-3" size="sm" icon={<RefreshCw aria-hidden="true" />} onClick={() => void refresh()}>
        Retry
      </Button>
    </div>
  );
}

/** A skeleton shaped like a tool page: header line, stat strip, rows. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the model" className="space-y-6">
      <div className="space-y-2">
        <Skeleton width={140} height={12} />
        <Skeleton width={280} height={28} />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton width="50%" height={12} />
            <Skeleton width="70%" height={24} />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={40} />
        ))}
      </div>
    </div>
  );
}

/** Loading, error and content for every screen that needs the model metadata. */
export function WithMetadata({ children, skeleton }: { children: (meta: ModelMetadata) => ReactNode; skeleton?: ReactNode }) {
  const { metadata } = useModel();
  return (
    <DataState state={metadata} skeleton={skeleton ?? <PageSkeleton />}>
      {children}
    </DataState>
  );
}

export function severityTone(s: Severity): Tone {
  return s === 'warning' ? 'warn' : 'info';
}

export function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <Badge tone={severityTone(severity)} size="sm">
      {severity === 'warning' ? 'Warning' : 'Info'}
    </Badge>
  );
}

export function HiddenChip() {
  return (
    <Badge tone="neutral" size="sm">
      Hidden
    </Badge>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={`x-mono break-words ${className ?? ''}`}>{children}</code>;
}

/**
 * The semantic model picker: a native select (keyboard and screen readers get the platform control) styled as text.
 * `variant="title"` reads as a page title; `inline` as a small caption.
 */
export function ModelSelect({ variant = 'inline', className }: { variant?: 'title' | 'inline'; className?: string }) {
  const { choices, current, select } = useModel();
  const id = useId();
  const single = choices.length < 2;
  return (
    <span className={cx('relative inline-flex max-w-full min-w-0 items-center', className)}>
      <label htmlFor={id} className="sr-only">
        Semantic model
      </label>
      <select
        id={id}
        value={current.key}
        onChange={(e) => select(e.target.value)}
        disabled={single}
        data-testid="model-picker"
        className={cx(
          'x-model-select min-w-0 max-w-full cursor-pointer appearance-none truncate border-0 bg-transparent text-fg outline-none [field-sizing:content] disabled:cursor-default',
          'rounded-md focus-visible:ring-2 focus-visible:ring-[var(--focus)]',
          variant === 'title' ? 'py-0 pr-7 pl-0 text-xl leading-7 font-semibold tracking-[-0.015em]' : 'py-0.5 pr-6 pl-0 text-ui font-medium',
        )}
      >
        {choices.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      {!single && (
        <ChevronDown
          aria-hidden="true"
          className={cx('pointer-events-none absolute right-0.5 text-muted', variant === 'title' ? 'size-4.5' : 'size-3.5')}
          strokeWidth={2}
        />
      )}
    </span>
  );
}

/** Sections that could not be read, as one quiet line. */
export function MissingSections({ meta }: { meta: ModelMetadata }) {
  const missing = (Object.keys(meta.sections) as SectionKey[]).filter((k) => !meta.sections[k].ok);
  if (!missing.length) return null;
  return (
    <Chip tone="warn" title="These sections could not be read; the rest of the app still works.">
      Not available: {missing.map((k) => SECTION_LABELS[k]).join(', ')}
    </Chip>
  );
}

export function ReloadButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { metadata, refresh } = useModel();
  const [busy, setBusy] = useState(false);
  return (
    <IconButton
        size={size}
        label="Reload metadata"
        icon={<RefreshCw className={busy || metadata.loading ? 'animate-spin' : undefined} />}
        onClick={async () => {
          setBusy(true);
          await refresh();
          setBusy(false);
        }}
    />
  );
}

/**
 * Header for every tool page: the tool's name in the metaphor, the model picker, what loaded and when, reload.
 * Hides the Sample questions nav link while the current model has nothing to ask (the shell nav is static).
 */
export function ToolHeader({
  icon,
  tool,
  title,
  actions,
  meta: extra,
}: {
  icon: ReactNode;
  tool: string;
  title: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  const { metadata, current } = useModel();
  const meta = metadata.data;
  return (
    <header className="x-noprint mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3" data-testid="model-bar">
      <div className="min-w-0 flex-1 basis-[18rem]">
        <div className="mb-2 flex min-w-0 items-center gap-2 text-ui text-muted">
          <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-accent-3 text-accent-11 [&_svg]:size-3.5">{icon}</span>
          <span className="font-medium text-fg">{tool}</span>
          <span aria-hidden="true" className="text-faint">
            /
          </span>
          <Database aria-hidden="true" className="size-3.5 shrink-0 text-faint" />
          <ModelSelect />
        </div>
        <h1 className="m-0 text-xl font-semibold break-words md:text-2xl">{title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-ui text-muted">
          {extra}
          {current.note && <span className="hidden lg:inline">{current.note}</span>}
          {meta && <span>Read {formatRelative(meta.loadedAt)}</span>}
          {meta && <MissingSections meta={meta} />}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <ReloadButton size="md" />
      </div>
    </header>
  );
}

/** Hides the Sample questions tab while the current model has no sample questions (the shell nav is static). */
export function NavGuard() {
  const { metadata } = useModel();
  const meta = metadata.data;
  const none = !!meta && generateQuestions(meta).length === 0;
  return none ? <style>{'a[href="#/probes"] { display: none !important; }'}</style> : null;
}
