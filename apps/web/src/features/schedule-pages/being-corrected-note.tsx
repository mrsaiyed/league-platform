// The one plain line beside a standings table or a team's record that leaves out a game
// being corrected (step 2.159, S-101, S-105). The standings count only games that are
// decided (S-11), so while a result is being corrected the game drops out of them, though
// its own page and the latest results still show the result as it stood (S-47): without
// this line two pages would disagree with no word of why. Nothing here reads anything.
import type { PublicSchedule } from '@srleagues/core';
import { t } from '../../server/messages.ts';
import type { LeagueClock } from '../../server/public-schedule.ts';
import { gameTruth } from './build-schedule.ts';

/** How many of the season's games (or of one team's, by its short name) are being corrected. */
export function countBeingCorrected(
  schedule: PublicSchedule | undefined,
  clock: LeagueClock,
  teamSlug?: string,
): number {
  if (schedule === undefined) return 0;
  return [...schedule.rounds.flatMap((round) => round.games), ...schedule.unplacedGames].filter(
    (game) =>
      (teamSlug === undefined ||
        game.homeTeam.slug === teamSlug ||
        game.awayTeam.slug === teamSlug) &&
      gameTruth(game, clock).state === 'being-corrected',
  ).length;
}

/** The line itself, for one game or many. */
export const beingCorrectedLine = (count: number): string =>
  t.plural('standings.beingCorrected', count);

/** The line as a page draws it; nothing while no game is being corrected. */
export function BeingCorrectedNote({ count }: { readonly count: number }) {
  return count === 0 ? null : (
    <p className="ui-notice" data-being-corrected-note={count}>
      {beingCorrectedLine(count)}
    </p>
  );
}
