import { BadgeCheck, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Entry } from '@/lib/host';

type App = Extract<Entry, { kind: 'app' }>;

/** The (i) beside the title: where the app lives and what its metadata says of it. */
export function AppInfo({ app }: { app: App }) {
  const { prompt } = app;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          aria-label="About this app"
        >
          <Info className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="space-y-2 text-sm">
        {app.description && <p>{app.description}</p>}
        <Row label="Path">
          <code className="break-all text-xs">{app.path}</code>
        </Row>
        {app.endorsed && (
          <Row label="Status">
            <span className="inline-flex items-center gap-1">
              <BadgeCheck className="size-3.5" /> Endorsed
            </span>
          </Row>
        )}
        {app.tags.length > 0 && <Row label="Tags">{app.tags.join(', ')}</Row>}
        {prompt?.effort && <Row label="Effort">{prompt.effort}</Row>}
        {prompt?.createdAt && <Row label="Created">{formatTime(prompt.createdAt)}</Row>}
        {prompt?.updatedAt && prompt.updatedAt !== prompt.createdAt && (
          <Row label="Updated">{formatTime(prompt.updatedAt)}</Row>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-baseline gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** A day with its time; as written if it isn't a timestamp. A bare date is read in UTC. */
function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return date.toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
  }
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
