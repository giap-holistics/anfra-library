import type { InspectedStructure, RenderFormat, StructureNode } from '@holistics/anfra-sdk/common';
import { ChevronRight, Database, Download, GitFork, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, toggleIn } from '@/lib/utils';
import { handleFor } from '../../model/format';
import type { NodeRequest } from '../../model/types';
import { CopyButton } from '../shared/copy-button';
import { kindIcons, kindPills } from '../shared/kind';

interface Props {
  structure: InspectedStructure;
  /** A node to select and reveal: picked on the page, or asked for from elsewhere in the panel. */
  picked: NodeRequest | undefined;
  /** The pick is revealed: it isn't to be replayed when the tree mounts again. */
  onPicked: () => void;
  onHighlight: (node: string | null) => void;
  onLocate: (node: string) => void;
  /** Open a query's or control's row in the Queries tab. */
  onShowInData: (node: StructureNode) => void;
  /** Open a node in the Lineage tab. */
  onShowInLineage: (node: StructureNode) => void;
  /** Save a picture of a container or block. The download menu shows only when the host provides it. */
  onDownload?: (node: StructureNode, format: RenderFormat) => void;
}

/** What the markup names a node by: its id (a container or block) or name (a query or control). */
function idOf(node: StructureNode): string {
  if (node.kind === 'container' || node.kind === 'block') return node.id ?? '';
  return node.app ? `${node.app}/${node.name ?? ''}` : (node.name ?? '');
}

/** The keys of the nodes on the way to `key`, so a picked node can be revealed. */
function ancestorsOf(nodes: StructureNode[], key: string, trail: string[] = []): string[] | undefined {
  for (const node of nodes) {
    if (node.key === key) return trail;
    const found = ancestorsOf(node.children, key, [...trail, node.key]);
    if (found) return found;
  }
  return undefined;
}

/**
 * The page's structure as a tree: hover a node to highlight it on the page, click it to scroll it
 * into view, and copy its handle (the attribute that marks it) to point an agent at it.
 */
export function StructureTree({
  structure,
  picked,
  onPicked,
  onHighlight,
  onLocate,
  onShowInData,
  onShowInLineage,
  onDownload,
}: Props) {
  const [selected, setSelected] = useState<string>();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // A pick can arrive before the snapshot that has its node: it waits for one, then is done with.
  // biome-ignore lint/correctness/useExhaustiveDependencies: onPicked is the parent's, fresh each render
  useEffect(() => {
    if (!picked) return;
    const ancestors = ancestorsOf(structure.nodes, picked.key);
    if (!ancestors) return;
    setSelected(picked.key);
    setCollapsed((prev) => new Set([...prev].filter((key) => !ancestors.includes(key))));
    requestAnimationFrame(() =>
      document.querySelector(`[data-node="${CSS.escape(picked.key)}"]`)?.scrollIntoView({ block: 'nearest' }),
    );
    onPicked();
  }, [picked, structure]);

  // Leaving the tree clears the highlight; so must unmounting it under the pointer, as a tab switch does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on unmount only
  useEffect(() => () => onHighlight(null), []);

  const toggle = (key: string) => setCollapsed((prev) => toggleIn(prev, key));

  const renderNode = (node: StructureNode) => {
    const open = !collapsed.has(node.key);
    const id = idOf(node);
    const Icon = kindIcons[node.kind];
    const select = () => {
      setSelected(node.key);
      onLocate(node.key);
    };
    return (
      <li key={node.key}>
        <div
          data-node={node.key}
          className={cn(
            'group flex h-8 cursor-pointer items-center gap-1.5 rounded-md pr-1 text-sm hover:bg-accent',
            node.key === selected && 'bg-accent',
          )}
          onMouseEnter={() => onHighlight(node.key)}
          onClick={select}
          onKeyDown={(event) => event.key === 'Enter' && select()}
          role="treeitem"
          aria-expanded={node.children.length > 0 ? open : undefined}
          aria-selected={node.key === selected}
          tabIndex={0}
        >
          {node.children.length > 0 ? (
            <button
              type="button"
              className="grid size-4 shrink-0 place-items-center text-muted-foreground/60 hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                toggle(node.key);
              }}
              aria-label={open ? 'Collapse' : 'Expand'}
            >
              <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
            </button>
          ) : (
            <span className="size-4 shrink-0" />
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn('grid size-5 shrink-0 place-items-center rounded', kindPills[node.kind])}
                role="img"
                aria-label={node.kind}
              >
                <Icon className="size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="capitalize">
              {node.kind}
            </TooltipContent>
          </Tooltip>
          {id && <span className="shrink truncate font-semibold">{id}</span>}
          {node.label && node.label !== id && (
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{node.label}</span>
          )}
          {node.problems.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0">
                  <TriangleAlert className="size-3.5 text-amber-500" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-72 whitespace-pre-line">
                {node.problems.join('\n')}
              </TooltipContent>
            </Tooltip>
          )}
          <span className="ml-auto" />
          {(node.kind === 'query' || node.kind === 'control') && node.problems.length === 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                  aria-label="Show in Queries"
                  onClick={(event) => {
                    event.stopPropagation();
                    onShowInData(node);
                  }}
                >
                  <Database className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Show in Queries</TooltipContent>
            </Tooltip>
          )}
          {(node.kind === 'query' || node.kind === 'control') && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                  aria-label="Show in Lineage"
                  onClick={(event) => {
                    event.stopPropagation();
                    onShowInLineage(node);
                  }}
                >
                  <GitFork className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Show in Lineage</TooltipContent>
            </Tooltip>
          )}
          {onDownload && (node.kind === 'container' || node.kind === 'block') && node.id && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                      aria-label="Download a picture"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Download className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">Download a picture</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                <DropdownMenuItem onSelect={() => onDownload(node, 'png')}>PNG</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onDownload(node, 'pdf')}>PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <CopyButton
            text={handleFor(node)}
            label="Copy the handle"
            className="shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
          />
        </div>
        {open && node.children.length > 0 && (
          // The guide runs down from under the parent's chevron, one per level.
          <ul className="ml-2 space-y-0.5 border-l pl-5">{node.children.map(renderNode)}</ul>
        )}
      </li>
    );
  };

  return (
    <div role="tree" onMouseLeave={() => onHighlight(null)}>
      <ul className="space-y-0.5">{structure.nodes.map(renderNode)}</ul>
    </div>
  );
}
