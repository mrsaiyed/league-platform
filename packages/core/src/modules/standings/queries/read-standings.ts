// The standings page's data (P7 §6, S-9, S-10): one table per division with seeds,
// the adjustments as footnotes with their reasons, and which teams are level and why
// they are ordered. Standings are never restricted (S-22), so this takes no viewer.
// Built field by field (T-29): no account, no contact field.
import { SeasonRules } from '@srleagues/contracts';
import { fail, ok, type Result } from '../../../command/index.ts';
import type {
  DecidedGameRecord,
  SeasonDivisionRow,
  SeasonTeamRow,
  StandingsAdjustmentWithReason,
  StandingsReadStore,
  StandingsRowRecord,
} from '../read-ports.ts';

export type StandingsFootnote = {
  /** The number shown beside the row and under the table, from 1 in each table. */
  readonly number: number;
  readonly reason: string;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly points: number;
};

export type StandingsLine = {
  readonly rank: number;
  readonly seed: number;
  /** Another team of the table shares this rank: nothing separated them yet. */
  readonly tied: boolean;
  /**
   * What put the team in its place: its record alone, one of the season's
   * tiebreakers by name (such as head-to-head), or 'still-tied'.
   */
  readonly orderedBy: string;
  readonly team: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly color: string | null;
    /** In the bin, kept for its results (A-17): marked, and never linked to a page. */
    readonly removed: boolean;
  };
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  readonly pointDifference: number;
  /** Wins with half a win for each tie, over wins, losses and ties; 0 with none. */
  readonly winPercentage: number;
  readonly points: number | null;
  readonly streak: { readonly result: 'won' | 'lost' | 'tied'; readonly length: number } | null;
  /** The numbers of the footnotes that apply to this row. */
  readonly footnotes: readonly number[];
};

/**
 * Teams of one table level on what the table ranks by (S-9): their win percentage or, in a
 * table ranked by points, their standings points. Worked out from the stored whole numbers
 * (wins, losses and ties, or points), never from a rounded percentage. A team with no
 * games is at 0, level with a team that has lost every game, as the engine ranks them.
 */
export type LevelGroup = {
  /** Two or more teams, in the table's order. */
  readonly teamIds: readonly string[];
  /** Those of them that have not played a game: level only because none counts as 0. */
  readonly notPlayed: readonly string[];
  readonly on: 'win-percentage' | 'points';
  /**
   * When exactly two of them have played and head-to-head is the stored reason of both:
   * how many decided games those two played against each other (0 when they never met,
   * as when the team they were compared through is in the bin). Null otherwise.
   */
  readonly gamesBetween: number | null;
};

export type StandingsTable = {
  /** Null for a season without divisions. */
  readonly division: {
    readonly id: string;
    readonly name: string;
    readonly color: string | null;
  } | null;
  readonly lines: readonly StandingsLine[];
  readonly footnotes: readonly StandingsFootnote[];
  /** Each group of teams level with each other, best first. */
  readonly levelGroups: readonly LevelGroup[];
};

export type Standings = {
  readonly seasonId: string;
  readonly seasonName: string;
  readonly rankBy: 'win-percentage' | 'points' | null;
  /** The season's tiebreakers in its own order; none when its rules cannot be read. */
  readonly tiebreakers: readonly string[];
  readonly tables: readonly StandingsTable[];
};

export type ReadStandingsError = { readonly code: 'season-not-found' };

export function winPercentageOf(wins: number, losses: number, ties: number): number {
  const decided = wins + losses + ties;
  return decided === 0 ? 0 : (wins + ties / 2) / decided;
}

const streakResults = ['won', 'lost', 'tied'] as const;

function streakOf(row: StandingsRowRecord): StandingsLine['streak'] {
  const result = streakResults.find((r) => r === row.streakResult);
  return result === undefined || row.streakLength === null
    ? null
    : { result, length: row.streakLength };
}

function rulesOf(rules: unknown): Pick<Standings, 'rankBy' | 'tiebreakers'> {
  const parsed = SeasonRules.safeParse(rules);
  return parsed.success
    ? { rankBy: parsed.data.standings.rankBy, tiebreakers: [...parsed.data.tiebreakers] }
    : { rankBy: null, tiebreakers: [] };
}

/** What a row is ranked on, as a fraction to compare exactly: higher is better. */
type Measure = { readonly on: LevelGroup['on']; readonly n: number; readonly d: number };

function measureOf(row: StandingsRowRecord, rankBy: Standings['rankBy']): Measure {
  if (rankBy === 'points' || (rankBy === null && row.standingsPoints !== null)) {
    return { on: 'points', n: row.standingsPoints ?? 0, d: 1 };
  }
  // A tie is half a win; no games is 0 (the engine's own rule, order-teams.ts).
  const decided = row.wins + row.losses + row.ties;
  return decided === 0
    ? { on: 'win-percentage', n: 0, d: 1 }
    : { on: 'win-percentage', n: 2 * row.wins + row.ties, d: 2 * decided };
}

const sameMeasure = (a: Measure, b: Measure): boolean => a.on === b.on && a.n * b.d === b.n * a.d;

/**
 * The groups of two or more rows level on the table's measure, each in the table's order.
 * A group the engine never compared is left out: rows from different stored tables (a
 * removed division's rows fall into the table without a name, beside teams of no
 * division), or a row whose record alone placed it, have no reason to give about the others.
 */
function levelGroupsOf(
  rows: readonly StandingsRowRecord[],
  rankBy: Standings['rankBy'],
  gamesBetween: (a: string, b: string) => number,
): LevelGroup[] {
  const grouped = new Set<string>();
  const groups: LevelGroup[] = [];
  for (const row of rows) {
    if (grouped.has(row.teamId)) continue;
    const measure = measureOf(row, rankBy);
    const members = rows.filter((other) => sameMeasure(measureOf(other, rankBy), measure));
    for (const member of members) grouped.add(member.teamId);
    if (members.length < 2) continue;
    const compared = members.every(
      (member) => member.decidedBy !== null && member.divisionId === row.divisionId,
    );
    if (!compared) continue;
    const played = members.filter((member) => member.gamesPlayed > 0);
    const [first, second] = played;
    const byHeadToHead =
      played.length === 2 &&
      first?.decidedBy === 'head-to-head' &&
      second?.decidedBy === 'head-to-head';
    groups.push({
      teamIds: members.map((member) => member.teamId),
      notPlayed: members.filter((member) => member.gamesPlayed === 0).map((m) => m.teamId),
      on: measure.on,
      gamesBetween: byHeadToHead ? gamesBetween(first.teamId, second.teamId) : null,
    });
  }
  return groups;
}

/** How many of the season's decided games two teams played against each other. */
function meetingsIn(games: readonly DecidedGameRecord[]): (a: string, b: string) => number {
  return (a, b) =>
    games.filter(
      (game) =>
        (game.status === 'final' || game.status === 'forfeit') &&
        ((game.homeTeamId === a && game.awayTeamId === b) ||
          (game.homeTeamId === b && game.awayTeamId === a)),
    ).length;
}

/** True when head-to-head may have separated two level teams somewhere in the season. */
function needsMeetings(rows: readonly StandingsRowRecord[]): boolean {
  return rows.filter((row) => row.decidedBy === 'head-to-head').length >= 2;
}

/** An adjustment that changed nothing the table shows is not worth a footnote. */
function changesTable(a: StandingsAdjustmentWithReason, rankBy: Standings['rankBy']): boolean {
  const record = a.wins !== 0 || a.losses !== 0 || a.ties !== 0;
  return record || (a.points !== 0 && rankBy !== 'win-percentage');
}

function buildTable(
  division: SeasonDivisionRow | null,
  rows: readonly StandingsRowRecord[],
  teams: ReadonlyMap<string, SeasonTeamRow>,
  adjustments: readonly StandingsAdjustmentWithReason[],
  rankBy: Standings['rankBy'],
  gamesBetween: (a: string, b: string) => number,
): StandingsTable {
  const shown = rows
    .filter((row) => teams.has(row.teamId))
    .sort((a, b) => a.rank - b.rank || a.seed - b.seed || a.teamId.localeCompare(b.teamId));
  const footnotes: StandingsFootnote[] = [];
  const numbersOf = new Map<string, number[]>();
  for (const row of shown) {
    for (const adjustment of adjustments) {
      if (adjustment.teamId !== row.teamId || !changesTable(adjustment, rankBy)) continue;
      const number = footnotes.length + 1;
      footnotes.push({
        number,
        reason: adjustment.reason,
        wins: adjustment.wins,
        losses: adjustment.losses,
        ties: adjustment.ties,
        points: adjustment.points,
      });
      numbersOf.set(row.teamId, [...(numbersOf.get(row.teamId) ?? []), number]);
    }
  }
  const lines = shown.map((row): StandingsLine => {
    const team = teams.get(row.teamId);
    if (team === undefined) throw new Error('standings: a row without its team.');
    return {
      rank: row.rank,
      seed: row.seed,
      tied: shown.some((other) => other !== row && other.rank === row.rank),
      orderedBy: row.decidedBy ?? 'record',
      team: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        color: team.color,
        removed: team.removed,
      },
      gamesPlayed: row.gamesPlayed,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
      pointsFor: row.pointsFor,
      pointsAgainst: row.pointsAgainst,
      pointDifference: row.pointsFor - row.pointsAgainst,
      winPercentage: winPercentageOf(row.wins, row.losses, row.ties),
      points: row.standingsPoints,
      streak: streakOf(row),
      footnotes: numbersOf.get(row.teamId) ?? [],
    };
  });
  return {
    division:
      division === null ? null : { id: division.id, name: division.name, color: division.color },
    lines,
    footnotes,
    levelGroups: levelGroupsOf(shown, rankBy, gamesBetween),
  };
}

export async function readStandings(
  store: StandingsReadStore,
  input: { readonly seasonId: string },
): Promise<Result<Standings, ReadStandingsError>> {
  const season = await store.findSeason(input.seasonId);
  if (season === undefined) return fail({ code: 'season-not-found' });
  const [teamRows, divisionRows, rows, adjustments] = await Promise.all([
    store.teams(season.id),
    store.divisions(season.id),
    store.standingsRows(season.id),
    store.adjustments(season.id),
  ]);
  const { rankBy, tiebreakers } = rulesOf(season.rules);
  // The games between two level teams are read only when head-to-head separated some.
  const gamesBetween = needsMeetings(rows)
    ? meetingsIn(await store.decidedGames(season.id))
    : () => 0;
  const teams = new Map(teamRows.map((team) => [team.id, team]));
  const divisions = new Map(divisionRows.map((division) => [division.id, division]));
  // A table per division, in the divisions' order; teams in no (or a removed) division
  // share one table without a name, last.
  const tables: StandingsTable[] = [];
  for (const division of [...divisionRows].sort((a, b) => a.sort - b.sort)) {
    const table = buildTable(
      division,
      rows.filter((row) => row.divisionId === division.id),
      teams,
      adjustments,
      rankBy,
      gamesBetween,
    );
    if (table.lines.length > 0) tables.push(table);
  }
  const loose = rows.filter((row) => row.divisionId === null || !divisions.has(row.divisionId));
  const looseTable = buildTable(null, loose, teams, adjustments, rankBy, gamesBetween);
  if (looseTable.lines.length > 0) tables.push(looseTable);
  return ok({ seasonId: season.id, seasonName: season.name, rankBy, tiebreakers, tables });
}
