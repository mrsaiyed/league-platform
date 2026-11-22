// Step 2.236: a made-up league played from empty to its final tables through the
// product's own commands checks its own work, at 4 teams and at 12 teams in 2 divisions,
// with games postponed, cancelled, put back, forfeited and corrected and one in overtime;
// the same seed gives the same report. Faults planted in the database after the play, the
// standings then rebuilt by the product's own command, fail checks by name: one game's
// home and away scores swapped (final-scores, standings); the stored ranks of two teams a
// tiebreaker put in order swapped (standings); a cancelled game made final (final-scores,
// games-played, called-off, and standings by the rows' numbers).
// The 60-team run is its own command, `npm run simulate:large` (part 2).
import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyMigrations, pgliteDriver } from '../migrations/index.ts';
import { realNames, realNamesIn } from './real-names.test-helper.ts';
import {
  checkSimulatedLeague,
  reportLines,
  type SimulationReport,
} from './simulate-league-check.ts';
import { callOffKinds, planSimulation, type SimulationOptions } from './simulate-league-plan.ts';
import { rebuildSimulatedStandings, simulateLeagueInto } from './simulate-league.ts';

const repository = fileURLToPath(new URL('../../../../', import.meta.url));

async function play(options: SimulationOptions) {
  const pglite = new PGlite();
  const run = await applyMigrations(pgliteDriver(pglite));
  if (!run.ok) throw new Error(`migrations failed: ${run.error.code}`);
  const played = await simulateLeagueInto(pglite, options);
  const report = await checkSimulatedLeague(pglite, played);
  return { pglite, played, report, lines: reportLines(played, report) };
}

/** The report without its last line, the timings, which differ from run to run. */
const withoutTime = (lines: readonly string[]) => lines.slice(0, -1);

describe('the simulation plan', () => {
  it('is the same for the same seed, and names nothing real', () => {
    const options = { teams: 30, divisions: 3, rounds: 9, tracked: 3, seed: 7 };
    expect(planSimulation(options)).toEqual(planSimulation(options));
    expect(planSimulation({ ...options, seed: 8 })).not.toEqual(planSimulation(options));
    const plan = planSimulation({ ...options, teams: 140, divisions: 7 });
    const names = plan.divisions.flatMap((d) =>
      d.teams.flatMap((t) => [
        t.name,
        t.venue.name,
        t.venue.address,
        ...t.players.map((p) => `${p.firstName} ${p.lastName}`),
      ]),
    );
    expect(new Set(plan.divisions.flatMap((d) => d.teams.map((t) => t.shortName))).size).toBe(140);
    expect(realNamesIn(names.join('\n'), realNames(repository))).toBe(0);
  });

  it('plays no team twice on a day and keeps home and away within one game', () => {
    const plan = planSimulation({ teams: 12, divisions: 2, rounds: 10, tracked: 0, seed: 3 });
    for (const round of new Set(plan.games.map((g) => g.date))) {
      const day = plan.games.filter((g) => g.date === round).flatMap((g) => [g.home, g.away]);
      expect(new Set(day).size).toBe(day.length);
    }
    for (const team of plan.divisions.flatMap((d) => d.teams)) {
      const home = plan.games.filter((g) => g.home === team.name).length;
      const away = plan.games.filter((g) => g.away === team.name).length;
      expect(home + away).toBe(10);
      expect(Math.abs(home - away)).toBeLessThanOrEqual(1);
    }
    expect(plan.games.every((g) => g.homeScore !== g.awayScore)).toBe(true);
  });
});

describe('simulateLeagueInto', () => {
  it('plays 4 teams from empty to the final tables, and every check holds', async () => {
    const { pglite, lines, report } = await play({
      teams: 4,
      divisions: 1,
      rounds: 6,
      tracked: 2,
      seed: 7,
    });
    try {
      expect(report.checks.map((c) => [c.name, c.ok])).toEqual([
        ['final-scores', true],
        ['schedule', true],
        ['wins-equal-losses', true],
        ['points-balance', true],
        ['games-played', true],
        ['tracked-points', true],
        ['box-scores', true],
        ['player-totals', true],
        ['called-off', true],
        ['overtime', true],
        ['standings', true],
      ]);
      expect(report.passed).toBe(true);
      expect(lines[0]).toContain('12 games (2 tracked, 10 final scores)');
    } finally {
      await pglite.close();
    }
  }, 120_000);

  it('plays 12 teams in 2 divisions the same way twice, and faults planted afterwards fail checks by name', async () => {
    const options = { teams: 12, divisions: 2, rounds: 6, tracked: 4, seed: 7 };
    const first = await play(options);
    const second = await play(options);
    try {
      expect(first.report.passed).toBe(true);
      expect(first.report.tables).toHaveLength(2);
      expect(withoutTime(second.lines)).toEqual(withoutTime(first.lines));
      // The games a season loses: at least one of each kind, and one tracked game in overtime.
      const { games } = first.played.plan;
      for (const kind of callOffKinds) {
        expect(games.filter((g) => g.callOff?.kind === kind).length).toBeGreaterThanOrEqual(1);
      }
      expect(games.filter((g) => g.overtime && g.plays !== null)).toHaveLength(1);
      expect(first.report.checks.find((c) => c.name === 'overtime')?.detail).toContain(
        'the product counts 1',
      );

      // The planted faults go round the database's guard (a decided game's score changes
      // only with a reason), with the table's triggers off for these changes; then the
      // product's own command rebuilds the standings from the stored games, so the check
      // meets a table the product worked out from the fault, not a stale one.
      const failed = (report: SimulationReport) =>
        report.checks.filter((c) => !c.ok).map((c) => c.name);
      const ordinary = games.find((g) => g.plays === null && g.callOff === null)!;
      const swap = async () => {
        await first.pglite.exec('set session_replication_role = replica');
        await first.pglite.query(
          'update games set home_score = away_score, away_score = home_score where id = $1',
          [first.played.gameIds.get(ordinary.number)],
        );
        await first.pglite.exec('set session_replication_role = origin');
        await rebuildSimulatedStandings(first.pglite, first.played);
      };
      // First: one ordinary game's home and away scores swapped, the standings rebuilt.
      await swap();
      const swapped = await checkSimulatedLeague(first.pglite, first.played);
      expect(failed(swapped)).toEqual(expect.arrayContaining(['final-scores', 'standings']));
      expect(swapped.checks.find((c) => c.name === 'final-scores')?.detail).toContain(
        `game ${ordinary.number} (`,
      );
      expect(reportLines(first.played, swapped).at(-2)).toContain('final-scores');
      // Swapped back and rebuilt, every check holds again.
      await swap();
      expect((await checkSimulatedLeague(first.pglite, first.played)).passed).toBe(true);

      // Then: the stored ranks of two teams level on their record, but put in order by a
      // tiebreaker, swapped in the product's table.
      const { rows } = await first.pglite.query<{
        team_id: string;
        division_id: string;
        rank: number;
        wins: number;
        losses: number;
      }>(
        `select team_id, division_id, rank, wins, losses from standings_rows
         where league_id = $1 and season_id = $2 order by division_id, rank`,
        [first.played.leagueId, first.played.seasonId],
      );
      const k = rows.findIndex(
        (r, i) =>
          i > 0 &&
          rows[i - 1]!.division_id === r.division_id &&
          rows[i - 1]!.wins === r.wins &&
          rows[i - 1]!.losses === r.losses &&
          rows[i - 1]!.rank !== r.rank,
      );
      expect(k, 'two level teams a tiebreaker put in order').toBeGreaterThan(0);
      const [above, below] = [rows[k - 1]!, rows[k]!];
      await first.pglite.exec('set session_replication_role = replica');
      await first.pglite.query(
        `update standings_rows set rank = case team_id when $1 then $3::int else $4::int end
         where league_id = $5 and season_id = $6 and team_id in ($1, $2)`,
        [
          above.team_id,
          below.team_id,
          below.rank,
          above.rank,
          first.played.leagueId,
          first.played.seasonId,
        ],
      );
      await first.pglite.exec('set session_replication_role = origin');
      const reordered = await checkSimulatedLeague(first.pglite, first.played);
      expect(failed(reordered)).toEqual(['standings']);
      expect(reordered.checks.find((c) => c.name === 'standings')?.detail).toContain('place');

      // Second, on the other copy: one ordinary game moved in the stored rows to another round
      // and 7 days later. Only the schedule check is needed to catch it, by the game's teams.
      const moved = second.played.gameIds.get(ordinary.number);
      const otherRound = ordinary.round === 1 ? 2 : ordinary.round - 1;
      const move = async (days: number, round: number) => {
        await second.pglite.exec('set session_replication_role = replica');
        await second.pglite.query(
          `update games set starts_at = starts_at + make_interval(days => $2::int),
             round_id = (select id from rounds where league_id = games.league_id
                           and season_id = games.season_id and number = $3::int)
           where id = $1`,
          [moved, days, round],
        );
        await second.pglite.exec('set session_replication_role = origin');
      };
      await move(7, otherRound);
      const rescheduled = await checkSimulatedLeague(second.pglite, second.played);
      expect(failed(rescheduled)).toEqual(['schedule']);
      const detail = rescheduled.checks.find((c) => c.name === 'schedule')?.detail ?? '';
      expect(detail).toContain(`game ${ordinary.number} (${ordinary.home} v ${ordinary.away})`);
      expect(detail).toContain(`stored ${ordinary.home} v ${ordinary.away}, round ${otherRound}`);
      expect(detail).toContain(
        `planned ${ordinary.home} v ${ordinary.away}, round ${ordinary.round}, ${ordinary.date}`,
      );
      expect(detail).toContain('the public schedule shows');
      // Moved back, every check holds again.
      await move(-7, ordinary.round);
      expect((await checkSimulatedLeague(second.pglite, second.played)).passed).toBe(true);

      // Then: the cancelled game made final, as if it had been played.
      await second.pglite.exec('set session_replication_role = replica');
      await second.pglite.query(
        `update games set status = 'final', home_score = 50, away_score = 40, finalized_at = now(),
           format = (select format from games where id = $2)
         where id = $1`,
        [
          second.played.gameIds.get(games.find((g) => g.callOff?.kind === 'cancelled')!.number),
          second.played.gameIds.get(
            games.find((g) => g.plays === null && g.callOff === null)!.number,
          ),
        ],
      );
      await second.pglite.exec('set session_replication_role = origin');
      await rebuildSimulatedStandings(second.pglite, second.played);
      const counted = await checkSimulatedLeague(second.pglite, second.played);
      expect(failed(counted)).toEqual(
        expect.arrayContaining(['final-scores', 'games-played', 'called-off', 'standings']),
      );
      // The standings fail by the rows' numbers, not only by the games played.
      const cancelled = games.find((g) => g.callOff?.kind === 'cancelled')!;
      expect(counted.checks.find((c) => c.name === 'standings')?.detail).toContain(
        `${cancelled.home} shows`,
      );
    } finally {
      await first.pglite.close();
      await second.pglite.close();
    }
  }, 240_000);
});
