// Adds a game to the season's schedule draft (P7 §4.3). The game's id is the caller's, so
// a retried request cannot add it twice; a game added by hand is scheduled and follows the
// season's rules for how it is recorded unless the edit says otherwise. Clashes it causes
// are flagged in the result, not refused. The id of a published game is refused: that game
// comes back by putBackDraftGame.
import { z } from 'zod';
import { defineCommand, type Result } from '../../../command/index.ts';
import { gameRecording } from '../draft-document.ts';
import {
  checkSlotPlace,
  draftBasis,
  editDraft,
  type DraftEditError,
  type DraftEditValue,
} from '../draft-edit.ts';
import { mayEditSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';
import { seasonArchivedForSchedule } from '../archived-season.ts';

export type AddDraftGameError = DraftEditError;

export const addDraftGame = defineCommand({
  name: 'scheduling.add_draft_game',
  permission: 'schedule.edit',
  refusedInArchivedSeason: seasonArchivedForSchedule,
  input: z.object({
    ...draftBasis,
    gameId: z.uuid(),
    homeTeamId: z.uuid(),
    awayTeamId: z.uuid(),
    roundId: z.uuid().nullable(),
    date: z.string().max(10),
    time: z.string().max(5).nullable(),
    venueId: z.uuid().nullable(),
    court: z.string().trim().min(1).max(100).nullable(),
    recording: gameRecording.nullable().optional(),
  }),
  allowed: (context, input, tx: SchedulingTx) => mayEditSchedule(context, tx, input.seasonId),
  run: async ({ context, input, tx }): Promise<Result<DraftEditValue, AddDraftGameError>> =>
    editDraft({
      context,
      tx,
      action: 'scheduling.add_draft_game',
      input,
      change: {
        kind: 'add-game',
        game: {
          id: input.gameId,
          homeTeamId: input.homeTeamId,
          awayTeamId: input.awayTeamId,
          roundId: input.roundId,
          date: input.date,
          time: input.time,
          venueId: input.venueId,
          court: input.court,
          recording: input.recording ?? null,
          status: 'scheduled',
        },
      },
      check: async (_sofar, published) => {
        // A game of the published schedule comes back only by "Put it back" (step 2.185):
        // under its own id with other teams, the draft would count a change publishing
        // never makes (publishing moves a game, it never changes its teams).
        if (published.games.some((g) => g.id === input.gameId)) {
          return { code: 'change-refused', reason: { code: 'game-exists', gameId: input.gameId } };
        }
        const wanted = new Set([input.homeTeamId, input.awayTeamId]);
        const found = await tx.scheduling.teamsOfSeason(input.seasonId, [...wanted]);
        if (found.length !== wanted.size) return { code: 'unknown-team' };
        // A team that has left the league plays no new game (S-87); its games already in
        // the schedule stay, for the admin to forfeit or cancel.
        const left = await tx.scheduling.leftTeamsOfSeason(input.seasonId, [...wanted]);
        if (left.length > 0) return { code: 'team-left', teamIds: left };
        return checkSlotPlace(tx, input);
      },
    }),
});
