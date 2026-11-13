// Sets how a game of the schedule draft is recorded (P7 §5.2): final score only, box score
// afterwards, or live.
import { z } from 'zod';
import { defineCommand, type Result } from '../../../command/index.ts';
import { gameRecording } from '../draft-document.ts';
import { draftBasis, editDraft, type DraftEditError, type DraftEditValue } from '../draft-edit.ts';
import { mayEditSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';

export type SetDraftRecordingError = DraftEditError;

export const setDraftRecording = defineCommand({
  name: 'scheduling.set_draft_recording',
  permission: 'schedule.edit',
  input: z.object({ ...draftBasis, gameId: z.uuid(), recording: gameRecording }),
  allowed: (context, input, tx: SchedulingTx) => mayEditSchedule(context, tx, input.seasonId),
  run: async ({ context, input, tx }): Promise<Result<DraftEditValue, SetDraftRecordingError>> =>
    editDraft({
      context,
      tx,
      action: 'scheduling.set_draft_recording',
      input,
      change: { kind: 'set-recording', gameId: input.gameId, recording: input.recording },
    }),
});
