// What the box score page draws for a game called off and for a tracked game's grid, by the
// game's own state and what the reads let this person do (step 2.253). In a league that is
// archived or suspended the sheet is locked by the league (T-519), so these ask the game's
// status, not the sheet's lock, which names the league's state there first.
import type { BoxScoreSheet, TrackedBoxScore } from '@srleagues/core';

/**
 * A called-off game's panel: the way to the games waiting for a new date (a postponed game),
 * and the form that puts it back (for whoever may call it off); null when it draws nothing.
 */
export type CalledOffPanel = {
  readonly waitingLink: boolean;
  readonly form: 'put-back' | 'restore' | null;
};

export function calledOffPanelOf(status: string, mayCallOff: boolean): CalledOffPanel | null {
  if (status !== 'postponed' && status !== 'cancelled') return null;
  const form = !mayCallOff ? null : status === 'cancelled' ? 'put-back' : 'restore';
  const waitingLink = status === 'postponed';
  return waitingLink || form !== null ? { waitingLink, form } : null;
}

/**
 * Whether the page reads the tracked grid: a tracked game for whoever may correct it, and
 * in a read-only league any game, the read answering only a tracked one, to whoever it lets
 * view it (mayViewChanges, T-519).
 */
export function readsTrackedGrid(sheet: Pick<BoxScoreSheet, 'locked' | 'mayCorrect'>): boolean {
  if (sheet.locked === 'archived' || sheet.locked === 'suspended') return true;
  return sheet.locked === 'tracked' && sheet.mayCorrect;
}

/** The way to the tracked grid's page: to edit it, to view it (read-only league), or none. */
export function trackedGridLinkOf(
  grid: Pick<TrackedBoxScore, 'correctable' | 'notCorrectable'>,
): 'edit' | 'view' | null {
  if (grid.correctable) return 'edit';
  return grid.notCorrectable === 'league-read-only' ? 'view' : null;
}
