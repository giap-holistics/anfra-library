import { Check, ClipboardCopy, Locate, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { queryCounts } from '../model/issues';
import { TRUST_LEVELS, type Trust } from '../model/trust';
import type { QueriesFilter } from '../model/types';
import { copyText } from './shared/copy-button';
import { stateDot, toneText } from './shared/tone';

interface Props {
  title: string;
  /** Undefined until the frame has reported. */
  counts: ReturnType<typeof queryCounts> | undefined;
  /** The app's trust level; the lowest across apps. Undefined until the frame has reported. */
  trust: Trust | undefined;
  /** Whether the frame is in pick mode. */
  picking: boolean;
  onTogglePicking: () => void;
  /** Open the Queries tab on the queries counted, filtered to them. */
  onShowQueries: (filter: QueriesFilter['filter']) => void;
  /** The report, as JSON, built when asked for. */
  report: () => string;
  onClose: () => void;
}

/** The panel's top: what is inspected, its queries at a glance, Pick, Copy report and close. */
export function InspectorHeader({
  title,
  counts,
  trust,
  picking,
  onTogglePicking,
  onShowQueries,
  report,
  onClose,
}: Props) {
  return (
    <div className="shrink-0 space-y-1 px-2 pt-1.5 pb-2">
      <div className="flex h-7 items-center gap-1">
        <h2 className="min-w-0 flex-1 truncate pl-1 text-sm font-medium">{title}</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(picking && 'bg-accent text-accent-foreground')}
              onClick={onTogglePicking}
              aria-pressed={picking}
            >
              <Locate />
              Pick
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {picking
              ? 'Stop picking'
              : 'Pick an element on the page · Shift-click to open its query or control in Queries'}
          </TooltipContent>
        </Tooltip>
        <CopyReport report={report} />
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close the inspect panel">
          <X />
        </Button>
      </div>
      {counts && <StatusBar counts={counts} trust={trust} onClick={onShowQueries} />}
    </div>
  );
}

/**
 * Query counts by state, and dirty queries and controls; each opens Queries on them. A zero count is
 * left out.
 */
function StatusBar({
  counts,
  trust,
  onClick,
}: {
  counts: ReturnType<typeof queryCounts>;
  trust: Trust | undefined;
  onClick: (filter: QueriesFilter['filter']) => void;
}) {
  const items = [
    {
      n: counts.success,
      label: 'ok',
      dot: stateDot.success,
      filter: 'all',
      pill: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
    },
    {
      n: counts.error,
      label: 'error',
      dot: stateDot.error,
      filter: 'errors',
      pill: 'bg-red-100 text-red-800 hover:bg-red-200/80 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25',
    },
    {
      n: counts.executing,
      label: 'running',
      dot: stateDot.executing,
      filter: 'all',
      pill: 'bg-sky-100 text-sky-800 hover:bg-sky-200/80 dark:bg-sky-500/15 dark:text-sky-300 dark:hover:bg-sky-500/25',
    },
    {
      n: counts.idle,
      label: 'idle',
      dot: stateDot.idle,
      filter: 'all',
      pill: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
    },
    {
      n: counts.dirty + counts.dirtyControls,
      label: 'dirty',
      dot: 'bg-amber-500',
      filter: 'dirty',
      pill: 'bg-amber-100 text-amber-800 hover:bg-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25',
    },
  ] as const;
  const shown = items.filter((item) => item.n > 0);
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 pt-0.5">
      {trust && <TrustPill trust={trust} />}
      {shown.length === 0 && <Badge variant="secondary">No queries</Badge>}
      {shown.map((item) => (
        <Badge
          key={item.label}
          asChild
          className={cn('cursor-pointer px-2.5 py-1 font-semibold tabular-nums', item.pill)}
        >
          <button type="button" onClick={() => onClick(item.filter)}>
            <span className={cn('size-1.5 rounded-full', item.dot)} />
            {item.n} {item.label}
          </button>
        </Badge>
      ))}
    </div>
  );
}

/** Copies the report; when the clipboard refuses, logs it so it is still one step away. */
function CopyReport({ report }: { report: () => string }) {
  const [status, setStatus] = useState<'copied' | 'logged'>();
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(undefined), 1800);
    return () => clearTimeout(timer);
  }, [status]);

  const copy = async () => {
    const text = report();
    if (await copyText(text)) return setStatus('copied');
    console.log(text);
    setStatus('logged');
  };

  const label =
    status === 'copied'
      ? 'Report copied'
      : status === 'logged'
        ? "Couldn't copy: logged to the console"
        : 'Copy report';
  return (
    <Tooltip open={status ? true : undefined}>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={label}>
          {status === 'copied' ? <Check /> : <ClipboardCopy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The trust level: L and its number in the tone's color, then the name; why on hover. */
function TrustPill({ trust }: { trust: Trust }) {
  const { name } = TRUST_LEVELS[trust.level];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className="cursor-default gap-1.5 bg-secondary px-2.5 py-1 font-semibold text-secondary-foreground">
          <span className={toneText[trust.tone]}>L{trust.level}</span>
          <span>{name}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{trust.text}</TooltipContent>
    </Tooltip>
  );
}
