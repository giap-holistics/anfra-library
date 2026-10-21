import { GitCompare, History, Minus, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatAgo } from '@/inspector/model/format';
import { type MockChangeKind, type MockVersion, mockVersionsFor } from '@/lib/mock-versions';
import { cn } from '@/lib/utils';

const changeStyle: Record<MockChangeKind, { icon: ReactNode; className: string }> = {
  added: { icon: <Plus className="size-3" />, className: 'text-emerald-600 dark:text-emerald-400' },
  changed: { icon: <Pencil className="size-3" />, className: 'text-amber-600 dark:text-amber-400' },
  removed: { icon: <Minus className="size-3" />, className: 'text-destructive' },
};

interface Props {
  onClose: () => void;
}

/**
 * A preview of the open Data App's version history, drawn from mock data because apps have no
 * history yet. Every part that stands in for the real thing says so: the banner, the "Sample" tag on
 * each version and the disabled actions.
 */
export function VersionsPanel({ onClose }: Props) {
  const versions = mockVersionsFor();

  return (
    <div className="flex h-full flex-col border-l">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        <h2 className="min-w-0 flex-1 truncate pl-2 text-sm font-medium">Versions</h2>
        <Badge variant="outline">Demo data</Badge>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onClose}
          aria-label="Close the versions panel"
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <MockBanner />
        <ol className="space-y-2">
          {versions.map((version) => (
            <li key={version.id}>
              <VersionRow version={version} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Says, before anything else, that what follows is not real. */
function MockBanner() {
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground"
    >
      <History className="mt-px size-3.5 shrink-0" />
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline">Demo data</Badge>
          <Badge variant="secondary">Coming soon</Badge>
        </div>
        <p>
          Version history isn't available yet. The versions below are made up, to show how it will look once
          it is ready.
        </p>
      </div>
    </div>
  );
}

function VersionRow({ version }: { version: MockVersion }) {
  return (
    <div className={cn('space-y-2 rounded-lg border p-3', version.current && 'bg-muted/30')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={version.current ? 'default' : 'outline'}>{version.id}</Badge>
        {version.current && <span className="text-xs font-medium">Current</span>}
        <span className="ml-auto text-[10px] tracking-wide text-muted-foreground uppercase">Sample</span>
      </div>
      <p className="text-sm">{version.summary}</p>
      <ul className="space-y-0.5">
        {version.changes.map((change) => (
          <li
            key={`${change.kind}:${change.text}`}
            className={cn('flex items-center gap-1.5 text-xs', changeStyle[change.kind].className)}
          >
            {changeStyle[change.kind].icon}
            <span className="text-foreground">{change.text}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {version.author} · <VersionTime at={version.createdAt} />
        </p>
        <SoonButton icon={<GitCompare />}>Compare</SoonButton>
        {!version.current && <SoonButton icon={<RotateCcw />}>Restore</SoonButton>}
      </div>
    </div>
  );
}

/** How long ago a version was made; the full date on hover. */
function VersionTime({ at }: { at: Date }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{formatAgo(at)}</span>
      </TooltipTrigger>
      <TooltipContent>{at.toLocaleString()}</TooltipContent>
    </Tooltip>
  );
}

/** An action that isn't built yet: shown so the design reads whole, disabled, and says why on hover. */
function SoonButton({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button swallows pointer events, so the span carries the tooltip. */}
        <span>
          <Button variant="outline" size="xs" disabled>
            {icon}
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>Coming soon</TooltipContent>
    </Tooltip>
  );
}
