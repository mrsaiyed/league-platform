import type {
  ChangeError,
  Clash,
  DraftChange,
  ScheduleGame,
  ScheduleState,
} from './schedule-types.ts';
import { applyDraftChange } from './apply-change.ts';
import { findClashes } from './find-clashes.ts';

export type ApplyDraftResult = {
  /** The published schedule with every change that could be applied. */
  state: ScheduleState;
  /** Changes that could not be applied, by their position in the list. */
  rejected: { index: number; error: ChangeError }[];
  /** Every clash left in the result. */
  clashes: Clash[];
  /**
   * The games the draft removes and the result does not hold, each as it was just before
   * it was removed: what "Put it back" adds again (step 2.161).
   */
  removed: ScheduleGame[];
};

/** Applies a draft's changes in order to the published schedule; the published one is never changed (A-9). */
export function applyDraft(
  published: ScheduleState,
  changes: readonly DraftChange[],
  skippedDates: readonly string[],
): ApplyDraftResult {
  // A copy, so the result never is the published object even when nothing changes.
  let state: ScheduleState = { rounds: [...published.rounds], games: [...published.games] };
  const rejected: ApplyDraftResult['rejected'] = [];
  changes.forEach((change, index) => {
    const result = applyDraftChange(state, change, skippedDates);
    if (result.ok) state = result.state;
    else rejected.push({ index, error: result.error });
  });
  // The state keeps each removed game as it was just before (apply-change.ts).
  const removed = (state.removedGames ?? []).filter(
    (game) => !state.games.some((g) => g.id === game.id),
  );
  return { state, rejected, clashes: findClashes(state.games, skippedDates), removed };
}
