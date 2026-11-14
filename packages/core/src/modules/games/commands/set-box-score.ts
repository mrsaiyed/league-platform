// Records a game from a paper sheet afterwards (P7 §5.2, T6 §9): the third way of
// recording, `set-box-score`. A grid of players and stats becomes the game's box score
// lines, and the game is decided through the same step as a final score (decideGame),
// so standings and season totals follow (games.finalized, T-24) and a game recorded
// this way looks the same to them, with fewer stats filled in. A stat left out of a
// line was not recorded, so averages are worked over the games that recorded it (T6
// §9); a 0 was recorded. The game is marked as recorded by box score.
//
// The scores are the sheet's own two numbers, not worked out from the players' points:
// a sheet may not record points for everyone. Each line is for a player on one of the
// game's two teams' rosters (one who has left since counts: R-17). A player who did not
// play has no stats and no minutes (P7 §5.6). A game the tracker has recorded plays
// for is corrected in the tracker's own grid (T-122, step 2.65), never here, so its
// event log always explains its numbers. A decided game is corrected by reopening it
// with a reason first (S-7), then entering the sheet again.
import { z } from 'zod';
import { defineCommand, fail, type Result } from '../../../command/index.ts';
import { decideGame, openGame, type DecideGameError } from '../decide-game.ts';
import { gameScore, gameVersion } from '../game-fields.ts';
import { mayScoreGame } from '../policy.ts';
import type { GameRosterPlayer, GamesTx, NewGameLine } from '../ports.ts';
import { effectiveRulesOf } from '../season-rules-of.ts';

export type SetBoxScoreError =
  | DecideGameError
  | {
      readonly code:
        | 'game-is-tracked'
        | 'player-not-on-team'
        | 'player-listed-twice'
        | 'did-not-play-has-stats';
    };

/** A stat key as the database takes it (is_stat_counts, migration 0010). */
const statKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/);

/** One player's line from the sheet. */
export const boxScoreLine = z.strictObject({
  teamId: z.uuid(),
  personId: z.uuid(),
  played: z.boolean(),
  /** Null when minutes were not recorded. */
  secondsPlayed: z.number().int().min(0).max(86_400).nullable(),
  /** Counts by stat; a stat left out was not recorded. */
  stats: z
    .record(statKey, z.number().int().min(0).max(999))
    .refine((stats) => Object.keys(stats).length <= 40),
});

export type BoxScoreLineInput = z.infer<typeof boxScoreLine>;

export const setBoxScore = defineCommand({
  name: 'games.set_box_score',
  permission: 'games.score',
  input: z.object({
    gameId: z.uuid(),
    version: gameVersion,
    homeScore: gameScore,
    awayScore: gameScore,
    lines: z.array(boxScoreLine).max(200),
  }),
  // Whoever may score this game, by the league's setting (P4 §4), as for a final score.
  allowed: (context, input, tx: GamesTx) => mayScoreGame(context, tx, input.gameId),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<{ version: number }, SetBoxScoreError>> => {
    const open = openGame(await tx.games.find(input.gameId), input.version);
    if (!open.ok) return open;
    const game = open.value;
    if (game.status === 'live' || (await tx.games.hasPlays(game.id))) {
      return fail({ code: 'game-is-tracked' });
    }
    if (input.homeScore === input.awayScore) {
      const rules = await effectiveRulesOf(tx, game);
      if (!rules.allowTies) return fail({ code: 'tie-not-allowed' });
    }
    const roster = await tx.games.listRoster(game.id);
    const rosterOf = new Map<string, GameRosterPlayer>(
      roster.map((player) => [`${player.teamId}/${player.personId}`, player]),
    );
    const seen = new Set<string>();
    const lines: NewGameLine[] = [];
    for (const line of input.lines) {
      if (line.teamId !== game.homeTeamId && line.teamId !== game.awayTeamId) {
        return fail({ code: 'team-not-in-game' });
      }
      const player = rosterOf.get(`${line.teamId}/${line.personId}`);
      if (player === undefined) return fail({ code: 'player-not-on-team' });
      if (seen.has(line.personId)) return fail({ code: 'player-listed-twice' });
      seen.add(line.personId);
      if (!line.played && (line.secondsPlayed !== null || Object.keys(line.stats).length > 0)) {
        return fail({ code: 'did-not-play-has-stats' });
      }
      lines.push({
        gameId: game.id,
        teamId: line.teamId,
        personId: line.personId,
        played: line.played,
        secondsPlayed: line.secondsPlayed,
        stats: line.stats,
        jerseyNumber: player.jerseyNumber,
      });
    }
    await tx.games.replaceLines(game.id, lines);
    return decideGame({
      context,
      tx,
      emit,
      game,
      version: input.version,
      action: 'games.set_box_score',
      status: 'final',
      homeScore: input.homeScore,
      awayScore: input.awayScore,
      captureMode: 'box',
    });
  },
});
