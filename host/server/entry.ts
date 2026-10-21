// Shared with the page (src/lib/host.ts), so the tree the server sends and the one the page reads are one type.
// No imports: the page's build reads this file too.

/** One node of the Data App tree: a definition, or a folder holding some. Paths are relative to the apps folder, a definition's with its `.html`. */
export type Entry =
  | {
      kind: 'app';
      path: string;
      label: string;
      /** The definition's `<meta name="description">`. */
      description?: string;
      /** The definition's `og:image`, as a URL on this host, when it names a file under the apps folder. */
      image?: string;
      icon?: string;
      tags: string[];
      endorsed: boolean;
      prompt?: AppPrompt;
    }
  | {
      kind: 'folder';
      path: string;
      name: string;
      /** A line on what the folder holds, from the manifest. */
      description?: string;
      icon?: string;
      tags: string[];
      collapsed: boolean;
      children: Entry[];
    };

/**
 * What `/host/apps` sends: the Data App tree, and where old paths go (the manifest's `redirects`, see
 * server/redirect.ts), so the page can follow an old link it meets without the server.
 */
export interface Catalog {
  entries: Entry[];
  redirects: Record<string, string>;
}

/** The prompt that made a Data App, from its `<script type="application/json" id="data-app-metadata">`. */
export interface AppPrompt {
  prompt: string;
  model?: string;
  effort?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** The icons a repo's `apps/_meta.yaml` can name: lucide's, in kebab-case. The page maps each to its component (src/lib/icons.ts). */
export const iconNames = [
  'activity',
  'app-window',
  'chart-bar',
  'chart-line',
  'chart-pie',
  'credit-card',
  'database',
  'folder',
  'gauge',
  'globe',
  'layout-dashboard',
  'megaphone',
  'package',
  'rocket',
  'shopping-cart',
  'star',
  'table',
  'truck',
  'users',
  'wallet',
] as const;

export type IconName = (typeof iconNames)[number];
