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

/**
 * The heading over the home page's coming games: "The next matchups", or, when every game
 * it lists is postponed (a season whose other games have all been played), words that say
 * they are waiting for a new date. Its message key.
 */
export function homeNextTitle(
  next: readonly GameView[],
): 'home.upcoming' | 'home.upcoming.postponed' {
  return next.length > 0 && next.every((g) => g.status === 'postponed')
    ? 'home.upcoming.postponed'
    : 'home.upcoming';
}

/** What of a standings table decides its height: its rows, and whether it has notes. */
export type TableHeight = { readonly rows: number; readonly hasNotes: boolean };

// Heights, in rows of a standings table (about 49 on a laptop), measured on the pictures.
const tableHeadRows = 2;
const boardRows = 4.75;
const gapRows = 0.5;
/** A leader's card with a column to itself (its number beside its name), and the gap after. */
const leaderRows = 2.6;
const leaderGapRows = 0.33;
/** The small heading over leaders that stand under the standings, with the space above it. */
const leaderHeadRows = 1.4;
/** How far past level the standings column may run before a leader is one too many. */
const leaderSlackRows = 0.5;

/**
 * Where the home page's leaders stand. When the column of standings is shorter than the
 * column of games beside it, as many leaders as close the hole stand under the standings
 * (`beside`), each card one short row. Otherwise they stand across the page in a section
 * of their own (`across`), one, two or three in a row. Never both: a leader is named once.
 */
export function homeLeadersPlace(
  boards: number,
  tables: readonly TableHeight[],
  leaders: number,
): { readonly beside: number; readonly across: number } {
  // With no standings, or more than two tables (which lie across the page), there is no
  // short column to fill.
  if (leaders === 0 || boards === 0 || tables.length === 0 || tables.length > 2) {
    return { beside: 0, across: leaders };
  }
  const tablesTall =
    tables.reduce((sum, table) => sum + tableHeadRows + table.rows + (table.hasNotes ? 1 : 0), 0) +
    gapRows * (tables.length - 1);
  const boardsTall = boards * boardRows + gapRows * (boards - 1);
  const hole = boardsTall - tablesTall + leaderSlackRows;
  let beside = 0;
  while (
    beside < leaders &&
    leaderHeadRows + (beside + 1) * leaderRows + beside * leaderGapRows <= hole
  ) {
    beside += 1;
  }
  return beside > 0 ? { beside, across: 0 } : { beside: 0, across: leaders };
}

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
