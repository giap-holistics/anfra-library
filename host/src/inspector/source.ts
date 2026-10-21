// What the inspector needs from a host, and a small store a host can use to provide it.
import type {
  InspectedApp,
  InspectedStructure,
  LocateTarget,
  RenderFormat,
  StructureNode,
} from '@holistics/anfra-sdk/common';
import type { RequestLog } from './model/requests';
import type { InspectorEnv } from './model/types';

/** One inspection snapshot the frame posted: its apps, and the structure its markup declares. */
export interface InspectorSnapshot {
  apps: InspectedApp[];
  structure: InspectedStructure;
}

/** Everything the inspector needs from a host, for one mounted frame. See SPEC.md §5.2. */
export interface InspectorSource {
  /** What the host knows about the frame: who reads it, its datasets, the SDK version. */
  env: InspectorEnv;
  /** The frame's requests to the backend, recorded by `createRequestLog`. */
  requests: RequestLog;
  /** The latest snapshot, or undefined until the frame reports. The same object until it changes. */
  getSnapshot(): InspectorSnapshot | undefined;
  /** Called whenever the snapshot changes; returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Outline a structure node in the frame, or clear the outline. */
  highlight(node: string | null): void;
  /** Scroll a node, or an entity wherever it is drawn, into view in the frame. */
  locate(target: LocateTarget): void;
  /** Save a picture of a container or block. Optional: without it the inspector offers no download. */
  download?(node: StructureNode, format: RenderFormat): void;
}

/** A source plus the hook that feeds it: pass `publish` as the frame's `onInspect`. */
export interface InspectorStore {
  source: InspectorSource;
  publish(apps: InspectedApp[], structure: InspectedStructure): void;
}

/**
 * A store for one mounted frame. Make a new one per mount, so a remounted frame starts with nothing
 * inspected. `highlight` and `locate` go to the frame, which the host owns.
 */
export function createInspectorStore(
  frame: Pick<InspectorSource, 'env' | 'requests' | 'highlight' | 'locate' | 'download'>,
): InspectorStore {
  let snapshot: InspectorSnapshot | undefined;
  const listeners = new Set<() => void>();
  return {
    source: {
      env: frame.env,
      requests: frame.requests,
      getSnapshot: () => snapshot,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      highlight: (node) => frame.highlight(node),
      locate: (target) => frame.locate(target),
      download: frame.download,
    },
    publish(apps, structure) {
      snapshot = { apps, structure };
      for (const listener of listeners) listener();
    },
  };
}
