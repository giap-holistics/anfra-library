import { Check, Copy } from 'lucide-react';
import { type MouseEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Copy text, reporting whether the clipboard took it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A small button that copies `text`, and says so for a moment. */
export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const onClick = async (event: MouseEvent) => {
    event.stopPropagation();
    setCopied(await copyText(text));
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className={className}
          aria-label={copied ? 'Copied' : label}
          onClick={onClick}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 break-all">
        {copied ? 'Copied' : `${label}: ${text}`}
      </TooltipContent>
    </Tooltip>
  );
}
