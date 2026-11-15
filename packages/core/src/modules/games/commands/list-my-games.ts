// The signed-in person's games to score, today and the week ahead (P4 §4: "a
// scorekeeper who opens the admin sees a list of their games"), and every game under way
// whenever it started, so one begun before the league's midnight is still there after it
// (step 2.156). The list follows the same rule as scoring itself (my-games-of.ts). Each
// game says whether the person is assigned to it. "Today" is the league's today, in its
// time zone, by the database's clock. It changes nothing, but runs in the same shape as a
// command (record 014).
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { myGamesDays } from '../game-fields.ts';
import { myGamesOf, type MyGame } from '../my-games-of.ts';
import { mayReadGames } from '../policy.ts';
import type { GamesTx } from '../ports.ts';

export type { MyGame } from '../my-games-of.ts';

export type MyGames = {
  /** Today in the league's time zone (YYYY-MM-DD). */
  readonly today: string;
  /** Soonest first. */
  readonly games: readonly MyGame[];
};

export const listMyGames = defineCommand({
  name: 'games.list_my_games',
  permission: 'games.score',
  input: z.object({}),
  // Anyone who scores somewhere in the league; which games is decided game by game below.
  allowed: (context, _input, tx: GamesTx) => mayReadGames(context, tx, 'games.score'),
  run: async ({ context, tx }): Promise<Result<MyGames, never>> => {
    const accountId = context.accountId;
    if (accountId === null) return ok({ today: '', games: [] });
    const window = await tx.games.listWindow(accountId, myGamesDays);
    const games = await myGamesOf(tx, accountId, window.games, window.today);
    return ok(games === undefined ? { today: '', games: [] } : { today: window.today, games });
  },
});
