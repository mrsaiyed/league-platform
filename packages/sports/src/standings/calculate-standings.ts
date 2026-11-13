// Standings from final games and the season's rules (S-9, S-10, S-11; T3 §9): one
// table per division, each with rank, seed, record, points for and against,
// streak and which tiebreaker decided each place. Pure: the same games give the
// same tables whatever order they arrive in, so a rebuild equals the running total.
import { countGames } from './count-games.ts';
import { orderTeams } from './order-teams.ts';
import { teamRecord, type TeamRecord } from './team-records.ts';
import type {
  StandingsAdjustment,
  StandingsInput,
  StandingsProblem,
  StandingsResult,
  StandingsRow,
  StandingsTable,
  StandingsTeam,
} from './types.ts';

function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** No division first, then divisions by id. */
function byDivision(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return byId(a, b);
}

function byProblem(a: StandingsProblem, b: StandingsProblem): number {
  return byId(a.kind, b.kind) || byId(a.id, b.id) || byId(a.reason, b.reason);
}

/** Ids that appear more than once. */
function repeated<T>(items: readonly T[], id: (item: T) => string): Set<string> {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const item of items) {
    const key = id(item);
    if (seen.has(key)) twice.add(key);
    seen.add(key);
  }
  return twice;
}

function row(
  record: TeamRecord,
  divisionId: string | null,
): Omit<StandingsRow, 'rank' | 'seed' | 'decidedBy'> {
  const decided = record.wins + record.losses + record.ties;
  return {
    teamId: record.teamId,
    divisionId,
    gamesPlayed: record.gamesPlayed,
    wins: record.wins,
    losses: record.losses,
    ties: record.ties,
    pointsFor: record.pointsFor,
    pointsAgainst: record.pointsAgainst,
    pointDifference: record.pointsFor - record.pointsAgainst,
    winPercentage: decided > 0 ? (record.wins + record.ties / 2) / decided : 0,
    points: record.points,
    streak: record.streak,
    adjustments: record.adjustments,
  };
}

export function calculateStandings(input: StandingsInput): StandingsResult {
  const { rules } = input;
  const problems: StandingsProblem[] = [];

  // A team or adjustment listed twice cannot be trusted either way, and keeping one
  // copy would depend on the order they arrived in, so every copy is left out.
  const duplicatedTeams = repeated(input.teams, (team) => team.teamId);
  for (const teamId of duplicatedTeams) {
    problems.push({ kind: 'team', id: teamId, reason: 'duplicate-team-id', leftOut: true });
  }
  const teams: StandingsTeam[] = input.teams.filter((team) => !duplicatedTeams.has(team.teamId));
  const teamIds = new Set(teams.map((team) => team.teamId));

  const counted = countGames(input.games, { listed: teamIds, duplicated: duplicatedTeams }, rules);
  problems.push(...counted.problems);

  const allAdjustments = input.adjustments ?? [];
  const duplicatedAdjustments = repeated(allAdjustments, (a) => a.adjustmentId);
  for (const adjustmentId of duplicatedAdjustments) {
    problems.push({
      kind: 'adjustment',
      id: adjustmentId,
      reason: 'duplicate-adjustment-id',
      leftOut: true,
    });
  }
  const adjustments: StandingsAdjustment[] = [];
  for (const adjustment of allAdjustments) {
    if (duplicatedAdjustments.has(adjustment.adjustmentId)) continue;
    if (teamIds.has(adjustment.teamId)) adjustments.push(adjustment);
    else {
      problems.push({
        kind: 'adjustment',
        id: adjustment.adjustmentId,
        reason: 'unknown-team',
        leftOut: true,
      });
    }
  }

  const records = new Map<string, TeamRecord>();
  for (const teamId of teamIds) {
    const { record, problems: found } = teamRecord(teamId, counted.counted, adjustments, rules);
    records.set(teamId, record);
    problems.push(...found);
  }

  const divisions = new Map<string | null, string[]>();
  for (const team of teams) {
    const members = divisions.get(team.divisionId) ?? [];
    members.push(team.teamId);
    divisions.set(team.divisionId, members);
  }

  const context = { records, games: counted.counted, rules, coinFlips: input.coinFlips ?? [] };
  const tables: StandingsTable[] = [...divisions.keys()].sort(byDivision).map((divisionId) => {
    const rows: StandingsRow[] = [];
    let seed = 0;
    for (const place of orderTeams(divisions.get(divisionId) ?? [], context)) {
      const rank = seed + 1;
      for (const teamId of place.teamIds) {
        seed++;
        const record = records.get(teamId);
        if (!record) continue;
        rows.push({ ...row(record, divisionId), rank, seed, decidedBy: place.decidedBy });
      }
    }
    return { divisionId, rows };
  });

  return { tables, problems: problems.sort(byProblem) };
}
