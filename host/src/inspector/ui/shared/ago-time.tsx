import { useSyncExternalStore } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatAgo, formatTime } from '../../model/format';

// One clock for every AgoTime on screen: it ticks only while one is mounted, and they all move together.
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, 10_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** A moment in natural time that keeps up; the full time on hover. */
export function AgoTime({ at }: { at: Date | string }) {
  const current = useSyncExternalStore(subscribe, () => now);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{formatAgo(at, current)}</span>
      </TooltipTrigger>
      <TooltipContent>{formatTime(at)}</TooltipContent>
    </Tooltip>
  );
}
