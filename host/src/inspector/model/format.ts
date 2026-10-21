// Formatting for the inspector. What it shows is what the frame posts while it is inspected:
// every app's state and the page's structure, as the SDK types them. Rows are never part of it.
import type {
  Condition,
  EntityUsage,
  InspectedStructure,
  LocateKind,
  StructureNode,
} from '@holistics/anfra-sdk/common';

export function formatCondition(condition: Condition | undefined): string {
  if (!condition) return 'not applied yet';
  const parts = [condition.operator, condition.modifier, ...(condition.values ?? []).map(String)];
  return parts.filter((part) => part !== undefined && part !== '').join(' ');
}

export function formatTime(value: Date | string | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString();
}

/** A moment in short natural terms: `< 1m ago`, `3m ago`, `2h ago`, `4d ago`. */
export function formatAgo(value: Date | string | undefined, now: number = Date.now()): string {
  if (!value) return '';
  const time = (value instanceof Date ? value : new Date(value)).getTime();
  if (Number.isNaN(time)) return String(value);
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < 60) return '< 1m ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** A count and its noun: `1 row`, `2 rows`. */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** JSON indented for reading; anything else as it is. */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** An entity's key, as the structure's usage names it: `query:<app>/<name>`. */
export const entityKey = (kind: LocateKind, app: number, name: string) => `${kind}:${app}/${name}`;

/** The attribute a marked element carries for an entity, as the definition writes it. */
export function entityAttribute(kind: LocateKind, app: number, name: string): string {
  return `data-anfra-${kind}="${app === 0 ? '' : `${app}/`}${name}"`;
}

/**
 * A node's identity, to hand to an agent: a Markdown-style link whose text is the label and whose
 * target is the attribute as written, `[River](data-anfra-block="river")`; with no label, the
 * attribute alone. Either is one search away in the definition.
 */
export function handleFor(node: StructureNode): string {
  const attribute = attributeFor(node);
  return node.label ? `[${node.label}](${attribute})` : attribute;
}

/** The attribute that marks a node, as the definition writes it: `data-anfra-block="river"`. */
export function attributeFor(node: StructureNode): string {
  return node.kind === 'container' || node.kind === 'block'
    ? `data-anfra-${node.kind}="${node.id ?? ''}"`
    : entityAttribute(node.kind, node.app ?? 0, node.name ?? '');
}

/** Where an entity is drawn, from the structure: how many marked elements, in which blocks. */
export function usageOf(
  structure: InspectedStructure | undefined,
  kind: LocateKind,
  app: number,
  name: string,
): EntityUsage | undefined {
  return structure?.usage[entityKey(kind, app, name)];
}

/**
 * The structure node of a block by its id. Where an id repeats, the one that holds the entity
 * wins, since that is the block the entity is drawn in.
 */
export function blockNodeKey(
  structure: InspectedStructure | undefined,
  id: string,
  kind: LocateKind,
  app: number,
  name: string,
): string | undefined {
  const blocks: StructureNode[] = [];
  const holds = (node: StructureNode): boolean =>
    node.children.some(
      (child) => (child.kind === kind && (child.app ?? 0) === app && child.name === name) || holds(child),
    );
  const walk = (nodes: StructureNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'block' && node.id === id) blocks.push(node);
      walk(node.children);
    }
  };
  walk(structure?.nodes ?? []);
  return (blocks.find(holds) ?? blocks[0])?.key;
}

export function countProblems(nodes: StructureNode[]): number {
  return nodes.reduce((n, node) => n + node.problems.length + countProblems(node.children), 0);
}

/**
 * The first query or control at or below the node with `key`, in document order: what a pick of a
 * container or block leads to in Queries. Undefined when the node isn't there or holds none.
 */
export function firstEntityUnder(
  nodes: StructureNode[],
  key: string,
): { entity: LocateKind; app: number; name: string } | undefined {
  const find = (list: StructureNode[]): StructureNode | undefined => {
    for (const node of list) {
      if (node.key === key) return node;
      const found = find(node.children);
      if (found) return found;
    }
  };
  const first = (node: StructureNode): StructureNode | undefined =>
    node.kind === 'query' || node.kind === 'control'
      ? node
      : node.children.map(first).find((entity) => entity !== undefined);
  const root = find(nodes);
  const entity = root && first(root);
  return entity && (entity.kind === 'query' || entity.kind === 'control')
    ? { entity: entity.kind, app: entity.app ?? 0, name: entity.name ?? '' }
    : undefined;
}

/** The keys of a node and everything under it, the node first: where a pick can land in Lineage. */
export function keysUnder(nodes: StructureNode[], key: string): string[] {
  const collect = (node: StructureNode): string[] => [node.key, ...node.children.flatMap(collect)];
  const find = (list: StructureNode[]): StructureNode | undefined => {
    for (const node of list) {
      if (node.key === key) return node;
      const found = find(node.children);
      if (found) return found;
    }
  };
  const root = find(nodes);
  return root ? collect(root) : [];
}
