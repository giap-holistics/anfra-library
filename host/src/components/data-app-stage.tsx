import { type ReactNode, type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  cursorMessage,
  type DataApp,
  type DatasetDescriptor,
  type InspectedApp,
  type InspectedStructure,
  type LocateTarget,
  type MountOptions,
  mount,
  type Rendering,
  type RenderRequest,
  trackMessage,
} from '@/data-app';

/** What the inspect panel and the toolbar do to the page in the stage. */
export interface StageHandle {
  highlight: (node: string | null) => void;
  locate: (target: LocateTarget) => void;
  render: (request: RenderRequest) => Promise<Rendering>;
  /** Have the frame report the last clicked marked element's rect as it moves, or stop. */
  track: (on: boolean) => void;
  /** Whether a message came from this stage's frame. */
  owns: (source: MessageEventSource | null) => boolean;
}

interface Props {
  path: string;
  datasets: Record<string, DatasetDescriptor>;
  inspecting: boolean;
  picking: boolean;
  /** The pointer to show over the frame: the comment cursor while picking a node to comment on. */
  cursor?: 'comment';
  onInspect: (apps: InspectedApp[], structure: InspectedStructure) => void;
  onPick: (node: string | null) => void;
  /** Read once per mount. */
  record?: MountOptions['record'];
  ref?: Ref<StageHandle>;
  /** Drawn over the frame, in its coordinates: the comment card's anchor. */
  children?: ReactNode;
}

/**
 * The stage: one Data App, mounted in its frame. It is mounted once per path and datasets; the
 * page remounts it (with a new key) to reload it.
 */
export function DataAppStage({
  path,
  datasets,
  inspecting,
  picking,
  cursor,
  onInspect,
  onPick,
  record,
  ref,
  children,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [app, setApp] = useState<DataApp>();
  const [error, setError] = useState<string>();

  // The latest callbacks, so a re-render doesn't remount the frame.
  const callbacks = useRef({ onInspect, onPick, record });
  callbacks.current = { onInspect, onPick, record };

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let mounted: DataApp | undefined;
    let cancelled = false;
    setError(undefined);
    mount({
      container: element,
      path,
      datasets,
      onInspect: (apps, structure) => callbacks.current.onInspect(apps, structure),
      onPick: (node) => callbacks.current.onPick(node),
      record: callbacks.current.record,
    }).then(
      (result) => {
        if (cancelled) return result.unmount();
        mounted = result;
        mounted.frame.className = 'size-full border-0 bg-white';
        setApp(mounted);
      },
      (err: Error) => !cancelled && setError(err.message),
    );
    return () => {
      cancelled = true;
      mounted?.unmount();
      setApp(undefined);
    };
  }, [path, datasets]);

  useEffect(() => app?.setInspecting(inspecting), [app, inspecting]);
  useEffect(() => app?.setPicking(picking), [app, picking]);
  useEffect(
    () => app?.frame.contentWindow?.postMessage({ type: cursorMessage, on: cursor === 'comment' }, '*'),
    [app, cursor],
  );

  useImperativeHandle(
    ref,
    () => ({
      highlight: (node) => app?.highlight(node),
      locate: (target) => app?.locate(target),
      render: (request) =>
        app ? app.render(request) : Promise.reject(new Error('The Data App has not loaded yet.')),
      track: (on) => app?.frame.contentWindow?.postMessage({ type: trackMessage, on }, '*'),
      owns: (source) => !!source && source === app?.frame.contentWindow,
    }),
    [app],
  );

  return (
    <div className="relative size-full">
      <div ref={container} className="size-full" />
      {children}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-background p-6 text-center text-sm text-muted-foreground">
          {error}
        </div>
      )}
    </div>
  );
}
