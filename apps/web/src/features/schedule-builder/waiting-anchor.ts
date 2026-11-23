// The id of "Waiting for a new date" on Admin → Games (step 2.158): the one maker of the
// place a postponed game's card, the schedule grid and the box score page lead to. Here, not
// in Games, so the schedule's pages and Games' both use it with no loop between them.
export const waitingListAnchor = 'to-reschedule';

/** The place of one waiting game's "Give it a new date" (step 2.53), where postponing leads. */
export function newDateAnchor(gameId: string): string {
  return `new-date-${gameId}`;
}
