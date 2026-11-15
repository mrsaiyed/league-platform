// Which games the home page shows in each of its lists (step 2.147), chosen so that the
// page is laid out whole: neither of the two columns of its lower half left empty beside
// the other, and the two ending about level. Nothing here reads anything.
import type { GameView } from './build-schedule.ts';

/** How many games still to come the home page shows, and how many waiting for a new day. */
const nextCount = 4;
const postponedCount = 2;

/**
 * The home page's coming games: the next four still to start, then up to two waiting for
 * a new day. Every one of them is shown: a real coming game is never left out to make the
 * number even. They are drawn two across, and where one is left over its card takes the
 * whole row (the grid's own rule), so no card has a hole beside it either way. A game
 * whose start has passed with no result is not a coming game: it is listed with the
 * latest games.
 */
export function homeNextGames(upcoming: readonly GameView[]): readonly GameView[] {
  const toStart = upcoming
    .filter((g) => g.status === 'scheduled' && g.awaiting !== true)
    .slice(0, nextCount);
  const waiting = upcoming.filter((g) => g.status === 'postponed').slice(0, postponedCount);
  return [...toStart, ...waiting];
}

/** What of a standings table decides its height: its rows, and whether it has notes. */
export type TableHeight = { readonly rows: number; readonly hasNotes: boolean };

/**
 * The home page's latest games: the latest decided games first, then the games whose
 * start has passed with no result yet (each says "Awaiting result"). They stand in a
 * column beside the standings, so their number follows the height of the tables there:
 * about as many scoreboards as the tables are tall, never fewer than two or more than
 * five. A game waiting for its result is counted inside that number, so the column still
 * ends level with the tables; it never takes the last decided game's place, so the list
 * opens with a result whenever there is one. A league with more than two tables has the
 * list across the page instead, four of them.
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
  const waiting = awaiting.slice(0, recent.length > 0 ? fits - 1 : fits);
  // Where fewer games are waiting than there is room for, decided games fill the rest.
  return [...recent.slice(0, fits - waiting.length), ...waiting];
}
