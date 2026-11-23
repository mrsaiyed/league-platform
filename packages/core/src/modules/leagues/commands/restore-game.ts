// Brings a game back from the bin (A-5): one a publish removed (step 2.21) that was
// never played. A game that was played is never in the bin; if one is, it is corrected
// or reopened, not restored (S-7). The game number and outside reference do not hold
// their place in the bin, so another game may have taken one; a game whose team,
// division, venue or court is still in the bin stays there until that is back.
// Whoever may remove a game may restore it (A-5): only publishing removes one, so
// `schedule.publish` at its season's program, as `scheduling.publish_schedule` needs.
//
// Only a publish puts a game in the bin, so every game here was on the published schedule,
// and bringing it back is a schedule change like any other (A-19), done the way a publish
// does one (scheduling.publish_schedule):
// - the clash check: the games now at its time with a team or its court in common are
//   named in the answer, as the publish preview lists a clash and never refuses for it
//   (put_game_back says them the same way); its teams in the bin keep it there (above);
// - a numbered schedule revision is written, one game back on the schedule, so a draft
//   made on the older schedule is not published unseen (A-8);
// - the A-7 notice: the teams and people it reaches are counted, kept in the activity
//   entry and given in the answer for the screen to say (telling them comes with stage 4,
//   as for a publish).
import { z } from 'zod';
import { leagueScope, recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { binSeasonScope, mayRestore } from '../bin-policy.ts';
import type { RestoreGameTx } from '../bin.ts';

export type RestoreGameError = {
  readonly code:
    | 'game-not-found'
    | 'game-not-restorable'
    | 'game-part-in-bin'
    | 'game-number-taken'
    | 'game-reference-taken'
    /** Someone published the season's schedule at the same moment: try again. */
    | 'revision-out-of-date';
};

export type RestoredGame = {
  readonly gameId: string;
  /** Its season: where the screen reads the games now at its time to name them. */
  readonly seasonId: string;
  /** The schedule revision that brought it back; null when it was not in the bin. */
  readonly revision: number | null;
  readonly teamCount: number;
  readonly peopleCount: number;
  /** The games that hold its place at its time now (A-19: said, not refused). */
  readonly clashes: readonly { readonly id: string }[];
};

const neverPlayed = ['scheduled', 'postponed', 'cancelled'];

export const restoreGame = defineCommand({
  name: 'leagues.restore_game',
  permission: 'schedule.publish',
  input: z.object({ gameId: z.uuid() }),
  allowed: async (context, input, tx: RestoreGameTx) => {
    const game = await tx.bin.findGame(input.gameId);
    return mayRestore(
      context,
      tx,
      'schedule.publish',
      game === undefined ? leagueScope : await binSeasonScope(tx, game.seasonId),
    );
  },
  run: async ({ context, input, tx }): Promise<Result<RestoredGame, RestoreGameError>> => {
    const game = await tx.bin.findGame(input.gameId);
    if (game === undefined) return fail({ code: 'game-not-found' });
    if (!game.binned) {
      return ok({
        gameId: input.gameId,
        seasonId: game.seasonId,
        revision: null,
        teamCount: 0,
        peopleCount: 0,
        clashes: [],
      });
    }
    if (!neverPlayed.includes(game.status)) return fail({ code: 'game-not-restorable' });
    if (game.partInBin) return fail({ code: 'game-part-in-bin' });
    const restored = await tx.bin.restoreGame(input.gameId);
    if (restored === 'game-number-taken') return fail({ code: 'game-number-taken' });
    if (restored === 'external-ref-taken') return fail({ code: 'game-reference-taken' });
    if (restored === false) return fail({ code: 'game-not-restorable' });

    const record = await tx.games.find(input.gameId);
    const teams = record === undefined ? [] : [...new Set([record.homeTeamId, record.awayTeamId])];
    const peopleCount = await tx.scheduling.countPeopleOnTeams(game.seasonId, teams);
    const latest = await tx.scheduling.latestRevision(game.seasonId);
    const revision = (latest ?? 0) + 1;
    // The same summary document a publish writes (T-220): the game counts as added back.
    const written = await tx.scheduling.insertRevision(game.seasonId, {
      number: revision,
      publishedByAccountId: context.accountId,
      summary: {
        version: 1,
        basedOnRevision: latest,
        gamesAdded: 1,
        gamesRemoved: 0,
        gamesMoved: 0,
        gamesRecordingChanged: 0,
        roundsRenamed: 0,
        roundsDateChanged: 0,
        roundsAdded: 0,
        roundsRemoved: 0,
        teamsAffected: teams.length,
        peopleAffected: peopleCount,
        gameIds: { added: [input.gameId], removed: [], moved: [] },
        restoredFromBin: [input.gameId],
      },
    });
    if (!written) return fail({ code: 'revision-out-of-date' });
    const clashes = game.status === 'scheduled' ? await tx.games.clashesOf(input.gameId) : [];
    await recordActivity(tx, context, {
      action: 'leagues.restore_game',
      target: { type: 'game', id: input.gameId },
      details: {
        revision,
        teamsAffected: teams.length,
        peopleAffected: peopleCount,
        clashes: clashes.length,
      },
    });
    return ok({
      gameId: input.gameId,
      seasonId: game.seasonId,
      revision,
      teamCount: teams.length,
      peopleCount,
      clashes: clashes.map((c) => ({ id: c.id })),
    });
  },
});
