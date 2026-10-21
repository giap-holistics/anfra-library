import { Check, Copy, X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { copyText } from '@/inspector/ui/shared/copy-button';
import type { AppPrompt } from '@/lib/host';

interface Props {
  prompt: AppPrompt;
  onClose: () => void;
}

/** The prompt that made the open Data App, boxed like a note, with the model that answered it and when. */
export function PromptPanel({ prompt, onClose }: Props) {
  return (
    <div className="flex h-full flex-col border-l">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        <h2 className="min-w-0 flex-1 truncate pl-2 text-sm font-medium">Prompt</h2>
        <CopyPrompt text={prompt.prompt} />
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onClose}
          aria-label="Close the prompt panel"
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-3 rounded-lg border border-paper-border bg-paper px-4 py-3 font-sans text-[15px] leading-[1.7] break-words text-paper-foreground">
          {blocksOf(prompt.prompt)}
        </div>
        <Footer prompt={prompt} />
      </div>
    </div>
  );
}

function Footer({ prompt }: { prompt: AppPrompt }) {
  const parts: ReactNode[] = [];
  if (prompt.model) parts.push(<span key="model">{prompt.model}</span>);
  if (prompt.effort) parts.push(<span key="effort">{prompt.effort} effort</span>);
  if (prompt.createdAt) parts.push(<Time key="created" label="Created" value={prompt.createdAt} />);
  if (prompt.updatedAt && prompt.updatedAt !== prompt.createdAt) {
    parts.push(<Time key="updated" label="Updated" value={prompt.updatedAt} />);
  }
  if (parts.length === 0) return null;
  return (
    <p className="mt-3 flex flex-wrap gap-x-2 gap-y-1 px-1 text-xs text-muted-foreground [&>*+*]:before:mr-2 [&>*+*]:before:content-['·']">
      {parts}
    </p>
  );
}

/** A day, with the full time on hover; as written if it isn't a timestamp. */
function Time({ label, value }: { label: string; value: string }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span>{`${label} ${value}`}</span>;
  // A bare date parses as UTC midnight: show it in UTC, or it is a day early west of Greenwich.
  const day = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : undefined,
  });
  return (
    <time dateTime={value} title={date.toLocaleString()}>
      {`${label} ${day}`}
    </time>
  );
}

const itemRe = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/;
const headingRe = /^#{1,6}\s+(.*)$/;

/**
 * The prompt as paragraphs and lists. Prompts are typed like Markdown, so its lightest parts are
 * honoured: `-`, `*` and numbered items, `#` headings, `code` and **bold**.
 */
function blocksOf(text: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | undefined;
  const flush = () => {
    const key = blocks.length;
    if (paragraph.length) {
      blocks.push(
        <p key={key} className="whitespace-pre-line">
          {inline(paragraph.join('\n'))}
        </p>,
      );
    } else if (list) {
      // biome-ignore lint/suspicious/noArrayIndexKey: items are positional
      const items = list.items.map((item, i) => <li key={i}>{inline(item)}</li>);
      blocks.push(
        list.ordered ? (
          <ol key={key} className="list-decimal space-y-1 pl-5 marker:text-paper-muted">
            {items}
          </ol>
        ) : (
          <ul key={key} className="list-disc space-y-1 pl-5 marker:text-paper-muted">
            {items}
          </ul>
        ),
      );
    }
    paragraph = [];
    list = undefined;
  };

  for (const line of text.split(/\r?\n/)) {
    const item = itemRe.exec(line);
    const heading = headingRe.exec(line);
    if (!line.trim()) {
      flush();
    } else if (item) {
      const ordered = item[2] !== undefined;
      if (paragraph.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push(item[3] ?? '');
    } else if (heading) {
      flush();
      blocks.push(
        <p key={blocks.length} className="font-semibold">
          {inline(heading[1] ?? '')}
        </p>,
      );
    } else if (list && /^\s+\S/.test(line)) {
      // An indented line goes on with the item above it.
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      if (list) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** `code` and **bold** within a line. */
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional
          key={i}
          className="rounded bg-paper-code px-1 py-0.5 font-mono text-[0.85em] text-paper-code-foreground"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function CopyPrompt({ text }: { text: string }) {
  const [copied, setCopied] = useState<boolean>();
  useEffect(() => {
    if (copied === undefined) return;
    const timer = setTimeout(() => setCopied(undefined), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  const label = copied === true ? 'Prompt copied' : copied === false ? "Couldn't copy" : 'Copy prompt';
  return (
    <Tooltip open={copied === undefined ? undefined : true}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={async () => setCopied(await copyText(text))}
          aria-label={label}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
