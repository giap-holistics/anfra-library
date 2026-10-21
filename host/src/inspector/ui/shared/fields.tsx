import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Label / value pairs, two columns. */
export function Fields({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm', className)}>{children}</dl>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

/** A small (i) that explains on hover; the tooltip text keeps its own case and weight inside an uppercase title. */
export function InfoHint({
  children,
  label,
  side,
  className,
}: {
  children: ReactNode;
  label: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="cursor-help text-muted-foreground transition-colors hover:text-foreground"
        >
          <Info className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className={cn('max-w-64 text-xs font-normal tracking-normal normal-case', className)}
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

/** A section's small uppercase title, with an optional (i) hint saying what the section is for. */
export function SectionTitle({
  children,
  hint,
  className,
}: {
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-1 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase',
        className,
      )}
    >
      {children}
      {hint && <InfoHint label="About this section">{hint}</InfoHint>}
    </span>
  );
}

/** A line saying what is missing, and why. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <Empty className="flex-none gap-0 border bg-muted/30 p-4 md:p-4">
      <EmptyDescription className="text-xs">{children}</EmptyDescription>
    </Empty>
  );
}
