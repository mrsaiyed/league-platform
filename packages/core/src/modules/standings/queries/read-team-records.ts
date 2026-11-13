// Each team's record and seed (P7 §6; step 2.44's team list and team pages). A team
// with no standings row yet has a record of nothing and no seed. Never restricted (S-22).
import { fail, ok, type Result } from '../../../command/index.ts';
import type { StandingsReadStore, StandingsRowRecord } from '../read-ports.ts';
import { winPercentageOf } from './read-standings.ts';

export type TeamStanding = {
  readonly team: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly color: string | null;
    readonly divisionId: string | null;
  };
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  readonly winPercentage: number;
  /** Place and seed in the team's division's table; null before the table has the team. */
  readonly rank: number | null;
  readonly seed: number | null;
};

export type ReadTeamRecordsError = { readonly code: 'season-not-found' };

function recordOf(team: TeamStanding['team'], row: StandingsRowRecord | undefined): TeamStanding {
  return {
    team,
    gamesPlayed: row?.gamesPlayed ?? 0,
    wins: row?.wins ?? 0,
    losses: row?.losses ?? 0,
    ties: row?.ties ?? 0,
    pointsFor: row?.pointsFor ?? 0,
    pointsAgainst: row?.pointsAgainst ?? 0,
    winPercentage: row === undefined ? 0 : winPercentageOf(row.wins, row.losses, row.ties),
    rank: row?.rank ?? null,
    seed: row?.seed ?? null,
  };
}

/** Every team of the season, by division order then place, teams without a place last by name. */
export async function readTeamRecords(
  store: StandingsReadStore,
  input: { readonly seasonId: string },
): Promise<Result<readonly TeamStanding[], ReadTeamRecordsError>> {
  const season = await store.findSeason(input.seasonId);
  if (season === undefined) return fail({ code: 'season-not-found' });
  const [teams, divisions, rows] = await Promise.all([
    store.teams(season.id),
    store.divisions(season.id),
    store.standingsRows(season.id),
  ]);
  const byTeam = new Map(rows.map((row) => [row.teamId, row]));
  const divisionOrder = new Map(divisions.map((d, i) => [d.id, [d.sort, i] as const]));
  const records = teams.map((team) =>
    recordOf(
      {
        id: team.id,
        name: team.name,
        slug: team.slug,
        color: team.color,
        divisionId: team.divisionId,
      },
      byTeam.get(team.id),
    ),
  );
  const divisionKey = (r: TeamStanding) =>
    r.team.divisionId === null
      ? [Number.MAX_SAFE_INTEGER, 0]
      : (divisionOrder.get(r.team.divisionId) ?? [Number.MAX_SAFE_INTEGER, 0]);
  records.sort(
    (a, b) =>
      (divisionKey(a)[0] ?? 0) - (divisionKey(b)[0] ?? 0) ||
      (divisionKey(a)[1] ?? 0) - (divisionKey(b)[1] ?? 0) ||
      (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
      (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER) ||
      a.team.name.localeCompare(b.team.name) ||
      a.team.id.localeCompare(b.team.id),
  );
  return ok(records);
}

export type ReadTeamRecordError = { readonly code: 'season-not-found' | 'team-not-found' };

/** One team's record and seed. */
export async function readTeamRecord(
  store: StandingsReadStore,
  input: { readonly seasonId: string; readonly teamId: string },
): Promise<Result<TeamStanding, ReadTeamRecordError>> {
  const all = await readTeamRecords(store, { seasonId: input.seasonId });
  if (!all.ok) return all;
  const found = all.value.find((record) => record.team.id === input.teamId);
  return found === undefined ? fail({ code: 'team-not-found' }) : ok(found);
}
