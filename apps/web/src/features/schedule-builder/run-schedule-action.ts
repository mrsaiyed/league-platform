// What each button of the schedule grid does: reads its form, runs the scheduling
// commands for it and says how it went. The league and the person come in as the
// command context the server built from the session; the form never names them (T-23).
// Every edit goes to the draft; only `publish` reaches the public schedule.
import {
  addDraftGame,
  changeDraftRoundDate,
  discardScheduleDraft,
  moveDraftGame,
  publishSchedule,
  removeDraftGame,
  renameDraftRound,
  setDraftRecording,
  swapDraftGames,
  type CommandContext,
  type CommandDeps,
  type Result,
  type SchedulingTx,
} from '@srleagues/core';
import { parsePlace } from './build-grid.ts';

export type ScheduleActionKind =
  | 'save-game'
  | 'add-game'
  | 'remove-game'
  | 'swap-games'
  | 'rename-round'
  | 'change-round-date'
  | 'publish'
  | 'discard';

export type ScheduleActionOutcome =
  | { readonly kind: 'saved' | 'published' | 'discarded' }
  | {
      readonly kind: 'refused';
      /** The command's error code, or `invalid-input`. */
      readonly code: string;
      /** For a change the schedule rules refused: which rule. */
      readonly reason?: string;
      /** The move was saved to the draft but the recording change after it was refused. */
      readonly partial?: true;
    };

type Basis = {
  seasonId: string;
  basedOnRevision: number | null;
  version: number | null;
  draftId: string | null;
};

const text = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
};
const orNull = (value: string): string | null => (value === '' ? null : value);
const numberOrNull = (value: string): number | null => {
  if (value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : Number.NaN;
};

const invalid: ScheduleActionOutcome = { kind: 'refused', code: 'invalid-input' };

function refusal(result: Extract<Result<unknown, { code: string }>, { ok: false }>) {
  const error = result.error as { code: string; reason?: { code?: string } };
  return {
    kind: 'refused' as const,
    code: error.code,
    ...(error.reason?.code === undefined ? {} : { reason: error.reason.code }),
  };
}

/** The draft's place after an edit: what the next edit names as its basis. */
type Moved = { draftId: string; version: number; basedOnRevision: number | null };

export async function runScheduleAction(
  kind: ScheduleActionKind,
  form: FormData,
  context: CommandContext,
  deps: CommandDeps<SchedulingTx>,
): Promise<ScheduleActionOutcome> {
  const basis: Basis = {
    seasonId: text(form, 'seasonId'),
    basedOnRevision: numberOrNull(text(form, 'basedOnRevision')),
    version: numberOrNull(text(form, 'version')),
    draftId: orNull(text(form, 'draftId')),
  };
  const next = (b: Basis, moved: Moved): Basis => ({ ...b, ...moved });
  const place = parsePlace(text(form, 'place'));
  const slot = {
    roundId: orNull(text(form, 'roundId')),
    date: text(form, 'date'),
    time: orNull(text(form, 'time')),
    venueId: place.venueId,
    court: place.court,
  };
  const gameId = text(form, 'gameId');

  switch (kind) {
    case 'add-game': {
      const recording = orNull(text(form, 'recording'));
      const done = await addDraftGame(
        context,
        {
          ...basis,
          gameId,
          homeTeamId: text(form, 'homeTeamId'),
          awayTeamId: text(form, 'awayTeamId'),
          ...slot,
          ...(recording === null ? {} : { recording }),
        },
        deps,
      );
      return done.ok ? { kind: 'saved' } : refusal(done);
    }
    case 'save-game': {
      // Only what changed is sent, so a game that was not touched adds nothing to the draft.
      const wasSlot = text(form, 'wasSlot');
      const nowSlot = [slot.roundId ?? '', slot.date, slot.time ?? '', text(form, 'place')].join(
        '~',
      );
      let current = basis;
      let movedSlot = false;
      if (wasSlot !== nowSlot) {
        const moved = await moveDraftGame(context, { ...current, gameId, ...slot }, deps);
        if (!moved.ok) return refusal(moved);
        current = next(current, moved.value);
        movedSlot = true;
      }
      const recording = text(form, 'recording');
      if (recording !== '' && recording !== text(form, 'wasRecording')) {
        const set = await setDraftRecording(context, { ...current, gameId, recording }, deps);
        // The move above is already in the draft: say so rather than a plain "not saved".
        if (!set.ok) return movedSlot ? { ...refusal(set), partial: true } : refusal(set);
      }
      return { kind: 'saved' };
    }
    case 'remove-game': {
      const done = await removeDraftGame(context, { ...basis, gameId }, deps);
      return done.ok ? { kind: 'saved' } : refusal(done);
    }
    case 'swap-games': {
      const otherGameId = text(form, 'otherGameId');
      if (otherGameId === '') return invalid;
      const done = await swapDraftGames(context, { ...basis, gameId, otherGameId }, deps);
      return done.ok ? { kind: 'saved' } : refusal(done);
    }
    case 'rename-round': {
      const done = await renameDraftRound(
        context,
        { ...basis, roundId: text(form, 'roundId'), label: text(form, 'label') },
        deps,
      );
      return done.ok ? { kind: 'saved' } : refusal(done);
    }
    case 'change-round-date': {
      const done = await changeDraftRoundDate(
        context,
        { ...basis, roundId: text(form, 'roundId'), date: text(form, 'date') },
        deps,
      );
      return done.ok ? { kind: 'saved' } : refusal(done);
    }
    case 'publish': {
      if (basis.draftId === null || basis.version === null) return invalid;
      const done = await publishSchedule(
        context,
        {
          seasonId: basis.seasonId,
          basedOnRevision: basis.basedOnRevision,
          draftId: basis.draftId,
          version: basis.version,
        },
        deps,
      );
      return done.ok ? { kind: 'published' } : refusal(done);
    }
    case 'discard': {
      if (basis.draftId === null || basis.version === null) return invalid;
      const done = await discardScheduleDraft(
        context,
        { seasonId: basis.seasonId, draftId: basis.draftId, version: basis.version },
        deps,
      );
      return done.ok ? { kind: 'discarded' } : refusal(done);
    }
  }
}
