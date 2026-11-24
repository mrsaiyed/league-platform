// What "Yes" to "Make … the current season?" or "Archive …?" does (step 2.130), apart from
// the page check and the redirect (actions.ts): the season is read fresh; an archived
// season is not archived again, and the screen's own refusal says so; else the season
// command runs with the version the person saw, so a save in between is refused (A-8).
// The context comes from the session, never from the form (T-23).
import {
  archiveSeason,
  archivedSeasonStatus,
  getSeason,
  setCurrentSeason,
  type CommandContext,
  type CommandDeps,
  type LeaguesTx,
} from '@srleagues/core';
import { done, refusedBy, refusedHere, type Answer } from './answer.ts';

export const seasonChangeWishes = ['current', 'archive'] as const;
export type SeasonChangeWish = (typeof seasonChangeWishes)[number];

export const isSeasonChangeWish = (wish: unknown): wish is SeasonChangeWish =>
  seasonChangeWishes.some((w) => w === wish);

export type SeasonChange = {
  readonly answer: Answer;
  /** The season's own short name, as read: never anything typed into the form. */
  readonly seasonSlug: string | undefined;
};

export async function runSeasonChange(
  context: CommandContext,
  fields: Readonly<Record<string, string>>,
  deps: CommandDeps<LeaguesTx>,
): Promise<SeasonChange> {
  const wish = fields['wish'];
  const seasonId = fields['seasonId'] ?? '';
  const version = Number(fields['version']);
  const command = wish === 'archive' ? archiveSeason : setCurrentSeason;
  const read = await getSeason(context, { seasonId }, deps);
  if (!read.ok) {
    return { answer: refusedBy(command.commandName, read.error.code), seasonSlug: undefined };
  }
  const seasonSlug = read.value.slug;
  if (!isSeasonChangeWish(wish)) {
    return { answer: refusedBy(command.commandName, 'invalid-input'), seasonSlug };
  }
  if (wish === 'archive' && read.value.status === archivedSeasonStatus) {
    return { answer: refusedHere('not-archivable'), seasonSlug };
  }
  const result = await command(context, { seasonId, version }, deps);
  return {
    answer: result.ok
      ? done(wish === 'archive' ? 'archived' : 'current')
      : refusedBy(command.commandName, result.error.code),
    seasonSlug,
  };
}
