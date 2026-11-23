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
  /**
   * What the tests call the subject, when its own name does not say which function it
   * is (every event handler's function is called `handle`). The function's name if not.
   */
  subjectName?: string;
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
  /**
   * Puts the target in the state the subject looks for (its season open to the public,
   * a game postponed, a venue in the bin, no draft), inside the TARGET'S OWN fence (the
   * database set to the target's league and its owner), before every run (step 2.224,
   * D-M1). A write made in `run` goes through the run's own fence, so in another
   * league's runs it finds nothing of the target, and a query with its league filter
   * taken out would then still find nothing to reach: the case could not fail. What is
   * arranged here is there in every run, so only the subject's own filter keeps the
   * target out of the code-only run. Write only fixed values (no clock, no new rows
   * with new ids): every run is judged against the database as arranged, read once.
   */
  arrange?: (inTarget: LeagueScope, target: LeagueRecords) => Promise<unknown>;
  /**
   * Also compare what the run wrote in its own league with what it writes once the
   * other league's rows are gone (an event handler's work is its writes). Off by
   * default: it reads the whole database once more per run.
   */
  compareWrites?: true;
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
