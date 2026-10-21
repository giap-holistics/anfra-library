// The report "Copy report" puts on the clipboard: enough to debug the frame from, with no screen.
// It leaves out the full structure tree, to stay small, and rows, which may be sensitive.
import type { InspectedApp } from '@holistics/anfra-sdk/common';
import type { InspectorSnapshot } from '../source';
import { type Check, wiringChecks } from './checks';
import { handleFor } from './format';
import { problemNodes } from './issues';
import type { RequestEntry } from './requests';
import { appTrust, type Trust } from './trust';
import type { InspectorEnv } from './types';

export const INSPECTOR_VERSION = '0.2.0';

export interface InspectorReport {
  inspector: string;
  capturedAt: string;
  host: { name: string; sdkVersion?: string; path?: string };
  reader: InspectorEnv['reader'];
  datasets: string[];
  apps: Array<InspectedApp & { trust: Trust; checks: Check[] }>;
  structure: { problems: Array<{ node: string; handle: string; problems: string[] }> };
  /** The request log, without the rows. */
  requests: Omit<RequestEntry, 'preview'>[];
}

export function buildReport(
  snapshot: InspectorSnapshot | undefined,
  env: InspectorEnv,
  requests: readonly RequestEntry[] = [],
): InspectorReport {
  return {
    inspector: INSPECTOR_VERSION,
    capturedAt: new Date().toISOString(),
    host: { name: env.hostName, sdkVersion: env.sdkVersion, path: env.path },
    reader: env.reader,
    datasets: Object.keys(env.datasets),
    apps: (snapshot?.apps ?? []).map((app) => ({ ...app, trust: appTrust(app), checks: wiringChecks(app) })),
    structure: {
      problems: problemNodes(snapshot?.structure.nodes ?? []).map((node) => ({
        node: node.key,
        handle: handleFor(node),
        problems: node.problems,
      })),
    },
    requests: requests.map(({ preview: _, ...entry }) => entry),
  };
}
