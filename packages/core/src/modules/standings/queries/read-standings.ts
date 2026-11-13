// The standings page's data (P7 §6, S-9, S-10): one table per division with seeds,
// the adjustments as footnotes with their reasons, and why tied teams are ordered.
// Standings are never restricted (S-22), so this takes no viewer. Built field by field
// (T-29): no account, no contact field.
import { SeasonRules } from '@srleagues/contracts';
import { fail, ok, type Result } from '../../../command/index.ts';
import type {
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

export type StandingsTable = {
  /** Null for a season without divisions. */
  readonly division: {
    readonly id: string;
    readonly name: string;
    readonly color: string | null;
  } | null;
  readonly lines: readonly StandingsLine[];
  readonly footnotes: readonly StandingsFootnote[];
};

export type Standings = {
  readonly seasonId: string;
  readonly seasonName: string;
  readonly rankBy: 'win-percentage' | 'points' | null;
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

function rankByOf(rules: unknown): Standings['rankBy'] {
  const parsed = SeasonRules.safeParse(rules);
  return parsed.success ? parsed.data.standings.rankBy : null;
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
      team: { id: team.id, name: team.name, slug: team.slug, color: team.color },
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
  const rankBy = rankByOf(season.rules);
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
    );
    if (table.lines.length > 0) tables.push(table);
  }
  const loose = rows.filter((row) => row.divisionId === null || !divisions.has(row.divisionId));
  const looseTable = buildTable(null, loose, teams, adjustments, rankBy);
  if (looseTable.lines.length > 0) tables.push(looseTable);
  return ok({ seasonId: season.id, seasonName: season.name, rankBy, tables });
}
