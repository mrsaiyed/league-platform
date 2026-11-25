// An admin corrects a live-tracked game in its box score grid (step 2.65, T6 §8, T-122).
// The grid never writes lines: what changed becomes the tracker's own commands (a foul,
// its take-back, a turnover, its take-back, a basket: grid-correction-plays.ts), applied
// through the one door every tracker batch goes through (apply-plays.ts), so the event
// log always explains the final numbers and replaying it gives exactly the grid's lines.
//
// As for any correction the game is reopened with a reason first (S-7, games.reopen_game
// or the scorekeeper's games.reopen_tracked_game): it must be live, and its newest
// correction must still be open (taken back to live, not ended again). It needs
// `games.correct` at the game's program. The grid is read with the number of the game's
// last event (games.read_tracked_box_score); a save after anything else was recorded is
// refused (`changed-since-read`), so it never undoes a play it did not see.
//
// All or nothing: every play is judged first, as the door judges it (on the team, a
// statistic the season keeps, the engine's own "no"), before anything is written, since a
// refusal does not roll a transaction back. A play the door then refuses after all is a
// fault, thrown, so the transaction is rolled back. The plays are the admin's, kept with
// their account; the game stays live, to be ended again (finish-tracked-game.ts).
//
// "End the game again" (step 2.65 fix round, T-407): with `end`, the scoring screen's own
// End game tap (`{ type: 'end' }`) follows the grid's plays, if any, through the same
// door, so it is the scoring screen's end and no second way: the lines are settled, the
// game is final with its scores and its correction closed, and standings follow. No
// scoring session is asked for, as none is for the grid's plays: a device that holds the
// game is told at its next tap that the game can no longer be scored (T-113), and keeps
// what it typed. A level score the rules do not allow is refused first (`tie-not-allowed`).
// One save writes at most `maxCorrectionPlays` plays (`too-many-plays`): more is a typo.
import { trackerProtocolVersion, type TrackerCommand } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { z } from 'zod';
import { recordActivity, scopeDetails } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { applyPlays } from '../apply-plays.ts';
import { gameInArchivedSeasonNotReopened } from '../archived-season.ts';
import { isDecided } from '../game-fields.ts';
import { gridCorrectionPlays, gridCounts, type GridCount } from '../grid-correction-plays.ts';
import { linesOf, playerNotOnTeam, readState, rosterOf, scoreOf } from '../live-game.ts';
import { gameScope, mayChangeGames } from '../policy.ts';
import type { TrackerTx } from '../ports.ts';
import { effectiveRulesOf } from '../season-rules-of.ts';
import { keptForScoring, tapNotKept } from '../statistic-of-tap.ts';

/** The most plays one grid save writes (T-407): 200 is far past any real correction. */
export const maxCorrectionPlays = 200;

export type CorrectTrackedBoxScoreError =
  | {
      readonly code:
        | 'game-not-found'
        | 'not-allowed'
        | 'changed-since-read'
        | 'not-tracked'
        | 'game-final'
        | 'game-not-live'
        | 'reason-needed'
        | 'team-not-in-game'
        | 'player-listed-twice'
        | 'tie-not-allowed'
        | 'nothing-recorded';
    }
  | { readonly code: 'too-many-plays'; readonly limit: number }
  | { readonly code: 'player-not-on-team'; readonly personId: string }
  | { readonly code: 'statistic-not-kept'; readonly personId: string; readonly statistic: string }
  | {
      readonly code: 'rule';
      readonly problem: 'basket-taken-back';
      readonly personId: string;
      readonly stat: GridCount;
    }
  /** The engine's own "no" to a play the grid makes, in its words (as a tracker's tap is told). */
  | {
      readonly code: 'rule';
      readonly problem: 'engine';
      readonly personId: string;
      readonly message: string;
    };

const count = z.number().int().min(0).max(999);

/** One player's line as the grid wants it: a count left out stays as it is. */
export const trackedGridLine = z.strictObject({
  teamId: z.uuid(),
  personId: z.uuid(),
  ...(Object.fromEntries(gridCounts.map((stat) => [stat, count.optional()])) as Record<
    GridCount,
    z.ZodOptional<typeof count>
  >),
});

export const correctTrackedBoxScore = defineCommand({
  name: 'games.correct_tracked_box_score',
  permission: 'games.correct',
  refusedInArchivedSeason: gameInArchivedSeasonNotReopened,
  input: z.object({
    gameId: z.uuid(),
    /** The game's last event when the grid was read (games.read_tracked_box_score). */
    sequence: z.number().int().min(0),
    lines: z.array(trackedGridLine).max(200),
    /** End the game again after the plays, with the scoring screen's own End game tap. */
    end: z.literal(true).optional(),
  }),
  allowed: async (context, input, tx: TrackerTx) =>
    mayChangeGames(context, tx, 'games.correct', await gameScope(tx, input.gameId)),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<
    Result<{ sequence: number; plays: number; ended: boolean }, CorrectTrackedBoxScoreError>
  > => {
    const gameId = input.gameId.toLowerCase();
    // T-111: the game's lock first, as every command that writes a live game takes it.
    if (!(await tx.scoringSessions.lockGame(gameId))) return fail({ code: 'game-not-found' });
    const game = await tx.games.find(gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    // The plays are kept with who made them; with no account there is no one.
    const accountId = context.accountId;
    if (accountId === null) return fail({ code: 'not-allowed' });
    const saved = await tx.liveGames.findState(gameId);
    if (saved === undefined || !(await tx.games.hasPlays(gameId))) {
      return fail({ code: 'not-tracked' });
    }
    if (isDecided(game.status)) return fail({ code: 'game-final' });
    if (game.status !== 'live') return fail({ code: 'game-not-live' });
    // Reopened with a reason, and that reopen still open (S-7).
    const [newest] = await tx.games.correctionsNewestFirst(gameId);
    if (newest === undefined || newest.after.status !== 'live') {
      return fail({ code: 'reason-needed' });
    }
    const seq = Math.max(saved.seq, await tx.liveGames.lastEventSeq(gameId));
    if (input.sequence !== seq) return fail({ code: 'changed-since-read' });

    const state = readState(saved.state);
    const roster = rosterOf(await tx.liveGames.players(gameId));
    const made = gridCorrectionPlays(game, [...linesOf(game, roster, state).values()], input.lines);
    if (!made.ok) {
      const [first] = made.problems;
      if (first === undefined) throw new Error('A grid refused with no problem.');
      if (first.problem === 'basket-taken-back') {
        return fail({
          code: 'rule',
          problem: 'basket-taken-back',
          personId: first.personId,
          stat: first.stat,
        });
      }
      return fail({ code: first.problem });
    }
    if (made.plays.length > maxCorrectionPlays) {
      return fail({ code: 'too-many-plays', limit: maxCorrectionPlays });
    }
    const end = input.end === true;
    if (made.plays.length === 0 && !end) return ok({ sequence: seq, plays: 0, ended: false });

    // Judged first, as the door will judge them, so nothing is written for a grid refused.
    const kept = keptForScoring((await tx.games.findSeason(game.seasonId))?.rules);
    const now = tx.clock.now();
    let trial = state;
    for (const play of made.plays) {
      if (playerNotOnTeam(game, roster, play) !== undefined) {
        return fail({ code: 'player-not-on-team', personId: play.playerId });
      }
      const statistic = tapNotKept(play.type, kept);
      if (statistic !== undefined) {
        return fail({ code: 'statistic-not-kept', personId: play.playerId, statistic });
      }
      try {
        trial = basketball.apply(trial, play, { id: crypto.randomUUID(), now });
      } catch (thrown) {
        if (!(thrown instanceof basketball.TrackerError)) throw thrown;
        return fail({
          code: 'rule',
          problem: 'engine',
          personId: play.playerId,
          message: thrown.message.slice(0, 300),
        });
      }
    }

    if (end) {
      // Judged as the door judges the scoring screen's end: the engine's own "no" first,
      // then a level score the game's rules do not allow.
      try {
        trial = basketball.apply(trial, { type: 'end' }, { id: crypto.randomUUID(), now });
      } catch (thrown) {
        if (!(thrown instanceof basketball.TrackerError)) throw thrown;
        return fail({ code: 'nothing-recorded' });
      }
      const score = scoreOf(trial);
      if (score.home === score.away && !(await effectiveRulesOf(tx, game)).allowTies) {
        return fail({ code: 'tie-not-allowed' });
      }
    }

    const plays: TrackerCommand['input'][] = [
      ...made.plays.map((play) => ({ ...play })),
      ...(end ? [{ type: 'end' as const }] : []),
    ];
    const commands: TrackerCommand[] = plays.map((input) => ({
      commandId: crypto.randomUUID(),
      at: now,
      input,
    }));
    const ids = commands.map((c) => c.commandId.toLowerCase());
    const refusedBefore = await tx.liveGames.refusedAdds(gameId);
    const applied = await applyPlays({
      context,
      tx,
      emit,
      game,
      gameId,
      saved,
      batch: { commands, knownRefusals: ['statistic-not-kept'] },
      ids,
      taken: new Set(await tx.liveGames.takenCommands(gameId, ids)),
      refusedBefore,
      refusedById: new Map(refusedBefore.map((r) => [r.commandId.toLowerCase(), r])),
      seq,
      version: trackerProtocolVersion,
      accountId,
      playedWithout: false,
    });
    if (applied.results.some((r) => r.status !== 'accepted')) {
      throw new Error('A play of a box score correction, judged beforehand, was refused.');
    }
    await recordActivity(tx, context, {
      action: 'games.correct_tracked_box_score',
      target: { type: 'game', id: gameId },
      details: {
        gameId,
        plays: made.plays.length,
        ...(end ? { ended: true } : {}),
        ...scopeDetails(await gameScope(tx, gameId)),
      },
    });
    return ok({ sequence: applied.seq, plays: made.plays.length, ended: end });
  },
});
