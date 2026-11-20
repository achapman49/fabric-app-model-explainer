import { Dialog, Kbd } from '@x10/shared/ui';

const KEYS: { keys: string[]; label: string }[] = [
  { keys: ['1', '2', '3', '4'], label: 'Lens: weather, size, hidden, coverage' },
  { keys: ['V'], label: 'View as modeller or report author' },
  { keys: ['L'], label: 'Sky or list' },
  { keys: ['/'], label: 'Fly to a table or measure' },
  { keys: ['[', ']'], label: 'Previous or next Today item' },
  { keys: ['Esc'], label: 'Back to the whole sky' },
  { keys: ['0'], label: 'Reset the camera' },
  { keys: ['P'], label: 'Pause or resume the orbits' },
  { keys: ['?'], label: 'This list' },
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2.5 text-sm" data-testid="shortcuts">
        {KEYS.map((k) => (
          <div key={k.label} className="contents">
            <dt className="flex gap-1">
              {k.keys.map((x) => (
                <Kbd key={x}>{x}</Kbd>
              ))}
            </dt>
            <dd className="m-0 text-muted">{k.label}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
