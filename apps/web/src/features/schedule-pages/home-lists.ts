// Which games the home page shows in each of its lists (step 2.147), chosen so that the
// page is laid out whole: no card with a hole beside it, and neither of the two columns
// of its lower half left empty beside the other. Nothing here reads anything.
import type { GameView } from './build-schedule.ts';

/** How many games still to come the home page shows, and how many waiting for a new day. */
const nextCount = 4;
const postponedCount = 2;

/**
 * The home page's coming games: the next few still to start, then those waiting for a new
 * day. They are drawn two across, so where one would be left over the last of the coming
 * ones gives way: the list stays the next games to be played, and no card has a hole
 * beside it. (A list of three or fewer is shown whole; the last card of an odd one takes
 * the row.) A game whose start has passed with no result is not a coming game: it is
 * listed with the results.
 */
export function homeNextGames(upcoming: readonly GameView[]): readonly GameView[] {
  const toStart = upcoming
    .filter((g) => g.status === 'scheduled' && g.awaiting !== true)
    .slice(0, nextCount);
  const waiting = upcoming.filter((g) => g.status === 'postponed').slice(0, postponedCount);
  const odd = (toStart.length + waiting.length) % 2 === 1;
  return [...(odd && toStart.length >= 3 ? toStart.slice(0, -1) : toStart), ...waiting];
}

/** What of a standings table decides its height: its rows, and whether it has notes. */
export type TableHeight = { readonly rows: number; readonly hasNotes: boolean };

/**
 * The home page's results: games whose start has passed with no result yet, latest first
 * (each says "Awaiting result"), then the latest decided games. They stand in a column
 * beside the standings, so their number follows the height of the tables there: about as
 * many scoreboards as the tables are tall, never fewer than two or more than five, and
 * one more when a game is waiting for its result. A league with more than two tables has
 * its results across the page instead, four of them.
 */
export function homeResults(
  recent: readonly GameView[],
  awaiting: readonly GameView[],
  tables: readonly TableHeight[],
): readonly GameView[] {
  // In rows of a table: a table's name and headings are about two rows, its notes one more.
  const rows = tables.reduce((sum, table) => sum + 2 + table.rows + (table.hasNotes ? 1 : 0), 0);
  // A scoreboard is about as tall as five rows of a table.
  const fits = tables.length > 2 ? 4 : Math.min(5, Math.max(2, Math.round(rows / 5)));
  // A game waiting for its result is news of its own: it does not take a result's place.
  return [...awaiting, ...recent].slice(0, fits + (awaiting.length > 0 ? 1 : 0));
}
