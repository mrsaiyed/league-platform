// Development-only (T-195, T-201), step 2.236: the simulated league's check of its own
// work (simulate-league.ts), returned as data and printed as a short report. Its only source
// of truth is the plan: what the simulator meant to happen, worked out again with plain
// arithmetic in simulate-league-expected.ts (which imports nothing from the product's
// standings or statistics). It holds that against what the product says: its stored games
// and box scores, and what its own reads return (the standings, the season's statistics).
// - final-scores: every game's stored state and score is the plan's (played or corrected:
//   the planned score; forfeited: the season's forfeit score for the planned loser;
//   cancelled or waiting: no result), named game by game;
// - schedule: every planned game is stored once, between its planned home and away teams,
//   in its planned round, on its planned day and start time, in its planned division, and the
//   product's public read of the schedule shows it the same way; no stored game is unplanned;
// - wins-equal-losses, points-balance: the product's table agrees with itself (cheap, and
//   no proof on their own: a wrong score saved still balances);
// - games-played: every team has played the games the plan gave it, less those called off
//   or still waiting;
// - tracked-points: in every tracked game, the product's player lines add up to its score;
// - box-scores: in every tracked game, each player's points and fouls are the plan's plays;
// - player-totals: the season's statistics give each player the plan's games and points;
// - called-off: every called-off game ended as planned, the corrected one corrected once;
// - overtime: the product's overtime count on each tracked game is the plan's;
// - standings: each row's games, wins, losses, ties, points for and against (and points in
//   a points table) are the plan's, and so is the order, teams level on the table's measure
//   included (the season's tiebreakers as the spec words them); teams nothing separates may
//   come in either order, and are counted.
// Each failing check is named, and its detail names the games, players or teams it found wrong.
import type { PGlite } from '@electric-sql/pglite';
import { SeasonRules } from '@srleagues/contracts';
import { publicViewer, readNamePolicy, readStandings, readStatisticsTable } from '@srleagues/core';
import { createDatabase } from '../db/create-database.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { findLeagueAudience } from '../queries/find-league-audience.ts';
import { listPublicSchedule } from '../queries/list-public-schedule.ts';
import { listSettingValues } from '../queries/list-setting-values.ts';
import { gamesStore, liveGamesStore, standingsReadStore } from '../stores/index.ts';
import {
  expectedBoxScore,
  expectedGame,
  expectedPlace,
  expectedPlayerTotals,
  expectedTables,
} from './simulate-league-expected.ts';
import { callOffKinds, neverPlayed, type PlannedTeam } from './simulate-league-plan.ts';
import type { PlayedLeague } from './simulate-league.ts';

export type CheckName =
  | 'final-scores'
  | 'schedule'
  | 'wins-equal-losses'
  | 'points-balance'
  | 'games-played'
  | 'tracked-points'
  | 'box-scores'
  | 'player-totals'
  | 'called-off'
  | 'overtime'
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

/** The first few of a list of faults, and how many more. */
function listed(faults: readonly string[], most = 8): string {
  const shown = faults.slice(0, most).join('; ');
  return faults.length > most ? `${shown}; and ${faults.length - most} more` : shown;
}

const score = (home: number | null, away: number | null) =>
  home === null && away === null ? 'no result' : `${home}-${away}`;

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
    // The season's rules as the admin set them: an input of the working-out, like the plan.
    const rulesRow = await pglite.query<{ rules: unknown }>(
      'select rules from seasons where league_id = $1 and id = $2',
      [leagueId, seasonId],
    );
    const parsedRules = SeasonRules.safeParse(rulesRow.rows[0]?.rules);
    if (!parsedRules.success) throw new Error('The check could not read the season’s rules.');
    const rules = parsedRules.data;
    const { forfeit } = rules;
    const checks: Check[] = [];

    // Every game as the product stored it, against the plan, game by game.
    const { rows: stored } = await pglite.query<{
      id: string;
      status: string;
      home_team_id: string;
      home_score: number | null;
      away_score: number | null;
    }>(
      `select id, status, home_team_id, home_score, away_score from games
       where league_id = $1 and season_id = $2 and deleted_at is null`,
      [leagueId, seasonId],
    );
    const storedById = new Map(stored.map((row) => [row.id, row]));
    const scoreWrong: string[] = [];
    if (stored.length !== plan.games.length) {
      scoreWrong.push(`${stored.length} games stored, ${plan.games.length} planned`);
    }
    for (const game of plan.games) {
      const want = expectedGame(game, rules);
      const row = storedById.get(played.gameIds.get(game.number) ?? '');
      const named = `game ${game.number} (${game.home} v ${game.away}${game.callOff ? `, ${game.callOff.kind}` : ''})`;
      if (row === undefined) scoreWrong.push(`${named} is not stored`);
      else if (
        row.status !== want.status ||
        row.home_score !== want.home ||
        row.away_score !== want.away
      ) {
        scoreWrong.push(
          `${named}: stored ${row.status} ${score(row.home_score, row.away_score)}, planned ${want.status} ${score(want.home, want.away)}`,
        );
      }
    }
    checks.push({
      name: 'final-scores',
      ok: scoreWrong.length === 0,
      detail:
        scoreWrong.length === 0
          ? `all ${plan.games.length} games are stored as planned: state and score`
          : listed(scoreWrong),
    });

    // Every game's place on the schedule, against the plan: the stored row (its two teams,
    // round, day and start time in the league's time zone, division), then what the product's
    // public read of the schedule shows for it; and no stored game the plan does not have.
    const { rows: placedRows } = await pglite.query<{
      id: string;
      home: string | null;
      away: string | null;
      round: number | null;
      date: string | null;
      time: string | null;
      division: string | null;
    }>(
      `select g.id, h.name as home, a.name as away, r.number as round,
         to_char(g.starts_at at time zone $3, 'YYYY-MM-DD') as date,
         to_char(g.starts_at at time zone $3, 'HH24:MI') as time, d.name as division
       from games g
       left join teams h on h.league_id = g.league_id and h.id = g.home_team_id
       left join teams a on a.league_id = g.league_id and a.id = g.away_team_id
       left join rounds r on r.league_id = g.league_id and r.id = g.round_id
       left join divisions d on d.league_id = g.league_id and d.id = g.division_id
       where g.league_id = $1 and g.season_id = $2 and g.deleted_at is null`,
      [leagueId, seasonId, plan.timeZone],
    );
    const placedById = new Map(placedRows.map((row) => [row.id, row]));
    const publicSchedule = await read((scope) =>
      listPublicSchedule(scope, seasonId, plan.games[0]?.date ?? '1970-01-01'),
    );
    const shownById = new Map(
      [
        ...(publicSchedule?.rounds ?? []).flatMap((r) =>
          r.games.map((g) => ({ g, round: r.number as number | null })),
        ),
        ...(publicSchedule?.unplacedGames ?? []).map((g) => ({ g, round: null })),
      ].map((s) => [s.g.id, s]),
    );
    const placeWrong: string[] = [];
    const plannedIds = new Set<string>();
    const words = (p: {
      home: string | null;
      away: string | null;
      round: number | null;
      date: string | null;
      time?: string | null;
      division: string | null;
    }) =>
      `${p.home ?? 'no team'} v ${p.away ?? 'no team'}, ${p.round === null ? 'no round' : `round ${p.round}`}, ${p.date ?? 'no date'}${p.time === undefined ? '' : ` ${p.time ?? ''}`}, ${p.division ?? 'no division'}`;
    for (const game of plan.games) {
      const id = played.gameIds.get(game.number) ?? '';
      plannedIds.add(id);
      const want = expectedPlace(plan, game);
      const named = `game ${game.number} (${game.home} v ${game.away}${game.callOff ? `, ${game.callOff.kind}` : ''})`;
      const row = placedById.get(id);
      if (row === undefined) {
        placeWrong.push(`${named} is not stored`);
        continue;
      }
      if (
        row.home !== want.home ||
        row.away !== want.away ||
        row.round !== want.round ||
        row.date !== want.date ||
        row.time !== want.time ||
        row.division !== want.division
      ) {
        placeWrong.push(`${named}: stored ${words(row)}, planned ${words(want)}`);
      }
      const shown = shownById.get(id);
      const seen = shown && {
        home: shown.g.homeTeam.name,
        away: shown.g.awayTeam.name,
        round: shown.round,
        date: shown.g.localDate,
        division: shown.g.divisionName,
      };
      if (seen === undefined) placeWrong.push(`${named} is not on the public schedule`);
      else if (
        seen.home !== want.home ||
        seen.away !== want.away ||
        seen.round !== want.round ||
        seen.date !== want.date ||
        seen.division !== want.division
      ) {
        const plannedDay = {
          home: want.home,
          away: want.away,
          round: want.round,
          date: want.date,
          division: want.division,
        };
        placeWrong.push(
          `${named}: the public schedule shows ${words(seen)}, planned ${words(plannedDay)}`,
        );
      }
    }
    for (const row of placedRows) {
      if (!plannedIds.has(row.id)) placeWrong.push(`a game the plan does not have: ${words(row)}`);
    }
    checks.push({
      name: 'schedule',
      ok: placeWrong.length === 0,
      detail:
        placeWrong.length === 0
          ? `all ${plan.games.length} games stored and shown once, between the planned teams, in the planned round, day, start time and division`
          : listed(placeWrong),
    });

    const lines = tables.flatMap((t) => t.lines);
    const decided = plan.games.filter((g) => expectedGame(g, rules).home !== null).length;
    const wins = lines.reduce((s, l) => s + l.wins, 0);
    const losses = lines.reduce((s, l) => s + l.losses, 0);
    checks.push({
      name: 'wins-equal-losses',
      ok: wins === losses && wins === decided,
      detail: `${wins} wins, ${losses} losses, ${decided} games decided in the plan`,
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
    // Scheduled games less those called off or still waiting: a game postponed and put back,
    // cancelled and put back, forfeited or corrected is played; one waiting or cancelled is not.
    for (const g of plan.games) {
      if (neverPlayed(g.callOff)) continue;
      for (const team of [g.home, g.away]) scheduled.set(team, (scheduled.get(team) ?? 0) + 1);
    }
    const shortOf = lines.filter((l) => l.gamesPlayed !== (scheduled.get(l.team.name) ?? 0));
    const teamCount = plan.divisions.reduce((s, d) => s + d.teams.length, 0);
    checks.push({
      name: 'games-played',
      ok: shortOf.length === 0 && lines.length === teamCount,
      detail:
        shortOf.length === 0 && lines.length === teamCount
          ? `all ${teamCount} teams played every game scheduled for them, less those called off or waiting`
          : `${teamCount - lines.length} teams missing; wrong: ${shortOf
              .map((l) => `${l.team.name} ${l.gamesPlayed} of ${scheduled.get(l.team.name) ?? 0}`)
              .join(', ')}`,
    });

    // The players: a plan player is its team's roster place, found by its planned jersey.
    const teamsByName = new Map<string, PlannedTeam>(
      plan.divisions.flatMap((d) => d.teams.map((t): [string, PlannedTeam] => [t.name, t])),
    );
    const { rows: rosterRows } = await pglite.query<{
      team: string;
      jersey: string;
      person_id: string;
    }>(
      `select teams.name as team, roster_entries.jersey_number as jersey, roster_entries.person_id
       from roster_entries join teams on teams.id = roster_entries.team_id
       where teams.league_id = $1 and roster_entries.left_on is null`,
      [leagueId],
    );
    const personByJersey = new Map(rosterRows.map((r) => [`${r.team} ${r.jersey}`, r.person_id]));
    const jerseyOf = (team: string, place: number) =>
      teamsByName.get(team)?.players[place]?.jersey ?? '?';
    const personOf = (team: string, place: number) =>
      personByJersey.get(`${team} ${jerseyOf(team, place)}`);

    const trackedGames = plan.games.filter((g) => g.plays !== null);
    const wrongTracked: number[] = [];
    const lineWrong: string[] = [];
    let linesChecked = 0;
    for (const game of trackedGames) {
      const gameId = played.gameIds.get(game.number)!;
      const gameLines = await read((scope) => liveGamesStore(scope).lines(gameId));
      const row = storedById.get(gameId);
      // The product against itself: its player lines add up to its stored score.
      const sum = (home: boolean) =>
        gameLines
          .filter((l) => (l.teamId === row?.home_team_id) === home)
          .reduce((s, l) => s + (l.stats['points'] ?? 0), 0);
      if (
        row?.status !== 'final' ||
        sum(true) !== row.home_score ||
        sum(false) !== row.away_score
      ) {
        wrongTracked.push(game.number);
      }
      // Each player's line against the plan's plays.
      const want = expectedBoxScore(game);
      const seen = new Set<string>();
      for (const [key, line] of want) {
        const [side, place] = key.split(' ') as ['home' | 'away', string];
        const team = side === 'home' ? game.home : game.away;
        const person = personOf(team, Number(place));
        if (person !== undefined) seen.add(person);
        const got = gameLines.find((l) => l.personId === person);
        const points = got?.stats['points'] ?? 0;
        const fouls = got?.stats['fouls'] ?? 0;
        linesChecked += 1;
        if (got === undefined || points !== line.points || fouls !== line.fouls) {
          lineWrong.push(
            `game ${game.number}: ${team} #${jerseyOf(team, Number(place))} shows ${got === undefined ? 'no line' : `${points} points, ${fouls} fouls`}, the plays give ${line.points} points, ${line.fouls} fouls`,
          );
        }
      }
      const strangers = gameLines.filter((l) => !seen.has(l.personId)).length;
      if (strangers > 0) {
        lineWrong.push(
          `game ${game.number}: ${strangers} line(s) for players the plays never name`,
        );
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
    checks.push({
      name: 'box-scores',
      ok: lineWrong.length === 0,
      detail:
        lineWrong.length === 0
          ? `${linesChecked} player lines in ${trackedGames.length} tracked games: points and fouls as the plays give them`
          : listed(lineWrong),
    });

    // The season's statistics, as the product's own read gives them to the public.
    const statistics = await read(async (scope) =>
      readStatisticsTable(standingsReadStore(scope), {
        seasonId,
        viewing: {
          leagueId,
          viewer: publicViewer(leagueId),
          audience: await findLeagueAudience(scope),
          policy: await readNamePolicy({
            settingRows: (key, places) => listSettingValues(scope, key, places),
          }),
        },
      }),
    );
    if (!statistics.ok) throw new Error(`The check found no statistics: ${statistics.error.code}`);
    const statsOf = new Map(statistics.value.players.map((p) => [p.personId, p]));
    const totalsWrong: string[] = [];
    const totals = expectedPlayerTotals(plan);
    const planned = new Set<string>();
    for (const want of totals.values()) {
      const person = personOf(want.team, want.place);
      if (person !== undefined) planned.add(person);
      const got = person === undefined ? undefined : statsOf.get(person);
      const games = got?.gamesPlayed ?? 0;
      const points = got?.stats['points']?.total ?? 0;
      if (games !== want.games || points !== want.points) {
        totalsWrong.push(
          `${want.team} #${jerseyOf(want.team, want.place)}: ${games} games, ${points} points; the plan: ${want.games}, ${want.points}`,
        );
      }
    }
    for (const other of statistics.value.players) {
      if (!planned.has(other.personId) && (other.stats['points']?.total ?? 0) > 0) {
        totalsWrong.push(
          `a player who scored in no tracked game has ${other.stats['points']?.total} points`,
        );
      }
    }
    checks.push({
      name: 'player-totals',
      ok: totalsWrong.length === 0,
      detail:
        totalsWrong.length === 0
          ? `${totals.size} players: games and points in the season's statistics as the plan's tracked games give them`
          : listed(totalsWrong),
    });

    // Each game called off ended as the plan says, read back from the product's games.
    const offGames = plan.games.filter((g) => g.callOff !== null);
    const offWrong: string[] = [];
    for (const game of offGames) {
      const gameId = played.gameIds.get(game.number)!;
      const found = await read((scope) => gamesStore(scope).find(gameId));
      const corrections = await pglite.query<{ n: number }>(
        'select count(*)::int as n from game_corrections where league_id = $1 and game_id = $2',
        [leagueId, gameId],
      );
      const kind = game.callOff!.kind;
      const want =
        kind === 'postponed-waiting'
          ? found?.status === 'postponed'
          : kind === 'cancelled'
            ? found?.status === 'cancelled'
            : kind === 'forfeit'
              ? found?.status === 'forfeit' &&
                Math.max(found.homeScore ?? -1, found.awayScore ?? -1) === forfeit.winnerScore &&
                Math.min(found.homeScore ?? -1, found.awayScore ?? -1) === forfeit.loserScore
              : found?.status === 'final' &&
                found.homeScore === game.homeScore &&
                found.awayScore === game.awayScore &&
                (corrections.rows[0]?.n ?? 0) === (kind === 'corrected' ? 1 : 0);
      if (!want) {
        offWrong.push(
          `game ${game.number} (${kind}) is ${found?.status} ${found?.homeScore}-${found?.awayScore}, ${corrections.rows[0]?.n} correction(s)`,
        );
      }
    }
    const offCount = (kind: string) => offGames.filter((g) => g.callOff!.kind === kind).length;
    checks.push({
      name: 'called-off',
      ok: offWrong.length === 0,
      detail:
        offWrong.length === 0
          ? `${offGames.length} games: ${callOffKinds.map((k) => `${offCount(k)} ${k}`).join(', ')}; each as planned (forfeits ${forfeit.winnerScore}-${forfeit.loserScore}, points ${forfeit.countsInPointDifference ? 'counted' : 'not counted'}; the corrected game once, at its corrected score)`
          : offWrong.join('; '),
    });

    // Overtime, as the product counts it on each tracked game when the tracker ends it.
    const overtimeWrong: number[] = [];
    let overtimeCounted = 0;
    for (const game of trackedGames) {
      const gameId = played.gameIds.get(game.number)!;
      const found = await read((scope) => gamesStore(scope).find(gameId));
      const periods = found?.overtimePeriods ?? null;
      if (periods !== null && periods > 0) overtimeCounted += 1;
      if (periods !== (game.overtime ? 1 : 0)) overtimeWrong.push(game.number);
    }
    const overtimePlanned = trackedGames.filter((g) => g.overtime).length;
    checks.push({
      name: 'overtime',
      ok: overtimeWrong.length === 0,
      detail:
        overtimeWrong.length === 0
          ? `${overtimePlanned} tracked game(s) went to overtime; the product counts ${overtimeCounted}`
          : `the product's overtime count is wrong in game ${overtimeWrong.join(', ')}`,
    });

    // The standings, row by row and place by place, against the plan's working-out.
    const expected = expectedTables(plan, rules);
    const tableOf = new Map(
      expected.flatMap((t) => [...t.rows.keys()].map((team): [string, typeof t] => [team, t])),
    );
    const wrong: string[] = [];
    if (tables.length !== plan.divisions.length) {
      wrong.push(`${tables.length} tables shown, ${plan.divisions.length} divisions planned`);
    }
    const byPoints = rules.standings.rankBy === 'points';
    const place = (teams: readonly string[]) => [...teams].sort().join(' = ');
    for (const table of tables) {
      const want = tableOf.get(table.lines[0]?.team.name ?? '');
      const division = table.division?.name ?? 'No division';
      if (want === undefined) {
        wrong.push(`${division}: a table of no planned division`);
        continue;
      }
      for (const line of table.lines) {
        const w = want.rows.get(line.team.name);
        if (w === undefined) {
          wrong.push(`${division}: ${line.team.name} is in no planned place here`);
          continue;
        }
        const shown = `${line.gamesPlayed} GP ${line.wins}-${line.losses}-${line.ties} ${line.pointsFor}-${line.pointsAgainst}${byPoints ? ` ${line.points} pts` : ''}`;
        const worked = `${w.gamesPlayed} GP ${w.wins}-${w.losses}-${w.ties} ${w.pointsFor}-${w.pointsAgainst}${byPoints ? ` ${w.points} pts` : ''}`;
        if (shown !== worked)
          wrong.push(`${line.team.name} shows ${shown}, the plan gives ${worked}`);
      }
      if (table.lines.length !== want.rows.size) {
        wrong.push(`${division}: ${table.lines.length} teams shown, ${want.rows.size} planned`);
      }
      // The places: teams sharing a rank are one place, in any order among themselves.
      const shownPlaces: string[][] = [];
      table.lines.forEach((line, k) => {
        if (k > 0 && table.lines[k - 1]!.rank === line.rank)
          shownPlaces.at(-1)!.push(line.team.name);
        else shownPlaces.push([line.team.name]);
      });
      const firstOff = want.places.findIndex(
        (p, k) => shownPlaces[k] === undefined || place(shownPlaces[k]) !== place(p),
      );
      if (firstOff !== -1 || shownPlaces.length !== want.places.length) {
        const k = firstOff === -1 ? want.places.length : firstOff;
        wrong.push(
          `${division}, place ${k + 1}: shown ${shownPlaces[k] ? place(shownPlaces[k]) : 'nobody'}, the plan and the tiebreakers give ${want.places[k] ? place(want.places[k]) : 'nobody'}`,
        );
      }
    }
    const ordered = expected.reduce((s, t) => s + t.ordered, 0);
    const unseparated = expected.reduce((s, t) => s + t.unseparated, 0);
    checks.push({
      name: 'standings',
      ok: wrong.length === 0,
      detail:
        wrong.length === 0
          ? `every row (games, wins, losses, ties, points for and against${byPoints ? ', points' : ''}) and every place as the plan gives them; ${ordered} level group(s) put in order by the tiebreakers (${rules.tiebreakers.join(', ')}), ${unseparated} group(s) nothing separates`
          : listed(wrong),
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
    `Called off or changed: ${games.filter((g) => g.callOff !== null).length} games (${games.filter((g) => neverPlayed(g.callOff)).length} never played); overtime: ${games.filter((g) => g.overtime).length} tracked game(s)`,
    'Checks (wins-equal-losses and points-balance only that the product’s table agrees with itself; every other one against the plan, worked out again without the product’s standings or statistics):',
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
  const { moves } = played;
  // One last line for everything that differs from run to run (the tests leave it out).
  out.push(
    `Time: ${report.timings.map((t) => `${t.part} ${t.seconds.toFixed(1)} s`).join(', ')}; total ${report.timings
      .reduce((s, t) => s + t.seconds, 0)
      .toFixed(
        1,
      )} s. Putting games in rounds took ${moves.count} schedule-draft commands: ${moves.firstMs} ms each in the first tenth, ${moves.lastMs} ms each in the last.`,
  );
  return out;
}
