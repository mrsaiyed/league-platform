// What each button of the schedule grid does: reads its form, runs the scheduling
// commands for it and says how it went. The league and the person come in as the
// command context the server built from the session; the form never names them (T-23).
// Every edit goes to the draft; only `publish` reaches the public schedule.
import {
  addDraftGame,
  addDraftRound,
  changeDraftRoundDate,
  discardScheduleDraft,
  moveDraftGame,
  publishSchedule,
  removeDraftGame,
  removeDraftRound,
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
  | 'add-round'
  | 'remove-round'
  | 'publish'
  | 'discard';

/**
 * What a save did, so the grid says "Saved" beside what was saved, naming it (step 2.160;
 * A-4). A removed round is said where it was: after the round before it (null: first).
 */
export type SavedDetail =
  | { readonly what: 'round-added' | 'round-saved'; readonly roundId: string }
  | { readonly what: 'round-removed'; readonly afterRoundId: string | null }
  | { readonly what: 'game-saved'; readonly gameId: string }
  /** A game went to another round and its date was left as it was: the grid offers the round's. */
  | { readonly what: 'game-round'; readonly gameId: string }
  /**
   * A game was removed from this round (null: from the games with no round), with what it
   * was, so the grid can offer to put it back exactly as it was (step 2.161).
   */
  | { readonly what: 'game-removed'; readonly roundId: string | null; readonly game?: RemovedGame }
  /** A removed game was put back in the draft as it was. */
  | { readonly what: 'game-put-back'; readonly gameId: string };

/** A game as it was before it was removed from the draft: all "Put it back" needs. */
export type RemovedGame = {
  readonly gameId: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly roundId: string | null;
  readonly date: string;
  readonly time: string | null;
  /** The venue and court as one form value (build-grid.ts, placeValue). */
  readonly place: string;
  readonly recording: string | null;
};

/** Which form a refusal belongs beside: the new round's, or one round's own. */
export type RefusedAt =
  | { readonly form: 'add-round'; readonly label: string; readonly date: string }
  | { readonly form: 'round'; readonly roundId: string };

export type ScheduleActionOutcome =
  | { readonly kind: 'saved'; readonly detail?: SavedDetail }
  | { readonly kind: 'published' | 'discarded' }
  | {
      readonly kind: 'refused';
      /** The command's error code, or `invalid-input`. */
      readonly code: string;
      /** For a change the schedule rules refused: which rule. */
      readonly reason?: string;
      /** The move was saved to the draft but the recording change after it was refused. */
      readonly partial?: true;
      /** Where to say it, with what was typed, so the form keeps it. */
      readonly at?: RefusedAt;
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
      if (!done.ok) return refusal(done);
      // "Put it back" adds the removed game again, with its own id and everything it had.
      const what = text(form, 'putBack') === '' ? 'game-saved' : 'game-put-back';
      return { kind: 'saved', detail: { what, gameId } };
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
      // Into another round with the date left as it was: the grid offers the round's date.
      const [wasRound, wasDate] = wasSlot.split('~');
      if (
        movedSlot &&
        slot.roundId !== null &&
        slot.roundId !== wasRound &&
        slot.date === wasDate
      ) {
        return { kind: 'saved', detail: { what: 'game-round', gameId } };
      }
      return { kind: 'saved', detail: { what: 'game-saved', gameId } };
    }
    case 'add-round': {
      const roundId = text(form, 'roundId');
      const label = text(form, 'label');
      const date = text(form, 'date');
      const done = await addDraftRound(context, { ...basis, roundId, label, date }, deps);
      return done.ok
        ? { kind: 'saved', detail: { what: 'round-added', roundId } }
        : { ...refusal(done), at: { form: 'add-round', label, date } };
    }
    case 'remove-round': {
      const roundId = text(form, 'roundId');
      const done = await removeDraftRound(context, { ...basis, roundId }, deps);
      return done.ok
        ? {
            kind: 'saved',
            detail: { what: 'round-removed', afterRoundId: orNull(text(form, 'afterRoundId')) },
          }
        : { ...refusal(done), at: { form: 'round', roundId } };
    }
    case 'remove-game': {
      const done = await removeDraftGame(context, { ...basis, gameId }, deps);
      if (!done.ok) return refusal(done);
      // Said in the round the game was in when the form was drawn, with the game as it was
      // drawn (not as the fields were edited before "Remove game" was tapped).
      const [wasRound = '', date = '', time = '', ...place] = text(form, 'wasSlot').split('~');
      const roundId = orNull(wasRound);
      return {
        kind: 'saved',
        detail: {
          what: 'game-removed',
          roundId,
          game: {
            gameId,
            homeTeamId: text(form, 'homeTeamId'),
            awayTeamId: text(form, 'awayTeamId'),
            roundId,
            date,
            time: orNull(time),
            place: place.join('~'),
            recording: orNull(text(form, 'wasRecording')),
          },
        },
      };
    }
    case 'swap-games': {
      const otherGameId = text(form, 'otherGameId');
      if (otherGameId === '') return invalid;
      const done = await swapDraftGames(context, { ...basis, gameId, otherGameId }, deps);
      return done.ok ? { kind: 'saved', detail: { what: 'game-saved', gameId } } : refusal(done);
    }
    case 'rename-round':
    case 'change-round-date': {
      const roundId = text(form, 'roundId');
      const done =
        kind === 'rename-round'
          ? await renameDraftRound(context, { ...basis, roundId, label: text(form, 'label') }, deps)
          : await changeDraftRoundDate(
              context,
              { ...basis, roundId, date: text(form, 'date') },
              deps,
            );
      return done.ok
        ? { kind: 'saved', detail: { what: 'round-saved', roundId } }
        : { ...refusal(done), at: { form: 'round', roundId } };
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
