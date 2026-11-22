// One release's database part (step 2.95, record 101, T-48, T-49), in this order:
//
// 1. the commit to deploy: this checkout's own commit, with nothing changed or added in
//    supabase/migrations, so the changes applied are exactly that commit's;
// 2. the target opened, through the league-making tool's own checks (openMigrationTarget);
// 3. where it will act shown from what was really connected to; the games live now are
//    counted, and above the limit it stops unless told to go ahead (T-158); on a hosted
//    database the person then types that database's name to go ahead;
// 4. the changes applied by the one runner (applyMigrations), each file in its own
//    transaction;
// 5. only when every file applied (or had been): the commit to deploy is named. A failed
//    file names nothing, so the new version is never started on a database it does not fit.
//
// The new version itself is started by hand on the host from that commit (2.110, M20):
// nothing here holds a host's key. Whatever goes wrong it says what was and was not
// applied, never an error's message (it can repeat an address with its password), and
// returns a non-zero exit code.
import { applyMigrations, countLiveGames, openMigrationTarget } from '@srleagues/database';
import * as words from './release.messages.mjs';

/**
 * T-158: the most games that may be live, in all leagues together, for a release to go on
 * without `--go-ahead`. 0 until a tracker that is open is proved to keep working across a
 * release (T-127): until then any live game stops it (T-300).
 */
export const mostLiveGames = 0;

/** A short error code only (SQLSTATE such as 23505, or ECONNRESET), never a message. */
export function codeOf(error) {
  const code = typeof error === 'object' && error !== null ? error.code : undefined;
  return typeof code === 'string' && /^[A-Z0-9_]{2,24}$/.test(code) ? code : undefined;
}

/**
 * Runs the release's database part; resolves to the exit code.
 *
 * - `source`: from releaseSourceFor (a folder, an open PGlite in tests, or the migration login).
 * - `commit()`: `{ ok: true, id }` or `{ ok: false, problem: 'not-a-checkout' | 'migrations-changed' }`.
 * - `ask(question)`: the person's answer at a terminal; only asked on a hosted database.
 * - `folder`: the migrations folder (default supabase/migrations); tests give their own.
 * - `goAhead`: true when the person gave --go-ahead: live games above the limit do not
 *   stop it (an emergency fix, T-158). Exit code 3 when they do.
 * - `say`, `warn`: where lines go (console.log and console.error).
 */
export async function runRelease({
  source,
  commit,
  ask,
  folder,
  goAhead = false,
  say = console.log,
  warn = console.error,
}) {
  const named = commit();
  if (!named.ok) {
    warn(words.commitProblems[named.problem]);
    return 2;
  }

  const opened = await openMigrationTarget(source);
  if (!opened.ok) {
    for (const line of words.targetProblemLines(opened.problem)) warn(line);
    return 1;
  }
  const { target } = opened;
  try {
    for (const line of words.whereLines(target.place, named.id)) say(line);
    const live = await countLiveGames(target.login);
    if (live > mostLiveGames && !goAhead) {
      for (const line of words.liveGamesRefused(live, mostLiveGames)) warn(line);
      return 3;
    }
    if (live > 0) say(words.liveGamesGoingAhead(live));
    if (source.kind === 'migration-login') {
      for (const line of words.checkBeforeAnswering(target.place)) say(line);
      const answer = await ask(words.confirmHosted);
      if (target.place.kind !== 'postgres' || answer.trim() !== target.place.database) {
        say(words.notApplied);
        return 1;
      }
    }

    const run = await applyMigrations(target.login, folder);
    if (!run.ok) {
      for (const line of words.failedLines(run.error, run.applied)) warn(line);
      return 1;
    }
    for (const line of words.appliedLines(run.value, named.id)) say(line);
    return 0;
  } finally {
    try {
      await target.close();
    } catch {
      // Closing cannot change what was applied, and its error may name the address.
    }
  }
}
