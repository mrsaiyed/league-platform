// The games list's "Later games" (step 2.56, the 2.180/2.158 reviews): every scheduled game
// after this week, soonest first, so a game further ahead can be forfeited, postponed or
// cancelled from the list like one of this week's (a team that has left, S-87). Read
// through the same window as the week's games, a year from the league's today (T-313), and
// by the same rule of who sees which game (my-games-of.ts). A team may be asked for: only
// its games are then listed. The teams offered are those of the games found. It changes
// nothing, but runs in the same shape as a command (record 014).
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { myGamesDays } from '../game-fields.ts';
import { myGamesOf, type MyGame } from '../my-games-of.ts';
import { mayReadGames } from '../policy.ts';
import type { GamesTx } from '../ports.ts';

/** How far ahead the list looks, in days from the league's today. */
export const laterGamesDays = 366;
/** The most games shown at once. */
export const laterGamesLimit = 100;

export type LaterGames = {
  /** Today in the league's time zone (YYYY-MM-DD). */
  readonly today: string;
  /** The teams of every later game the person sees, by id, in no set order. */
  readonly teamIds: readonly string[];
  /** Soonest first, of the team asked for when one was; at most `laterGamesLimit`. */
  readonly games: readonly MyGame[];
  /** More games than these: the soonest are shown. */
  readonly more: boolean;
};

const none: LaterGames = { today: '', teamIds: [], games: [], more: false };

/** The day `days` after a YYYY-MM-DD day, in the same calendar. */
export function dayAfter(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const listLaterGames = defineCommand({
  name: 'games.list_later_games',
  permission: 'games.score',
  input: z.object({ teamId: z.uuid().optional() }),
  // Anyone who scores somewhere in the league; which games is decided game by game below.
  allowed: (context, _input, tx: GamesTx) => mayReadGames(context, tx, 'games.score'),
  run: async ({ context, input, tx }): Promise<Result<LaterGames, never>> => {
    const accountId = context.accountId;
    if (accountId === null) return ok(none);
    const window = await tx.games.listWindow(accountId, laterGamesDays);
    const mine = await myGamesOf(tx, accountId, window.games, window.today);
    if (mine === undefined) return ok(none);
    // After the week the list already shows by day (myGamesDays from today).
    const from = dayAfter(window.today, myGamesDays);
    const later = mine.filter((g) => g.status === 'scheduled' && g.day >= from);
    const teamIds = [...new Set(later.flatMap((g) => [g.homeTeamId, g.awayTeamId]))];
    const asked = input.teamId;
    const games =
      asked === undefined
        ? later
        : later.filter((g) => g.homeTeamId === asked || g.awayTeamId === asked);
    return ok({
      today: window.today,
      teamIds,
      games: games.slice(0, laterGamesLimit),
      more: games.length > laterGamesLimit,
    });
  },
});
