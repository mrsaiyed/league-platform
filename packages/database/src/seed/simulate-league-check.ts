// Development-only (T-195, T-201), step 2.236: the simulated league's check of its own
// work (simulate-league.ts), returned as data and printed as a short report. It reads the
// league back from the database, the standings through the product's own read, and holds
// them against a second, simple working-out written only for this check:
// - wins-equal-losses: across the league, as many wins as losses;
// - points-balance: in each division, points for equal points against;
// - games-played: every team has played the games its schedule gave it;
// - tracked-points: in every tracked game, its players' points add up to its final score;
// - standings: each team's wins, losses, points for and against as the product shows them
//   equal those worked out again from the games' results, and the order by win percentage
//   agrees; teams level on win percentage are said to be level, their tiebreak not judged.
// Each failing check is named, and its detail names the teams it found wrong.
import type { PGlite } from '@electric-sql/pglite';
import { readStandings } from '@srleagues/core';
import { createDatabase } from '../db/create-database.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { liveGamesStore, standingsReadStore } from '../stores/index.ts';
import type { PlayedLeague } from './simulate-league.ts';

export type CheckName =
  | 'wins-equal-losses'
  | 'points-balance'
  | 'games-played'
  | 'tracked-points'
  | 'standings';

export type Check = { readonly name: CheckName; readonly ok: boolean; readonly detail: string };

export type TableLine = {
  readonly team: string;
  readonly played: number;
  readonly wins: number;
  readonly losses: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
};

export type SimulationReport = {
  readonly checks: readonly Check[];
  readonly tables: readonly { readonly division: string; readonly lines: readonly TableLine[] }[];
  readonly timings: readonly { readonly part: string; readonly seconds: number }[];
  readonly passed: boolean;
};

type TeamRecord = { wins: number; losses: number; pointsFor: number; pointsAgainst: number };

/** a/b against c/d, a team with no games counted as 0. Positive when the first is higher. */
function comparePercentages(a: TeamRecord, b: TeamRecord): number {
  const ga = a.wins + a.losses;
  const gb = b.wins + b.losses;
  if (ga === 0 || gb === 0) return (ga === 0 ? 0 : a.wins / ga) - (gb === 0 ? 0 : b.wins / gb);
  return a.wins * gb - b.wins * ga;
}

/** Checks the played league (above). */
export async function checkSimulatedLeague(
  pglite: PGlite,
  played: PlayedLeague,
): Promise<SimulationReport> {
  const started = performance.now();
  const { plan, leagueId, seasonId } = played;
  const db = createDatabase({ kind: 'pglite', pglite });
  try {
    const read = <T>(work: (scope: LeagueScope) => Promise<T>) =>
      withTransaction(db, { leagueId }, work);
    const standings = await read((scope) => readStandings(standingsReadStore(scope), { seasonId }));
    if (!standings.ok) throw new Error(`The check found no standings: ${standings.error.code}`);
    const tables = standings.value.tables;

    // The second working-out: from the games' results alone.
    const { rows: games } = await pglite.query<{
      home_team_id: string;
      away_team_id: string;
      home_score: number;
      away_score: number;
    }>(
      `select home_team_id, away_team_id, home_score, away_score from games
       where league_id = $1 and season_id = $2 and status = 'final' and deleted_at is null`,
      [leagueId, seasonId],
    );
    const worked = new Map<string, TeamRecord>();
    const of = (id: string) => {
      const found = worked.get(id) ?? { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
      worked.set(id, found);
      return found;
    };
    for (const g of games) {
      const home = of(g.home_team_id);
      const away = of(g.away_team_id);
      home.pointsFor += g.home_score;
      home.pointsAgainst += g.away_score;
      away.pointsFor += g.away_score;
      away.pointsAgainst += g.home_score;
      const winner = g.home_score > g.away_score ? home : away;
      const loser = winner === home ? away : home;
      winner.wins += 1;
      loser.losses += 1;
    }

    const lines = tables.flatMap((t) => t.lines);
    const checks: Check[] = [];
    const wins = lines.reduce((s, l) => s + l.wins, 0);
    const losses = lines.reduce((s, l) => s + l.losses, 0);
    checks.push({
      name: 'wins-equal-losses',
      ok: wins === losses && wins === games.length,
      detail: `${wins} wins, ${losses} losses, ${games.length} games final`,
    });

    const balance = tables.map((t) => {
      const pf = t.lines.reduce((s, l) => s + l.pointsFor, 0);
      const pa = t.lines.reduce((s, l) => s + l.pointsAgainst, 0);
      return { name: t.division?.name ?? 'No division', pf, pa };
    });
    checks.push({
      name: 'points-balance',
      ok: balance.every((b) => b.pf === b.pa),
      detail: balance.map((b) => `${b.name} ${b.pf} for, ${b.pa} against`).join('; '),
    });

    const scheduled = new Map<string, number>();
    for (const g of plan.games) {
      for (const team of [g.home, g.away]) scheduled.set(team, (scheduled.get(team) ?? 0) + 1);
    }
    const shortOf = lines.filter((l) => l.gamesPlayed !== (scheduled.get(l.team.name) ?? 0));
    const teamCount = plan.divisions.reduce((s, d) => s + d.teams.length, 0);
    checks.push({
      name: 'games-played',
      ok: shortOf.length === 0 && lines.length === teamCount,
      detail:
        shortOf.length === 0 && lines.length === teamCount
          ? `all ${teamCount} teams played every game scheduled for them`
          : `${teamCount - lines.length} teams missing; wrong: ${shortOf
              .map((l) => `${l.team.name} ${l.gamesPlayed} of ${scheduled.get(l.team.name) ?? 0}`)
              .join(', ')}`,
    });

    const trackedGames = plan.games.filter((g) => g.plays !== null);
    const wrongTracked: number[] = [];
    for (const game of trackedGames) {
      const gameId = played.gameIds.get(game.number)!;
      const [gameLines, final] = await Promise.all([
        read((scope) => liveGamesStore(scope).lines(gameId)),
        pglite.query<{ home: number; away: number; home_team_id: string; status: string }>(
          `select home_score as home, away_score as away, home_team_id, status from games
           where league_id = $1 and id = $2`,
          [leagueId, gameId],
        ),
      ]);
      const row = final.rows[0];
      const sum = (home: boolean) =>
        gameLines
          .filter((l) => (l.teamId === row?.home_team_id) === home)
          .reduce((s, l) => s + (l.stats['points'] ?? 0), 0);
      if (row?.status !== 'final' || sum(true) !== row.home || sum(false) !== row.away) {
        wrongTracked.push(game.number);
      }
    }
    checks.push({
      name: 'tracked-points',
      ok: wrongTracked.length === 0,
      detail:
        wrongTracked.length === 0
          ? `${trackedGames.length} tracked games: players' points add up to every final score`
          : `players' points do not add up in game ${wrongTracked.join(', ')}`,
    });

    const wrong: string[] = [];
    const level: string[] = [];
    for (const table of tables) {
      for (const line of table.lines) {
        const w = worked.get(line.team.id) ?? {
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
        };
        if (
          w.wins !== line.wins ||
          w.losses !== line.losses ||
          w.pointsFor !== line.pointsFor ||
          w.pointsAgainst !== line.pointsAgainst
        ) {
          wrong.push(
            `${line.team.name} shows ${line.wins}-${line.losses} ${line.pointsFor}-${line.pointsAgainst}, worked out ${w.wins}-${w.losses} ${w.pointsFor}-${w.pointsAgainst}`,
          );
        }
      }
      const recs = table.lines.map((l) => ({
        name: l.team.name,
        rec: worked.get(l.team.id) ?? { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 },
      }));
      for (let k = 1; k < recs.length; k += 1) {
        const order = comparePercentages(recs[k - 1]!.rec, recs[k]!.rec);
        if (order < 0) wrong.push(`${recs[k]!.name} is shown below ${recs[k - 1]!.name}`);
        if (order === 0) level.push(`${recs[k - 1]!.name} and ${recs[k]!.name}`);
      }
    }
    checks.push({
      name: 'standings',
      ok: wrong.length === 0,
      detail:
        wrong.length === 0
          ? `every team's record and the order by win percentage agree with the results${
              level.length > 0 ? `; level: ${level.join('; ')}` : ''
            }`
          : wrong.join('; '),
    });

    return {
      checks,
      tables: tables.map((t) => ({
        division: t.division?.name ?? 'No division',
        lines: t.lines.map((l) => ({
          team: l.team.name,
          played: l.gamesPlayed,
          wins: l.wins,
          losses: l.losses,
          pointsFor: l.pointsFor,
          pointsAgainst: l.pointsAgainst,
        })),
      })),
      timings: [
        ...played.timings,
        { part: 'checks', seconds: Math.round(performance.now() - started) / 1000 },
      ],
      passed: checks.every((c) => c.ok),
    };
  } finally {
    await db.close();
  }
}

/** The report as lines of text: the league, the checks, the tables, then how long it took. */
export function reportLines(played: PlayedLeague, report: SimulationReport): string[] {
  const { options, games } = played.plan;
  const tracked = games.filter((g) => g.plays !== null).length;
  const teams = played.plan.divisions.reduce((s, d) => s + d.teams.length, 0);
  const out = [
    `Simulated league: ${teams} teams in ${options.divisions} division(s), ${options.rounds} rounds, ${games.length} games (${tracked} tracked, ${games.length - tracked} final scores), seed ${options.seed}`,
    'Schedule: brought in through the fixture import, put in rounds in the draft, published',
    'Checks:',
    ...report.checks.map((c) => `  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}`),
    'Final tables:',
  ];
  for (const table of report.tables) {
    out.push(`  ${table.division}`);
    for (const [k, l] of table.lines.entries()) {
      out.push(
        `    ${String(k + 1).padStart(2)}. ${l.team.padEnd(28)} ${l.wins}-${l.losses}  ${l.pointsFor}-${l.pointsAgainst}`,
      );
    }
  }
  const failed = report.checks.filter((c) => !c.ok).map((c) => c.name);
  out.push(
    failed.length === 0
      ? `All ${report.checks.length} checks hold.`
      : `${failed.length} check(s) failed: ${failed.join(', ')}`,
  );
  out.push(
    `Time: ${report.timings.map((t) => `${t.part} ${t.seconds.toFixed(1)} s`).join(', ')}; total ${report.timings
      .reduce((s, t) => s + t.seconds, 0)
      .toFixed(1)} s`,
  );
  return out;
}
