// The T-65 gate: every registered query (and, from step 1.10, command) run with
// other leagues' access against league B's records reaches nothing of B.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseRows } from './database-rows.test-helper.ts';
import './isolation-cases.test-helper.ts';
import {
  committedChanges,
  failureLines,
  findIsolationFailures,
  readDatabase,
} from './isolation-harness.test-helper.ts';
import {
  registeredIsolationCases,
  type IsolationCase,
  type Subject,
} from './isolation-registry.test-helper.ts';
import { openTwoLeagues, type TwoLeagues } from './two-leagues.test-helper.ts';

let leagues: TwoLeagues;
// The whole database before any case ran: every group is judged against it, and the
// last test checks that the database is the same again (every run rolled back).
let before: DatabaseRows;
beforeAll(async () => {
  leagues = await openTwoLeagues();
  before = await readDatabase(leagues);
});
afterAll(async () => {
  await leagues.close();
});

// One test per function, not one for every case at once: each step adds cases, and a
// single test doing all of them (85 seconds alone, 226 on a busy computer, step 2.149)
// would in time pass any one test's limit, however healthy the cases.
const bySubject = new Map<Subject, IsolationCase[]>();
for (const entry of registeredIsolationCases()) {
  bySubject.set(entry.subject, [...(bySubject.get(entry.subject) ?? []), entry]);
}
const groups = [...bySubject.values()].map((cases) => ({
  title: cases[0]?.subjectName ?? cases[0]?.subject.name ?? '(no cases)',
  cases,
}));

describe('two-league isolation (T-65)', () => {
  it('runs every registered case exactly once, each group named for its function', () => {
    const registered = registeredIsolationCases();
    expect(registered.length).toBeGreaterThan(0);
    const grouped = groups.flatMap((group) => group.cases);
    expect(grouped).toHaveLength(registered.length);
    for (const entry of registered) {
      expect(grouped.filter((other) => other === entry)).toHaveLength(1);
    }
    for (const { cases } of groups) {
      expect(cases.every((entry) => entry.subject === cases[0]?.subject)).toBe(true);
    }
    const titles = groups.map((group) => group.title);
    expect(titles.filter((title, i) => titles.indexOf(title) !== i)).toEqual([]);
  });

  it.each(groups)('no case of $title reaches another league', async ({ cases }) => {
    const failures = await findIsolationFailures(leagues, cases, { before });
    // Each failure on a line of its own, marked LEAK or UNCHECKED, for the fence-filter check.
    expect(failures, `${failures.length} failures:${failureLines(failures)}\n`).toEqual([]);
  });

  it('leaves the database as it was before the first case: every run rolled back', async () => {
    expect(committedChanges(leagues, before, await readDatabase(leagues))).toEqual([]);
  });
});
