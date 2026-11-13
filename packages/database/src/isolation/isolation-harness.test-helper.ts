// The two-league harness (T-65). Every case is run in these ways, each in its own
// transaction that is always rolled back, so no run changes what the next one sees:
//
//   control       league B's own scope, aimed at B. It must reach B (return or
//                 change something of B); a case that cannot reach its target
//                 proves nothing.
//   app           league A's scope as the app opens it (withTransaction: both fences).
//   code-only     league A's scope with row-level security out of the way: only the
//                 query's own league filter (T-28) keeps B out. A query that forgot
//                 its `where league_id` is caught here, though the database would
//                 have hidden it in the app run.
//   both-leagues  the database set to league A and to an account with roles in
//                 both leagues, while the scope names B: only row-level security
//                 keeps B out, so a policy that lets an account's other leagues
//                 through is caught.
//   no-league     a scope naming B while the database has no league set: only
//                 row-level security (T-61) keeps B, and A, out.
//
// In every run but the control, the forbidden leagues (B; A and B with no league
// set) must not show:
//   - in what comes back, a result or an error: any id found only in that
//     league's rows, or its marker word (database-rows.test-helper.ts);
//   - in any change: none of their rows, and no row outside a league, may change;
//   - in the answer at all: the run is repeated with the forbidden leagues' rows
//     deleted (inside that same rolled-back transaction) and must come out the
//     same, so a count or a total over B is caught though it names nothing of B.
// A refusal (an error) is not a leak unless it names something of B. Afterwards
// the whole database must be as it was before, or a case committed something.
import { inspect, isDeepStrictEqual } from 'node:util';
import { sql, type Transaction } from 'kysely';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withFenceSetTo, withUnfencedScope } from '../db/db.test-helper.ts';
import type { Database } from '../db/schema-types.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  changedTables,
  footprints,
  outside,
  readRows,
  removeRows,
  type DatabaseRows,
} from './database-rows.test-helper.ts';
import type { IsolationCase } from './isolation-registry.test-helper.ts';
import type { LeagueRecords, TwoLeagues } from './two-leagues.test-helper.ts';

export type IsolationRun = 'control' | 'app' | 'code-only' | 'both-leagues' | 'no-league';

export type IsolationFailure = {
  subject: string;
  name: string;
  run: IsolationRun | 'afterwards';
  problem: string;
};

type Open = (work: (scope: LeagueScope) => Promise<never>) => Promise<never>;
type Outcome = { returned: unknown } | { refused: unknown };
type Seen = { outcome: Outcome; after: DatabaseRows | null };
type Prepare = (trx: Transaction<Database>) => Promise<void>;

class RolledBack {
  constructor(readonly seen: Seen) {}
}

/** Every string, number and key anywhere in a value, and every error's message. */
function* textsIn(value: unknown, seen = new Set<object>()): Generator<string> {
  if (value === null || value === undefined || typeof value === 'function') return;
  if (typeof value !== 'object') {
    yield String(value);
    return;
  }
  if (seen.has(value)) return;
  seen.add(value);
  if (value instanceof Date) {
    yield String(value.getTime());
    return;
  }
  if (value instanceof Error) {
    // What a caller is shown: the message (and its cause's), not the driver's
    // extra fields, which repeat the query's own parameters back.
    yield* textsIn([value.message, value.cause], seen);
    return;
  }
  const entries =
    value instanceof Map || value instanceof Set ? [...value.entries()] : Object.entries(value);
  for (const [key, child] of entries) {
    yield* textsIn(key, seen);
    yield* textsIn(child, seen);
  }
}

/** Runs one case in one transaction, and rolls it back whatever happens. */
async function attempt(
  open: Open,
  entry: IsolationCase,
  target: LeagueRecords,
  { prepare, read }: { prepare?: Prepare; read: boolean },
): Promise<Seen> {
  try {
    return await open(async (scope) => {
      if (prepare !== undefined) await prepare(transactionOf(scope));
      let outcome: Outcome;
      try {
        outcome = { returned: await entry.run(scope, target) };
      } catch (error) {
        throw new RolledBack({ outcome: { refused: error }, after: null });
      }
      const trx = transactionOf(scope);
      if (read) await sql`reset role`.execute(trx);
      throw new RolledBack({ outcome, after: read ? await readRows(trx) : null });
    });
  } catch (thrown) {
    if (thrown instanceof RolledBack) return thrown.seen;
    throw thrown;
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const show = (outcome: Outcome) =>
  'returned' in outcome
    ? inspect(outcome.returned, { depth: 4, breakLength: Infinity }).slice(0, 160)
    : `refused: ${message(outcome.refused)}`;
const same = (x: Outcome, y: Outcome) =>
  'returned' in x && 'returned' in y
    ? isDeepStrictEqual(x.returned, y.returned)
    : 'refused' in x && 'refused' in y && message(x.refused) === message(y.refused);

/**
 * Runs every case against leagues A and B and returns what went wrong; an empty
 * list means no case reached another league. It throws only if the harness itself
 * cannot run.
 */
export async function findIsolationFailures(
  { db, a, b, sharedAccountId }: TwoLeagues,
  cases: readonly IsolationCase[],
): Promise<IsolationFailure[]> {
  const read = () => withUnfencedScope(db, a.leagueId, async (s) => readRows(transactionOf(s)));
  const before = await read();
  const markers = new Map([a, b].map((league) => [league.leagueId, league.marker]));
  const prints = footprints(before, markers);
  const footprint = (league: LeagueRecords) => {
    const found = prints.get(league.leagueId);
    if (found === undefined) throw new Error(`no footprint for league ${league.marker}`);
    return found;
  };
  const asB = { leagueId: b.leagueId, accountId: b.ownerId };
  const asA = { leagueId: a.leagueId, accountId: a.ownerId };
  const shared = { leagueId: a.leagueId, accountId: sharedAccountId };
  const runs: { run: IsolationRun; open: Open; forbidden: LeagueRecords[] }[] = [
    { run: 'control', open: (work) => withTransaction(db, asB, work), forbidden: [b] },
    { run: 'app', open: (work) => withTransaction(db, asA, work), forbidden: [b] },
    { run: 'code-only', open: (work) => withUnfencedScope(db, a.leagueId, work), forbidden: [b] },
    {
      run: 'both-leagues',
      open: (work) => withFenceSetTo(db, shared, b.leagueId, work),
      forbidden: [b],
    },
    {
      run: 'no-league',
      open: (work) => withFenceSetTo(db, {}, b.leagueId, work),
      forbidden: [a, b],
    },
  ];

  const failures: IsolationFailure[] = [];
  for (const entry of cases) {
    for (const { run, open, forbidden } of runs) {
      const fail = (problem: string) =>
        failures.push({ subject: entry.subject.name, name: entry.name, run, problem });
      let seen: Seen;
      try {
        seen = await attempt(open, entry, b, { read: true });
      } catch (error) {
        // The case left its transaction unusable (it swallowed an error, say).
        fail(`could not be checked: ${message(error)}`);
        continue;
      }
      const texts = [...textsIn(Object.values(seen.outcome))].map((t) => t.toLowerCase());
      const reached: string[] = [];
      for (const league of forbidden) {
        const { traces } = footprint(league);
        const leaked = texts.find((text) => traces.some((trace) => text.includes(trace)));
        const how = 'returned' in seen.outcome ? 'returned' : 'refused naming';
        if (leaked !== undefined) reached.push(`${how} "${leaked}" of league ${league.marker}`);
        if (seen.after === null) continue;
        for (const table of changedTables(before, seen.after, league.leagueId)) {
          reached.push(`changed league ${league.marker}'s ${table}`);
        }
      }
      // The same run again with the forbidden leagues' rows gone: the answer it
      // gives then, or why it could not be had.
      const differs = async (): Promise<string | null> => {
        const gone = new Map<string, string[]>();
        for (const league of forbidden) {
          for (const [table, ids] of footprint(league).rows) {
            gone.set(table, [...(gone.get(table) ?? []), ...ids]);
          }
        }
        try {
          const prepare = (trx: Transaction<Database>) => removeRows(trx, gone);
          const without = await attempt(open, entry, b, { prepare, read: false });
          if (same(seen.outcome, without.outcome)) return null;
          const names = forbidden.map((league) => league.marker).join(' and ');
          return (
            `answers differently once league ${names}'s rows are gone: ` +
            `${show(seen.outcome)} | without: ${show(without.outcome)}`
          );
        } catch (error) {
          return `could not be compared: ${message(error)}`;
        }
      };
      if (run === 'control') {
        // Changing the target's people (rows outside a league) reaches it too, and
        // so does an answer that depends on the target's rows (a count, say).
        if (seen.after !== null) reached.push(...changedTables(before, seen.after, outside));
        if ('refused' in seen.outcome) {
          fail(`refused in the target's own league: ${message(seen.outcome.refused)}`);
        } else if (reached.length === 0 && !(await differs())?.startsWith('answers differently')) {
          fail("reaches nothing of the target in the target's own league, so it proves nothing");
        }
        continue;
      }
      for (const problem of reached) fail(problem);
      for (const table of seen.after === null ? [] : changedTables(before, seen.after, outside)) {
        fail(`changed ${table}, outside any league`);
      }
      const difference = await differs();
      if (difference !== null) fail(difference);
    }
  }
  const after = await read();
  for (const group of new Set([...before.keys(), ...after.keys()])) {
    for (const table of changedTables(before, after, group)) {
      const whose =
        group === outside ? 'outside any league' : `league ${markers.get(group) ?? group}`;
      failures.push({
        subject: '(harness)',
        name: 'every run rolled back',
        run: 'afterwards',
        problem: `${table} (${whose}) changed for good: a case committed`,
      });
    }
  }
  return failures;
}
