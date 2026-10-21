import type { StructureNode } from '@holistics/anfra-sdk/common';
import { Check, ChevronDown, Copy, Send, TriangleAlert, X } from 'lucide-react';
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { attributeFor, copyText, kindIcons, kindPills } from '@/inspector';
import { cn } from '@/lib/utils';
import { nameOf } from '../model/prompt';

/** A rect in the stage's coordinates: the frame's viewport, as the frame fills the stage. */
export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  node: StructureNode;
  /** Where the node is drawn; without one the card sits at the top centre of the stage. */
  rect: AnchorRect | undefined;
  /** The prompt for a comment: the host builds it, so the card doesn't need to know the app. */
  prompt: (comment: string) => string;
  onClose: () => void;
}

/** Where a prompt can be sent. All disabled in this demo (SPEC §8). */
const targets = ['Claude', 'ChatGPT', 'Cursor'];
const disabledReason = 'Disabled by admin';
/** How a button marked aria-disabled looks: as a disabled one, while still showing its tooltip. */
const disabledLook = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

/**
 * The comment box, floating beside the commented node in the stage. Render it inside the stage's
 * `relative` wrapper: its anchor is placed at `rect` there.
 */
export function CommentCard({ node, rect, prompt, onClose }: Props) {
  const [comment, setComment] = useState('');
  const [copied, setCopied] = useState<boolean>();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const empty = !comment.trim();

  // Copied: the card stays a moment so the confirmation is seen, then closes. Refused: it stays.
  useEffect(() => {
    if (copied === undefined) return;
    const timer = setTimeout(copied ? onClose : () => setCopied(undefined), copied ? 900 : 2400);
    return () => clearTimeout(timer);
  }, [copied, onClose]);

  const copy = async () => {
    if (empty) return;
    const text = prompt(comment);
    const ok = await copyText(text);
    if (!ok) console.log(text);
    setCopied(ok);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void copy();
    }
  };

  const Icon = kindIcons[node.kind];
  const attribute = attributeFor(node);
  const copyLabel =
    copied === true ? 'Copied' : copied === false ? "Couldn't copy: logged to the console" : undefined;

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor asChild>
        <div aria-hidden className="pointer-events-none absolute" style={anchorStyle(rect)} />
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        collisionPadding={8}
        // The node moves when the frame scrolls; keep the card on it.
        updatePositionStrategy="always"
        aria-labelledby={titleId}
        className="w-80 max-w-[calc(100vw-16px)] space-y-2 p-3"
        // A stray click in the frame or the host doesn't lose a half-written comment (SPEC §4.1).
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          textarea.current?.focus();
        }}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-xs font-medium capitalize',
              kindPills[node.kind],
            )}
          >
            <Icon className="size-3" />
            {node.kind}
          </span>
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-medium">
            {nameOf(node)}
          </h2>
          <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Discard the comment">
            <X />
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Tooltip>
            <TooltipTrigger asChild>
              <code className="min-w-0 flex-1 truncate font-mono">{attribute}</code>
            </TooltipTrigger>
            <TooltipContent className="max-w-72 break-all">{attribute}</TooltipContent>
          </Tooltip>
          {node.problems.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex shrink-0 items-center gap-1 text-amber-600 dark:text-amber-400">
                  <TriangleAlert className="size-3" />
                  {node.problems.length}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-72">
                <ul className="space-y-0.5">
                  {node.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <Textarea
          ref={textarea}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="What do you want to ask or change?"
          aria-label={`Comment on ${nameOf(node)}`}
          className="max-h-48 min-h-20 resize-none text-sm"
        />

        <div className="flex items-center justify-end gap-2">
          {/* Keyed, so it is either controlled (telling the copy) or not, never switching. */}
          <Tooltip key={copyLabel ? 'told' : 'idle'} open={copyLabel ? true : undefined}>
            <TooltipTrigger asChild>
              {/* aria-disabled, not disabled, so the tooltip still shows on hover and focus. */}
              <Button
                variant="outline"
                size="sm"
                aria-disabled={empty}
                className={disabledLook}
                onClick={copy}
              >
                {copied ? <Check /> : <Copy />}
                Copy
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {copyLabel ?? (empty ? 'Write a comment first' : 'Copy as a prompt')}
            </TooltipContent>
          </Tooltip>
          <SendButton />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Send to Claude, with the other targets under ▾: shown so the design can be seen, all disabled. */
function SendButton() {
  return (
    <div className="inline-flex">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" aria-disabled className={cn('rounded-r-none', disabledLook)}>
            <Send />
            Send to {targets[0]}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className="rounded-l-none border-l border-primary-foreground/20 px-2"
            aria-label="Choose where to send"
          >
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {targets.map((target) => (
            <DropdownMenuItem key={target} disabled>
              Send to {target}
              <span className="ml-auto text-xs text-muted-foreground">{disabledReason}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** The anchor at the node's rect, kept inside the stage so the card never floats off it. */
function anchorStyle(rect: AnchorRect | undefined): CSSProperties {
  if (!rect) return { left: '50%', top: 0, width: 0, height: 0 };
  return {
    left: `clamp(0px, ${rect.x}px, calc(100% - ${Math.min(rect.width, 1)}px))`,
    top: `clamp(0px, ${rect.y}px, calc(100% - ${Math.min(rect.height, 1)}px))`,
    width: rect.width,
    height: rect.height,
  };
}
