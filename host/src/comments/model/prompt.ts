import type { StructureNode } from '@holistics/anfra-sdk/common';
import { handleFor } from '@/inspector';

/** A node and the nodes it sits in, outermost first; undefined if the key isn't in the structure. */
export function findNode(
  nodes: StructureNode[],
  key: string,
  ancestors: StructureNode[] = [],
): { node: StructureNode; ancestors: StructureNode[] } | undefined {
  for (const node of nodes) {
    if (node.key === key) return { node, ancestors };
    const found = findNode(node.children, key, [...ancestors, node]);
    if (found) return found;
  }
  return undefined;
}

/** What a reader calls a node: its label, else the id or name the markup gives it. */
export function nameOf(node: StructureNode): string {
  if (node.label) return node.label;
  if (node.kind === 'container' || node.kind === 'block') return node.id ?? node.kind;
  return node.app ? `${node.app}/${node.name ?? ''}` : (node.name ?? node.kind);
}

export interface CommentPromptInput {
  /** The app's label and its definition's file, as anfra serves it: `apps/sales/overview.html`. */
  app: { label: string; file: string };
  node: StructureNode;
  ancestors: StructureNode[];
  comment: string;
}

/** The comment as a prompt an agent can act on: the app, the node, where it sits, and the comment (SPEC §4.4). */
export function buildCommentPrompt({ app, node, ancestors, comment }: CommentPromptInput): string {
  const lines = [`Comment on the Data App "${app.label}" (${app.file}).`, ''];
  lines.push(`Element: ${node.kind} ${handleFor(node)}`);
  if (ancestors.length) {
    lines.push(`Inside: ${ancestors.map((a) => `${a.kind} ${handleFor(a)}`).join(' › ')}`);
  }
  if (node.problems.length) {
    lines.push('', 'Markup problems:', ...node.problems.map((p) => `- ${p}`));
  }
  lines.push('', 'Comment:', comment.trim());
  return lines.join('\n');
}
