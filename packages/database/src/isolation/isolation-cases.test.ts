// The T-65 gate: every registered query (and, from step 1.10, command) run with
// other leagues' access against league B's records reaches nothing of B.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import './isolation-cases.test-helper.ts';
import { findIsolationFailures } from './isolation-harness.test-helper.ts';
import { registeredIsolationCases } from './isolation-registry.test-helper.ts';
import { openTwoLeagues, type TwoLeagues } from './two-leagues.test-helper.ts';

let leagues: TwoLeagues;
beforeAll(async () => {
  leagues = await openTwoLeagues();
});
afterAll(async () => {
  await leagues.close();
});

describe('two-league isolation (T-65)', () => {
  it('no registered case reaches another league', async () => {
    const cases = registeredIsolationCases();
    expect(cases.length).toBeGreaterThan(0);
    expect(await findIsolationFailures(leagues, cases)).toEqual([]);
  });
});
