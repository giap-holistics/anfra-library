import {
  AppWindowMac,
  Download,
  History,
  MessageCircle,
  Moon,
  RotateCw,
  ScanSearch,
  ScrollText,
  Sun,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTheme } from '@/components/theme-toggle';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import type { RenderFormat } from '@/data-app';
import type { AppEntry, Entry } from '@/lib/host';
import { iconOf } from '@/lib/icons';
import { altKey, shiftKey } from '@/lib/shortcut';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: Entry[] | undefined;
  /** The open Data App, whose actions the palette offers. */
  app: AppEntry | undefined;
  onSelect: (path: string) => void;
  onReload: () => void;
  onDownload: (format: RenderFormat) => void;
  /** Whether the inspect and prompt panels are open, so their items say they close them. */
  inspecting: boolean;
  prompting: boolean;
  onInspect: () => void;
  onPrompt: () => void;
  /** Whether the versions panel is open, so its item says it closes it. */
  versioning: boolean;
  onVersions: () => void;
  /** Whether comment mode is on, so its item says it stops it. */
  commenting: boolean;
  onComment: () => void;
}

/** Cmd/Ctrl+K: jump to a Data App, or run an action on the open one. */
export function CommandPalette({
  open,
  onOpenChange,
  entries,
  app,
  onSelect,
  onReload,
  onDownload,
  inspecting,
  prompting,
  onInspect,
  onPrompt,
  versioning,
  onVersions,
  commenting,
  onComment,
}: Props) {
  const [theme, toggleTheme] = useTheme();
  const apps = useMemo(() => (entries ? appsOf(entries) : []), [entries]);
  // Close first, so an action that moves focus (a panel, a download) isn't undone by the dialog's.
  const run = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Find a Data App or run an action"
    >
      <CommandInput placeholder={app ? `Search apps, or act on ${app.label}…` : 'Search apps…'} />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        {app && (
          <CommandGroup heading={app.label}>
            <CommandItem value="Refresh reload" onSelect={run(onReload)}>
              <RotateCw />
              Refresh
            </CommandItem>
            <CommandItem value="Download PNG picture image" onSelect={run(() => onDownload('png'))}>
              <Download />
              Download PNG
            </CommandItem>
            <CommandItem value="Download PDF picture" onSelect={run(() => onDownload('pdf'))}>
              <Download />
              Download PDF
            </CommandItem>
            <CommandItem value={inspecting ? 'Close the inspect panel' : 'Inspect'} onSelect={run(onInspect)}>
              <ScanSearch />
              {inspecting ? 'Close the inspect panel' : 'Inspect'}
              <Shortcut letter="I" />
            </CommandItem>
            <CommandItem
              value={versioning ? 'Close the versions panel' : 'Version history'}
              onSelect={run(onVersions)}
            >
              <History />
              {versioning ? 'Close the versions panel' : 'Version history'}
              {!versioning && <span className="text-xs text-muted-foreground">Demo data · coming soon</span>}
              <Shortcut letter="V" />
            </CommandItem>
            <CommandItem
              value={commenting ? 'Stop commenting' : 'Comment on an element'}
              onSelect={run(onComment)}
            >
              <MessageCircle />
              {commenting ? 'Stop commenting' : 'Comment on an element'}
              <Shortcut letter="C" />
            </CommandItem>
            {app.prompt && (
              <CommandItem
                value={prompting ? 'Close the prompt panel' : 'Prompt that made this app'}
                onSelect={run(onPrompt)}
              >
                <ScrollText />
                {prompting ? 'Close the prompt panel' : 'Prompt'}
                <Shortcut letter="P" />
              </CommandItem>
            )}
          </CommandGroup>
        )}
        <CommandGroup heading="Appearance">
          <CommandItem
            value={theme === 'dark' ? 'Switch to light mode theme' : 'Switch to dark mode theme'}
            onSelect={run(toggleTheme)}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
            {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Apps">
          {apps.map((entry) => {
            const folder = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
            const Icon = iconOf(entry.icon, AppWindowMac);
            // Matched on the name first, then tags; the path keeps the value unique. Descriptions are
            // left out: a word in one outranks another app's name.
            return (
              <CommandItem
                key={entry.path}
                value={`${entry.label} ${entry.path}`}
                keywords={entry.tags}
                onSelect={run(() => onSelect(entry.path))}
              >
                <Icon />
                <span className="truncate">{entry.label}</span>
                {folder && <span className="ml-auto truncate text-xs text-muted-foreground">{folder}</span>}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function Shortcut({ letter }: { letter: string }) {
  return (
    <KbdGroup className="ml-auto">
      <Kbd>{altKey}</Kbd>
      <Kbd>{shiftKey}</Kbd>
      <Kbd>{letter}</Kbd>
    </KbdGroup>
  );
}

/** Every Data App in the tree, folders flattened away. */
function appsOf(entries: Entry[]): AppEntry[] {
  return entries.flatMap((entry) => (entry.kind === 'app' ? [entry] : appsOf(entry.children)));
}
