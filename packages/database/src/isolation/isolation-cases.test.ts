// The T-65 gate: every registered query (and, from step 1.10, command) run with
// other leagues' access against league B's records reaches nothing of B.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import './isolation-cases.test-helper.ts';
import { findIsolationFailures } from './isolation-harness.test-helper.ts';
import {
  registeredIsolationCases,
  type IsolationCase,
  type Subject,
} from './isolation-registry.test-helper.ts';
import { openTwoLeagues, type TwoLeagues } from './two-leagues.test-helper.ts';

let leagues: TwoLeagues;
beforeAll(async () => {
  leagues = await openTwoLeagues();
});
afterAll(async () => {
  await leagues.close();
});

const cases = registeredIsolationCases();

// One test per function, not one for every case at once: each step adds cases, and a
// single test doing all of them (85 seconds alone, 226 on a busy computer, step 2.149)
// would in time pass any one test's limit, however healthy the cases.
const bySubject = new Map<Subject, IsolationCase[]>();
for (const entry of cases)
  bySubject.set(entry.subject, [...(bySubject.get(entry.subject) ?? []), entry]);
const groups = [...bySubject.values()].map((group) => ({
  name: group[0]?.subject.name ?? '(unnamed)',
  cases: group,
}));

describe('two-league isolation (T-65)', () => {
  it('has cases registered', () => {
    expect(cases.length).toBeGreaterThan(0);
    expect(groups.flatMap((group) => group.cases)).toHaveLength(cases.length);
  });

  it.each(groups)('no case of $name reaches another league', async ({ cases: group }) => {
    expect(await findIsolationFailures(leagues, group)).toEqual([]);
  });
});
