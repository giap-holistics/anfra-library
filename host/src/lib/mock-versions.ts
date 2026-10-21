// MOCK DATA. Apps have no version history yet; this stands in for it so the Versions panel can show
// how it will look. Replace `mockVersionsFor` with the real history when it exists.

export type MockChangeKind = 'added' | 'changed' | 'removed';

export interface MockChange {
  kind: MockChangeKind;
  text: string;
}

export interface MockVersion {
  /** Stable within the list, e.g. `v7`. */
  id: string;
  author: string;
  createdAt: Date;
  summary: string;
  changes: MockChange[];
  /** The version the app is running now. */
  current?: boolean;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** [age before `now`, author, summary, changes], newest first. */
const SAMPLES: [number, string, string, MockChange[]][] = [
  [
    3 * HOUR,
    'Emily Carter',
    'Add a region filter to the revenue chart',
    [
      { kind: 'added', text: 'Region control' },
      { kind: 'changed', text: 'Revenue by month query' },
    ],
  ],
  [
    2 * DAY,
    'Jake Morrison',
    'Tidy the orders table',
    [
      { kind: 'changed', text: 'Column order and labels' },
      { kind: 'removed', text: 'Internal id column' },
    ],
  ],
  [
    6 * DAY,
    'Emily Carter',
    'Switch top customers to a ranked bar chart',
    [
      { kind: 'added', text: 'Top customers query' },
      { kind: 'removed', text: 'Customers pie chart' },
    ],
  ],
  [
    13 * DAY,
    'Sarah Bennett',
    'Fix the date drill on the overview',
    [{ kind: 'changed', text: 'Date drill mapping' }],
  ],
  [
    27 * DAY,
    'Jake Morrison',
    'Add the orders table',
    [
      { kind: 'added', text: 'Orders query' },
      { kind: 'added', text: 'Orders table block' },
    ],
  ],
  [41 * DAY, 'Emily Carter', 'First version', [{ kind: 'added', text: 'Revenue by month chart' }]],
];

/**
 * Sample versions, newest first, ages measured back from `now`. The newest is the current one.
 * Every call gives the same list for the same `now`.
 */
export function mockVersionsFor(now: number = Date.now()): MockVersion[] {
  return SAMPLES.map(([age, author, summary, changes], i) => ({
    id: `v${SAMPLES.length - i}`,
    author,
    createdAt: new Date(now - age),
    summary,
    changes,
    ...(i === 0 && { current: true }),
  }));
}
