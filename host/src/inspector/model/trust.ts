// Trust level 1 to 3: how far an app's numbers trace back to the semantic layer. Each query gets a
// level and the app's is its lowest query's. A query that declares a dataset goes through the
// semantic layer. The fourth level, "Endorsed", is defined but not reached until the SDK reports endorsement.
import type { InspectedApp, InspectedQuery, QueryDeclaration } from '@holistics/anfra-sdk/common';
import { plural } from './format';

export type TrustLevel = 1 | 2 | 3 | 4;
export type Tone = 'error' | 'warn' | 'ok';

export interface Trust {
  level: TrustLevel;
  tone: Tone;
  /** Why, in a sentence. */
  text: string;
}

/** Name, tone and explanation of each level, for the meter's tooltip. */
export const TRUST_LEVELS: Record<TrustLevel, { tone: Tone; name: string; hint: string }> = {
  // Level 4 shows in the meter and its tooltip now, though nothing reaches it yet: see isEndorsed.
  1: {
    tone: 'error',
    name: 'Unverified',
    hint: "Some queries declare no dataset, so they bypass the semantic layer, or the app has no queries. Results can't be traced back to governed definitions.",
  },
  2: {
    tone: 'warn',
    name: 'Verified, incomplete',
    hint: "Every query goes through the semantic layer, but some failed or haven't returned yet, so what the app shows may be incomplete.",
  },
  3: {
    tone: 'ok',
    name: 'Semantic layer verified',
    hint: 'Every query goes through the semantic layer and none failed. Some fields may still be ad hoc expressions.',
  },
  4: {
    tone: 'ok',
    name: 'Endorsed',
    hint: 'Semantic layer verified, and every field is a governed definition with no ad hoc expressions.',
  },
};

/** The levels, lowest first. */
export const LEVELS = Object.keys(TRUST_LEVELS).map(Number) as TrustLevel[];

const at = (level: TrustLevel, text: string): Trust => ({ level, tone: TRUST_LEVELS[level].tone, text });

const adhocCount = (query: InspectedQuery) => query.columns.filter((column) => column.adhoc).length;

/**
 * Placeholder: the SDK doesn't report endorsement yet, so nothing is endorsed and level 3 is the
 * highest reached. Wiring it up is this function alone; the level-4 branches below wait on it.
 */
const isEndorsed = (_query: InspectedQuery) => false;

/** One query's level, with why. */
export function queryTrust(declaration: QueryDeclaration | undefined, query: InspectedQuery): Trust {
  if (!declaration?.dataset) return at(1, 'Not on the semantic layer: declares no dataset');
  if (query.state === 'error') return at(2, 'On the semantic layer, but failed');
  // Verified means it came back: a query that hasn't yet can't be counted as verified.
  if (query.state !== 'success') return at(2, "On the semantic layer, but hasn't returned yet");
  if (isEndorsed(query)) return at(4, 'Endorsed');
  return at(3, `Semantic layer verified · ${plural(adhocCount(query), 'ad hoc field')}`);
}

/** The app's level: its lowest query's, or 1 with no queries. */
export function appTrust(app: InspectedApp): Trust {
  const queries = Object.entries(app.queries);
  if (queries.length === 0) return at(1, 'No queries found');
  const levels = queries.map(([name, query]) => queryTrust(app.declaration.queries[name], query).level);
  const level = Math.min(...levels) as TrustLevel;
  const n = levels.filter((l) => l === level).length;
  const total = queries.length;
  if (level === 1) return at(1, `${n} of ${total} queries aren't on the semantic layer`);
  if (level === 2) {
    const failed = queries.filter(([, query]) => query.state === 'error').length;
    const waiting = n - failed;
    const parts = [
      failed && `${failed} of ${total} queries failed`,
      waiting && `${waiting} of ${total} haven't returned yet`,
    ];
    return at(2, parts.filter(Boolean).join(' · '));
  }
  if (level === 4) return at(4, 'All queries are endorsed');
  const adhoc = queries.filter(([, query]) => adhocCount(query) > 0).length;
  return at(3, `All queries are semantic layer verified · ${adhoc} with ad hoc fields`);
}
