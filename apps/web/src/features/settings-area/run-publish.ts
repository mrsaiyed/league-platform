// What the Publish button does (step 2.240, U-9), apart from the form and the address, so
// it is tested on the stand-in as it runs. The command decides who may (the owner or an
// admin, U-14) and refuses while a "Must fix" item is not met (P3 §3), each with its own
// sentence. A league that is already published answers as published, so pressing the
// button twice, or posting the form again, changes nothing and says it is done. Only a
// draft is published here: the same form posted for an archived (or suspended) league is
// refused, as bringing an archived league back is not this button's work.
import {
  setLeagueStatus,
  type CommandContext,
  type CommandDeps,
  type LeaguesTx,
} from '@srleagues/core';
import { done, refused, type Answer } from './answer.ts';

export async function runPublish(
  context: CommandContext,
  deps: CommandDeps<LeaguesTx>,
  /** The version of the league the person was looking at (A-8); NaN when garbled. */
  version: number,
): Promise<Answer> {
  const league = await deps.transaction(context, (tx) => tx.leagues.currentLeague());
  if (league?.status === 'live') return done('published');
  if (league !== undefined && league.status !== 'draft') {
    return refused(setLeagueStatus.commandName, 'illegal-transition');
  }
  const result = await setLeagueStatus(context, { status: 'live', version }, deps);
  return result.ok ? done('published') : refused(setLeagueStatus.commandName, result.error.code);
}

/**
 * Archive and Un-archive (step 2.125 part 2, U-9): a published league is archived and an
 * archived one brought back to published, by the owner or an admin (U-14). Posting the
 * same form again answers as done and changes nothing; anything else is refused by the
 * command's own table of changes (a draft is published, never archived).
 */
export async function runArchive(
  context: CommandContext,
  deps: CommandDeps<LeaguesTx>,
  to: 'archived' | 'live',
  version: number,
): Promise<Answer> {
  const answer = to === 'archived' ? 'archived' : 'unarchived';
  const league = await deps.transaction(context, (tx) => tx.leagues.currentLeague());
  if (league?.status === to) return done(answer);
  if (to === 'live' && league?.status !== 'archived') {
    return refused(setLeagueStatus.commandName, 'illegal-transition');
  }
  const result = await setLeagueStatus(context, { status: to, version }, deps);
  return result.ok ? done(answer) : refused(setLeagueStatus.commandName, result.error.code);
}
