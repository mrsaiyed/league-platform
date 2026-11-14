// Who gets the scorekeeper's admin, and which of their games it offers to open in the
// tracker (P4 §4, P7 §5.1). Used by my-games-page.tsx and the tracker's page.
import type { AdminArea, MyGame } from '@srleagues/core';

/** Whether someone uses the admin only to score: Games is the one area open to them. */
export function scoresOnly(areas: readonly AdminArea[]): boolean {
  return areas.length === 1 && areas[0] === 'games';
}

/** The tracker opens a game that is to be played or being played, in a league that may score. */
export function opensInTracker(game: Pick<MyGame, 'status' | 'scorable'>): boolean {
  return game.scorable && (game.status === 'scheduled' || game.status === 'live');
}
