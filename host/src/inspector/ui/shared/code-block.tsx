import { Fragment, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { type Lang, type TokenKind, tokenize } from '../../model/highlight';
import { CopyButton } from './copy-button';

/** One code tab: its label, its code and language, and why it is empty when it is. */
export interface CodeSource {
  label: string;
  code: string | undefined;
  /** Highlighted as this language; plain when absent. */
  lang?: Lang;
  empty: string;
}

const tokenColor: Record<TokenKind, string> = {
  kw: 'font-semibold text-violet-700 dark:text-violet-300',
  str: 'text-emerald-700 dark:text-emerald-300',
  num: 'text-amber-700 dark:text-amber-300',
  com: 'italic text-muted-foreground',
  fn: 'text-blue-700 dark:text-blue-300',
};

/** Several pieces of code, one at a time: tabs, a copy button, and the code. */
export function CodeBlock<T extends string>({
  tab,
  onTab,
  sources,
  className,
}: {
  tab: T;
  onTab: (tab: T) => void;
  sources: Record<T, CodeSource>;
  /** For the code area, e.g. a taller max height. */
  className?: string;
}) {
  const tabs = Object.keys(sources) as T[];
  // The reader's tab, or the first with something in it.
  const shown = sources[tab].code ? tab : (tabs.find((t) => sources[t].code) ?? tab);
  const { label, code, lang, empty } = sources[shown];
  const body = code ? (
    <pre
      className={cn('max-h-56 overflow-auto bg-code px-4 py-3 font-mono text-xs leading-relaxed', className)}
    >
      <Highlighted code={code} lang={lang} />
    </pre>
  ) : (
    <p className="bg-code px-4 py-3 text-xs text-muted-foreground">{empty}</p>
  );
  // One piece of code has nothing to pick: no tabs, the copy button over the code's corner.
  if (tabs.length === 1) {
    return (
      <div className="relative overflow-hidden rounded-md border bg-background">
        {body}
        {code && <CopyButton text={code} label={`Copy the ${label}`} className="absolute top-1 right-1" />}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="flex items-center border-b px-1">
        <Tabs value={shown} onValueChange={(value) => onTab(value as T)}>
          <TabsList variant="line">
            {tabs.map((t) => {
              const trigger = (
                <TabsTrigger value={t} disabled={!sources[t].code}>
                  {sources[t].label}
                </TabsTrigger>
              );
              if (sources[t].code) return <Fragment key={t}>{trigger}</Fragment>;
              return (
                <Tooltip key={t}>
                  {/* A disabled tab swallows pointer events, so the span carries the tooltip. */}
                  <TooltipTrigger asChild>
                    <span className="inline-flex">{trigger}</span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">{sources[t].empty}</TooltipContent>
                </Tooltip>
              );
            })}
          </TabsList>
        </Tabs>
        {code && <CopyButton text={code} label={`Copy the ${label}`} className="ml-auto" />}
      </div>
      {body}
    </div>
  );
}

function Highlighted({ code, lang }: { code: string; lang: Lang | undefined }) {
  const tokens = useMemo(() => (lang ? tokenize(code, lang) : [{ text: code }]), [code, lang]);
  return tokens.map((token, i) =>
    token.kind ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: tokens are positional
      <span key={i} className={tokenColor[token.kind]}>
        {token.text}
      </span>
    ) : (
      token.text
    ),
  );
}
