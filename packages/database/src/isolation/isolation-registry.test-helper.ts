// The list of everything the two-league harness tries (T-65). Each query, and from
// step 1.10 each command, registers at least one case; isolation-coverage.test.ts
// fails when an exported function it scans has none.
import type { LeagueScope } from '../db/transaction-scope.ts';
import type { LeagueRecords } from './two-leagues.test-helper.ts';

/** Any function: a case names the very function it runs, not a copy of its name. */
export type Subject = (...args: never[]) => unknown;

/** One attempt to reach another league's records. */
export type IsolationCase = {
  /** The exported function this case runs. Coverage is checked against it. */
  subject: Subject;
  /** What the case tries, for the failure message. */
  name: string;
  /**
   * Runs the subject in `scope`, aimed at `target`'s records: its ids, short
   * names, accounts. The harness calls it with other leagues' access and league B
   * as the target, and checks that nothing of B comes back (in a result or an
   * error) and nothing of B changes. It also calls it in B's own scope, where it
   * must reach B: a case that never reaches its target proves nothing. Return what
   * the subject returned.
   */
  run: (scope: LeagueScope, target: LeagueRecords) => Promise<unknown>;
};

const registered: IsolationCase[] = [];

/** Adds a case to the harness. A subject may have several; each name once. */
export function registerIsolationCase(entry: IsolationCase): void {
  if (registered.some((c) => c.subject === entry.subject && c.name === entry.name)) {
    throw new Error(`Isolation case registered twice: ${entry.subject.name}: ${entry.name}`);
  }
  registered.push(Object.freeze({ ...entry }));
}

/** Every case registered so far, in the order registered. */
export function registeredIsolationCases(): readonly IsolationCase[] {
  return [...registered];
}
