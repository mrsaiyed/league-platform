// Where `node scripts/read-kept-emails.mjs` reads (step 2.204, record 098): the same
// source, guards and "at a terminal only" rule as `npm run league:make --hosted`
// (make-league-source.mjs, reused): --hosted needs a terminal, both logins given for this
// command only and never in .env, each passing the tracker's database guard (record 055),
// the certificate checked for a database elsewhere. With no --hosted, a PGlite folder on
// this computer (--db, or .local/seed-db), as league:make does. The address asked about
// must be made up (record 075), or nothing is opened.
//
// It opens the target through openLeagueMakingTarget, which refuses a database that holds
// the tracker's data, and reads as the migration login (the tables' owner): the app's
// login cannot read kept_emails at all.
import { newestKeptEmail, openLeagueMakingTarget } from '@srleagues/database';
import { isMadeUpAddress, keptAddressOf, keptEmailAnswer } from '@srleagues/providers';
import { sourceFor } from './make-league-source.mjs';
import * as words from './read-kept-emails.messages.mjs';

/**
 * `{ source, to, note? }`, or `{ problems }` (lines to print, exit 2) when nothing may be
 * opened. `options` are sourceFor's, with `to` the address given.
 */
export function keptEmailsSourceFor({ to, ...options }) {
  const address = typeof to === 'string' ? to.trim() : '';
  if (address === '') return { problems: [words.toMissing] };
  if (!isMadeUpAddress(address)) return { problems: [words.toNotMadeUp] };
  const chosen = sourceFor(options);
  if ('problems' in chosen) return chosen;
  return { ...chosen, to: keptAddressOf(address) };
}

/**
 * Opens the source, reads the newest email kept for `to`, closes it: `{ answer }` (the code
 * or link, the one thing printed), `{ problem: 'none-kept' | 'nothing-to-read' |
 * 'not-migrated' }`, or `{ targetProblem }` (openLeagueMakingTarget's refusal).
 */
export async function readNewestKept(source, to) {
  const opened = await openLeagueMakingTarget(source);
  if (!opened.ok) return { targetProblem: opened.problem };
  const { target } = opened;
  try {
    let kept;
    try {
      kept = await newestKeptEmail(target.login, to);
    } catch (error) {
      // 42P01: no such table, a database before migration 0023.
      if (error?.code === '42P01' || error?.code === '3F000') return { problem: 'not-migrated' };
      throw error;
    }
    if (kept === null) return { problem: 'none-kept' };
    const answer = keptEmailAnswer(kept.text);
    return answer === null ? { problem: 'nothing-to-read' } : { answer: answer.value };
  } finally {
    await target.close().catch(() => {});
  }
}
