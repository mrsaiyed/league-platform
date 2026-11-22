// What the Publish button does (step 2.240, U-9), apart from the form and the address, so
// it is tested on the stand-in as it runs. The command decides who may (the owner or an
// admin, U-14) and refuses while a "Must fix" item is not met (P3 §3), each with its own
// sentence. A league that is already published answers as published, so pressing the
// button twice, or posting the form again, changes nothing and says it is done.
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
  const result = await setLeagueStatus(context, { status: 'live', version }, deps);
  return result.ok ? done('published') : refused(setLeagueStatus.commandName, result.error.code);
}
