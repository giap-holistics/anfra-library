import type { EntityUsage, LocateKind, LocateTarget } from '@holistics/anfra-sdk/common';
import { ArrowRight, ChevronRight, Locate } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { entityAttribute, plural } from '../../model/format';
import type { RevealTarget } from '../../model/types';
import { CopyButton } from '../shared/copy-button';

/** What every query and control row takes. */
export interface RowProps {
  entityKey: string;
  open: boolean;
  onToggle: () => void;
  app: number;
  name: string;
  usage: EntityUsage | undefined;
  /** The structure node key of a block this entity is drawn in, to open it in the Structure tab. */
  blockKey: (block: string) => string | undefined;
  onLocate: (target: LocateTarget) => void;
}

/** A row's shell: one clickable line, a locate button, and what shows when it is open. */
export function EntityRow({
  kind,
  summary,
  below,
  children,
  ...props
}: RowProps & { kind: LocateKind; summary: ReactNode; below?: ReactNode; children: ReactNode }) {
  return (
    <div
      data-entity={props.entityKey}
      className={cn('rounded-md border', props.open ? 'bg-muted/50' : 'bg-card')}
    >
      <div className="group flex h-10 items-center gap-2.5 rounded-md pr-2 hover:bg-accent">
        <button
          type="button"
          className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-3 text-left text-sm"
          onClick={props.onToggle}
          aria-expanded={props.open}
        >
          {summary}
        </button>
        {/* The row button already carries the expanded state; this one is the same click, closer to hand. */}
        <Button variant="ghost" size="icon-xs" tabIndex={-1} aria-hidden onClick={props.onToggle}>
          <ChevronRight className={cn('transition-transform', props.open && 'rotate-90')} />
        </Button>
      </div>
      {below}
      {props.open && <div className="space-y-3 px-3 pt-1.5 pb-3">{children}</div>}
    </div>
  );
}

/** Where an entity shows up on the page: a count that opens into its blocks, each with locate and reveal buttons. */
export function Drawn({
  kind,
  app,
  name,
  usage,
  blockKey,
  onReveal,
  onLocate,
}: {
  kind: LocateKind;
  app: number;
  name: string;
  usage?: EntityUsage;
  blockKey: RowProps['blockKey'];
  onReveal: (target: RevealTarget) => void;
  onLocate: RowProps['onLocate'];
}) {
  if (!usage) {
    return <span className="text-muted-foreground">Not on the page yet</span>;
  }
  return (
    <Expandable
      label={
        <>
          In {plural(usage.markers, 'place')}
          {!usage.blocks.length && ', outside any block'}
        </>
      }
      aside={<CopyButton text={entityAttribute(kind, app, name)} label="Copy the handle" className="-my-1" />}
    >
      <ul className="space-y-0.5 pl-1">
        {usage.blocks.length === 0 && (
          <li className="flex items-center gap-1">
            <span className="flex-1 text-muted-foreground">Outside any block</span>
            <IconButton label="Highlight on the page" onClick={() => onLocate({ app, kind, name })}>
              <Locate />
            </IconButton>
          </li>
        )}
        {usage.blocks.map((block) => {
          const key = blockKey(block);
          return (
            <li key={block} className="flex items-center gap-1 rounded-md pl-2 hover:bg-accent">
              <span className="min-w-0 flex-1 truncate">{block}</span>
              {key && (
                <>
                  <IconButton label="Highlight on the page" onClick={() => onLocate({ node: key })}>
                    <Locate />
                  </IconButton>
                  <IconButton label="Show in Structure" onClick={() => onReveal({ node: key })}>
                    <ArrowRight />
                  </IconButton>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </Expandable>
  );
}

/** A count that opens into its list, with room beside it for an action. */
export function Expandable({
  label,
  aside,
  children,
}: {
  label: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:underline"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
          {label}
        </button>
        {aside}
      </div>
      {open && children}
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
