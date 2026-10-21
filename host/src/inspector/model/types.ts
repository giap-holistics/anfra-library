// Types the model and the UI share: where a link in the panel goes, and what the host tells the
// inspector about the frame it mounted.
import type { DatasetDescriptor, LineageResult, LineageTarget, User } from '@holistics/anfra-sdk/common';

export type InspectorTab = 'overview' | 'data' | 'structure' | 'queries' | 'lineage' | 'wiring';

/** A structure node to select and reveal; a new nonce repeats a request for the same node. */
export interface NodeRequest {
  key: string;
  nonce: number;
  /** Go to the first query or control in the node, in the Queries tab, rather than to the node in Structure. */
  inData?: boolean;
}

/** What the Queries tab shows: a search over names, datasets and labels, and a filter. */
export interface QueriesFilter {
  search: string;
  filter: 'all' | 'errors' | 'dirty';
}

/**
 * Which Queries rows are open and which sections are closed. The panel keeps it, so it survives
 * switching tabs, which unmounts the Queries tab.
 */
export interface QueriesExpansion {
  open: Set<string>;
  closedSections: Set<string>;
}

/** Where a link in the panel goes. Every link resolves to one of these; see SPEC.md §4.8. */
export type RevealTarget =
  | {
      tab: InspectorTab /** Opens the Queries tab with its filter set, and its search cleared. */;
      filter?: QueriesFilter['filter'];
    }
  | { entity: 'query' | 'control'; app: number; name: string }
  | { check: number; app: number }
  /** Pins a query in the Lineage tab. */
  | { lineage: 'query'; app: number; name: string }
  | { node: string };

/** What the host knows about the frame it mounted, beyond what the frame posts. */
export interface InspectorEnv {
  /** Names the host in the report, e.g. "anfra demo". */
  hostName: string;
  /** The Data App's path, as the host addresses it. */
  path?: string;
  /** The SDK version the host mounts frames with. */
  sdkVersion?: string;
  /** Who reads the app; the frame is provisioned with it. */
  reader: User;
  /** The datasets the frame is provisioned with. */
  datasets: Record<string, DatasetDescriptor>;
  /** What each dataset says of its metrics and fields, for the Queries tab's metric tooltips. */
  metricDocs?: MetricDocs;
  /** The catalog's lineage, for the Lineage tab. Without it the tab draws what the page and `metricDocs` say. */
  lineage?: LineageSource;
}

/** How the host asks the catalog what a field is built from. */
export interface LineageSource {
  /** Each field's lineage, in the order asked: the `lineage` plugin's `lineage.trace`. */
  trace(targets: LineageTarget[], signal?: AbortSignal): Promise<LineageResult>;
  /** Every model's database table, by the model's fqn and name. */
  tables(signal?: AbortSignal): Promise<Record<string, ModelTable>>;
}

/** The table a model reads, as the catalog has it. */
export interface ModelTable {
  /** The model's own name and label, and what it says of itself. */
  model: { fqn: string; name: string; label?: string; description?: string };
  /** `schema.table`; absent for a query model. */
  table?: string;
  dataSource?: string;
}

/** What the catalog states of a metric: its label, description, AQL definition, type and display format. */
export interface MetricDoc {
  label?: string;
  description?: string;
  definition?: string;
  type?: string;
  /** How a value displays, as the AML declares it, e.g. `#,##0%`. */
  format?: string;
}

/** By dataset fqn, then by a metric's name or a model field's `model.field`. */
export type MetricDocs = Record<string, Record<string, MetricDoc>>;
