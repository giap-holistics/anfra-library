import type { ModelTable } from '../../model/types';

export type Tables = Record<string, ModelTable>;

/** The models' tables: the prior answer if there is one, else asked for. A failure is reported, not remembered. */
export async function tablesFor(
  prior: Tables | undefined,
  fetch: () => Promise<Tables>,
): Promise<{ tables?: Tables; error?: string }> {
  if (prior) return { tables: prior };
  try {
    return { tables: await fetch() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
