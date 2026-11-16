// What "Yes" to "Show … to visitors?" or "Hide … from visitors?" does (step 2.182, A-18),
// apart from the page check and the redirect (actions.ts): the season is read fresh; when
// its state no longer fits the wish (someone showed or hid it since the question was
// drawn), nothing changes and the screen's own refusal says so; else the season command
// (update-season) runs with the version the person saw, so a save in between is refused
// (A-8). The context comes from the session, never from the form (T-23).
import {
  getSeason,
  updateSeason,
  type CommandContext,
  type CommandDeps,
  type LeaguesTx,
} from '@srleagues/core';
import { done, refusedBy, refusedHere, type Answer } from './answer.ts';
import { isVisibilityWish, statusFor } from './season-visibility.ts';

export type VisibilityChange = {
  readonly answer: Answer;
  /** The season's own short name, as read: never anything typed into the form. */
  readonly seasonSlug: string | undefined;
};

export async function runVisibilityChange(
  context: CommandContext,
  fields: Readonly<Record<string, string>>,
  deps: CommandDeps<LeaguesTx>,
): Promise<VisibilityChange> {
  const wish = fields['wish'];
  const seasonId = fields['seasonId'] ?? '';
  const version = Number(fields['version']);
  const read = await getSeason(context, { seasonId }, deps);
  if (!read.ok) {
    return { answer: refusedBy(updateSeason.commandName, read.error.code), seasonSlug: undefined };
  }
  const seasonSlug = read.value.slug;
  if (!isVisibilityWish(wish)) {
    return { answer: refusedBy(updateSeason.commandName, 'invalid-input'), seasonSlug };
  }
  const status = statusFor(read.value.status, wish);
  if (status === undefined) {
    return { answer: refusedHere(wish === 'show' ? 'not-hidden' : 'not-shown'), seasonSlug };
  }
  const result = await updateSeason(context, { seasonId, version, status }, deps);
  return {
    answer: result.ok
      ? done(wish === 'show' ? 'shown' : 'hidden')
      : refusedBy(updateSeason.commandName, result.error.code),
    seasonSlug,
  };
}
