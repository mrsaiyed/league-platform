// Step 2.236, part 1: a made-up league played from empty to its final tables through the
// product's own commands checks its own work, at 4 teams and at 12 teams in 2 divisions;
// the same seed gives the same report; and a result changed straight in the database after
// the play makes the standings check fail by name. The 60-team run is part 2.
import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyMigrations, pgliteDriver } from '../migrations/index.ts';
import { realNames, realNamesIn } from './real-names.test-helper.ts';
import { checkSimulatedLeague, reportLines } from './simulate-league-check.ts';
import { planSimulation, type SimulationOptions } from './simulate-league-plan.ts';
import { simulateLeagueInto } from './simulate-league.ts';

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
        ['wins-equal-losses', true],
        ['points-balance', true],
        ['games-played', true],
        ['tracked-points', true],
        ['standings', true],
      ]);
      expect(report.passed).toBe(true);
      expect(lines[0]).toContain('12 games (2 tracked, 10 final scores)');
    } finally {
      await pglite.close();
    }
  }, 120_000);

  it('plays 12 teams in 2 divisions the same way twice, and a changed result fails the standings check', async () => {
    const options = { teams: 12, divisions: 2, rounds: 6, tracked: 4, seed: 7 };
    const first = await play(options);
    const second = await play(options);
    try {
      expect(first.report.passed).toBe(true);
      expect(first.report.tables).toHaveLength(2);
      expect(withoutTime(second.lines)).toEqual(withoutTime(first.lines));

      // The planted fault: one final score changed straight in the database, after the play.
      // The database refuses that for a decided game (a correction needs a reason), so the
      // fault goes round its guard, with the table's triggers off for this one change.
      const gameId = first.played.gameIds.get(
        first.played.plan.games.find((g) => g.plays === null)!.number,
      )!;
      await first.pglite.exec('set session_replication_role = replica');
      await first.pglite.query('update games set home_score = home_score + 40 where id = $1', [
        gameId,
      ]);
      await first.pglite.exec('set session_replication_role = origin');
      const after = await checkSimulatedLeague(first.pglite, first.played);
      expect(after.passed).toBe(false);
      expect(after.checks.filter((c) => !c.ok).map((c) => c.name)).toContain('standings');
      expect(reportLines(first.played, after).at(-2)).toContain('standings');
    } finally {
      await first.pglite.close();
      await second.pglite.close();
    }
  }, 240_000);
});
