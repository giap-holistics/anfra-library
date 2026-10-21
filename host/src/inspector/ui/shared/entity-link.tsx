import type { RevealTarget } from '../../model/types';

/** A query's or control's name that opens its row in the Queries tab. */
export function EntityLink({
  entity,
  app,
  name,
  onReveal,
}: {
  entity: 'query' | 'control';
  app: number;
  name: string;
  onReveal: (target: RevealTarget) => void;
}) {
  return (
    <button type="button" className="hover:underline" onClick={() => onReveal({ entity, app, name })}>
      {name}
    </button>
  );
}
