// The games that still need a result, however old (step 2.156, the using-it audit's H8;
// P4 line 22): every game under way, and every scheduled game whose start has passed,
// oldest first, that the person may score (my-games-of.ts): a scorekeeper in a league
// that scores assigned games only sees only theirs. The top of the games list, and where
// the admin's "games past their start with no result" goes. It changes nothing, but runs
// in the same shape as a command (record 014).
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { myGamesOf, type MyGame } from '../my-games-of.ts';
import { mayReadGames } from '../policy.ts';
import type { GamesTx } from '../ports.ts';

/** The most games the list holds at once: a league that never enters scores still opens quickly. */
export const needsResultLimit = 100;

export type GamesNeedingResult = {
  /** Today in the league's time zone (YYYY-MM-DD). */
  readonly today: string;
  /** Oldest first, at most `needsResultLimit`. */
  readonly games: readonly MyGame[];
  /** More games than these need a result: the oldest are shown first. */
  readonly more: boolean;
};

export const listGamesNeedingResult = defineCommand({
  name: 'games.list_games_needing_result',
  permission: 'games.score',
  input: z.object({}),
  // Anyone who scores somewhere in the league; which games is decided game by game below.
  allowed: (context, _input, tx: GamesTx) => mayReadGames(context, tx, 'games.score'),
  run: async ({ context, tx }): Promise<Result<GamesNeedingResult, never>> => {
    const none = { today: '', games: [], more: false };
    const accountId = context.accountId;
    if (accountId === null) return ok(none);
    // One more than is shown, to know whether there are more. The cut is made before the
    // person's own filter, so "more" is said only to someone who sees every game read: it
    // never speaks of games a scorekeeper does not score.
    const found = await tx.games.listNeedingResult(accountId, needsResultLimit + 1);
    const shown = found.games.slice(0, needsResultLimit);
    const games = await myGamesOf(tx, accountId, shown, found.today);
    if (games === undefined) return ok(none);
    const more = found.games.length > needsResultLimit && games.length === shown.length;
    return ok({ today: found.today, games, more });
  },
});
