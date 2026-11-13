import type { ChangeError, Clash, DraftChange, ScheduleState } from './schedule-types.ts';
import { applyDraftChange } from './apply-change.ts';
import { findClashes } from './find-clashes.ts';

export type ApplyDraftResult = {
  /** The published schedule with every change that could be applied. */
  state: ScheduleState;
  /** Changes that could not be applied, by their position in the list. */
  rejected: { index: number; error: ChangeError }[];
  /** Every clash left in the result. */
  clashes: Clash[];
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
  return { state, rejected, clashes: findClashes(state.games, skippedDates) };
}
