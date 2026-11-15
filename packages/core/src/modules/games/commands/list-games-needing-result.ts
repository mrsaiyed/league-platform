// The games that still need a result, however old (step 2.156, the using-it audit's H8;
// P4 line 22): every game under way, and every scheduled game whose start has passed,
// oldest first, that the person may score (my-games-of.ts): a scorekeeper in a league
// that scores assigned games only sees only theirs. The top of the games list, and where
// the admin's "games past their start with no result" goes. It changes nothing, but runs
// in the same shape as a command (record 014).
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { accessOfAccount } from '../../access/index.ts';
import { myGamesOf, type MyGame } from '../my-games-of.ts';
import { mayReadGames } from '../policy.ts';
import type { GamesTx } from '../ports.ts';
import { scoringReachOf, scoringRuleOf } from '../scoring-access.ts';

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
    const holder = await accessOfAccount(tx, accountId);
    if (holder === undefined) return ok(none);
    // The store keeps only the games this person may score, then cuts: one more than is
    // shown, to know whether there are more. So no game of theirs is pushed out by games
    // they do not score, and "more" speaks only of theirs.
    const reach = scoringReachOf(holder, await scoringRuleOf(tx));
    const found = await tx.games.listNeedingResult(accountId, reach, needsResultLimit + 1);
    const games = await myGamesOf(
      tx,
      accountId,
      found.games.slice(0, needsResultLimit),
      found.today,
    );
    if (games === undefined) return ok(none);
    return ok({ today: found.today, games, more: found.games.length > needsResultLimit });
  },
});
