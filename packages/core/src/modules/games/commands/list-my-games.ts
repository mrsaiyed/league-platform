// The signed-in person's games to score, today and the week ahead (P4 §4: "a
// scorekeeper who opens the admin sees a list of their games"). The list follows
// the same rule as scoring itself: in a league where any scorekeeper may score, it
// is every game in the scorekeeper's reach; where only assigned ones may, it is the
// games they are assigned to. The owner, admins and schedulers see every game they
// may score. Each game says whether the person is assigned to it. "Today" is the
// league's today, in its time zone, by the database's clock. It changes nothing,
// but runs in the same shape as a command (record 014).
import { z } from 'zod';
import { accessOfAccount, type Scope } from '../../access/index.ts';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { myGamesDays, recordingOf } from '../game-fields.ts';
import { mayReadGames } from '../policy.ts';
import type { GameInWindow, GamesTx } from '../ports.ts';
import { mayScoreUnder, scoringRuleOf } from '../scoring-access.ts';

/** A game on the list. */
export type MyGame = {
  readonly id: string;
  readonly seasonId: string;
  readonly divisionId: string | null;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly startsAt: string | null;
  /** The day it is played in the league's time zone (YYYY-MM-DD), and whether that is today. */
  readonly day: string;
  readonly isToday: boolean;
  readonly status: string;
  readonly recording: ReturnType<typeof recordingOf>;
  /** Whether the person is assigned to score it. */
  readonly assignedToMe: boolean;
  readonly version: number;
};

export type MyGames = {
  /** Today in the league's time zone (YYYY-MM-DD). */
  readonly today: string;
  /** Soonest first. */
  readonly games: readonly MyGame[];
};

const view = ({ game, day, assigned }: GameInWindow, today: string): MyGame => ({
  id: game.id,
  seasonId: game.seasonId,
  divisionId: game.divisionId,
  homeTeamId: game.homeTeamId,
  awayTeamId: game.awayTeamId,
  startsAt: game.startsAt,
  day,
  isToday: day === today,
  status: game.status,
  recording: recordingOf(game.captureMode),
  assignedToMe: assigned,
  version: game.version,
});

export const listMyGames = defineCommand({
  name: 'games.list_my_games',
  permission: 'games.score',
  input: z.object({}),
  // Anyone who scores somewhere in the league; which games is decided game by game below.
  allowed: (context, _input, tx: GamesTx) => mayReadGames(context, tx, 'games.score'),
  run: async ({ context, tx }): Promise<Result<MyGames, never>> => {
    const accountId = context.accountId;
    const holder = accountId === null ? undefined : await accessOfAccount(tx, accountId);
    if (accountId === null || holder === undefined) return ok({ today: '', games: [] });
    const window = await tx.games.listWindow(accountId, myGamesDays);
    const rule = await scoringRuleOf(tx);
    const games = window.games.filter((entry) => {
      const scope: Scope = { type: 'program', id: entry.programId };
      return mayScoreUnder(holder, scope, rule, entry.assigned);
    });
    return ok({ today: window.today, games: games.map((entry) => view(entry, window.today)) });
  },
});
