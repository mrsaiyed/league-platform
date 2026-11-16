// Development-only (T-195, T-201): puts each seed league's season under way, so the web
// app run locally on the made-up database (record 055, step 2.93) has a public schedule,
// results and standings to show. Made-up data only: it takes a PGlite, never an address.
//
// For every seed league, through the product's own commands as its owner, each in its
// own scoped transaction: the current season is opened (made active); the league's
// people are put on the rosters of the teams that played, one after another, each with a
// number; in each division the first two teams played a week ago and the second and
// third play a week from now, published as the season's schedule; and each game played
// is recorded from its box score sheet, a line for every player on the two teams, so the
// season has statistics as well as results (step 2.93 part 3). The standings and the
// players' season totals are rebuilt by the standings module's own event handler, as for
// any result. A season one game old has no player with the starting minimum of 3 games
// for the leaders (P7 §6), so each seed league saves 1, as its admin may on League
// settings. The same for every league: no league is named here, and the dates follow
// the league's own today.
import type { PGlite } from '@electric-sql/pglite';
import {
  addDraftGame,
  addToRoster,
  dayIn,
  eventHandlers,
  getScheduleDraft,
  minimumGamesToRank,
  publishSchedule,
  setBoxScore,
  setSetting,
  updateSeason,
  type BoxScoreLineInput,
  type CommandContext,
  type CommandDeps,
  type GamesTx,
  type LeaguesTx,
  type SchedulingTx,
  type StandingsTx,
  type TeamsTx,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  accessStore,
  activityLogStore,
  divisionsStore,
  gamesStore,
  jobsStore,
  leaguesStore,
  schedulingStore,
  standingsStore,
  teamsStore,
} from '../stores/index.ts';

type SeasonTx = LeaguesTx & SchedulingTx & GamesTx & StandingsTx & TeamsTx;

/** How long ago the played games were, and how far ahead the next ones are: days. */
const playedDaysAgo = 7;
const nextInDays = 7;
/** The local time every seeded game starts at. */
const startTime = '18:00';

/** yyyy-mm-dd, `days` days on from `day` (or back, when negative). */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function must<T>(what: string, result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`Seeding failed at ${what}: ${JSON.stringify(result.error)}`);
  return result.value;
}

type LeagueRow = {
  id: string;
  owner_account_id: string;
  time_zone: string;
  season_id: string;
  season_version: number;
};

/** A game to schedule: its teams, its day, and the final score of one already played. */
type Planned = {
  readonly gameId: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly date: string;
  readonly score: { readonly home: number; readonly away: number } | null;
};

/** Each division's games: its first two teams a week ago, its second and third a week on. */
async function plannedGames(pglite: PGlite, league: LeagueRow, today: string): Promise<Planned[]> {
  const { rows } = await pglite.query<{ id: string; division_id: string | null }>(
    `select teams.id, teams.division_id
     from teams left join divisions on divisions.id = teams.division_id
     where teams.league_id = $1 and teams.season_id = $2 and teams.deleted_at is null
     order by divisions.sort nulls last, teams.id`,
    [league.id, league.season_id],
  );
  const byDivision = new Map<string, string[]>();
  for (const row of rows) {
    const key = row.division_id ?? '';
    byDivision.set(key, [...(byDivision.get(key) ?? []), row.id]);
  }
  const planned: Planned[] = [];
  let n = 0;
  for (const teams of byDivision.values()) {
    const [first, second, third] = teams;
    if (first === undefined || second === undefined) continue;
    planned.push({
      gameId: randomUUID(),
      homeTeamId: first,
      awayTeamId: second,
      date: addDays(today, -playedDaysAgo),
      score: { home: 52 + n * 3, away: 47 + n * 5 },
    });
    if (third !== undefined) {
      planned.push({
        gameId: randomUUID(),
        homeTeamId: second,
        awayTeamId: third,
        date: addDays(today, nextInDays),
        score: null,
      });
    }
    n += 1;
  }
  return planned;
}

/** A player put on a team, by their place in the league's list (0 first). */
type Rostered = { readonly personId: string; readonly teamId: string; readonly place: number };

/**
 * The league's people, in the order they were added (their ids sort so), each put on the
 * next team that played a week ago, round and round, with the number 4 and on.
 */
async function putPeopleOnTeams(
  pglite: PGlite,
  as: CommandContext,
  games: readonly Planned[],
  deps: CommandDeps<SeasonTx>,
): Promise<Rostered[]> {
  const teams = games
    .filter((game) => game.score !== null)
    .flatMap((game) => [game.homeTeamId, game.awayTeamId]);
  const { rows } = await pglite.query<{ id: string }>(
    'select id from people where league_id = $1 and deleted_at is null order by id',
    [as.leagueId],
  );
  const rostered: Rostered[] = [];
  for (const [place, person] of rows.entries()) {
    const teamId = teams[place % teams.length];
    if (teamId === undefined) break;
    must(
      'a roster place',
      await addToRoster(
        as,
        { teamId, personId: person.id, jerseyNumber: String(4 + place), role: 'player' },
        deps,
      ),
    );
    rostered.push({ personId: person.id, teamId, place });
  }
  return rostered;
}

/**
 * A player's line on the box score sheet, from their place p in the league's list (0
 * first): points 10, 14, 18 and on (10 + 4p), one 3-pointer, 1, 3, 5 free throws (1 + 2p)
 * and 1, 2, 3 fouls. A line that could be played: the points are 3 for the 3-pointer, the
 * free throws, and 2 each for 3, 4, 5 two-pointers (3 + p), which the seed season does not
 * keep as a statistic of its own.
 */
function boxScoreLine(player: Rostered): BoxScoreLineInput {
  return {
    teamId: player.teamId,
    personId: player.personId,
    played: true,
    secondsPlayed: null,
    stats: {
      points: 10 + 4 * player.place,
      fg3: 1,
      fg1: 1 + 2 * player.place,
      fouls: 1 + player.place,
    },
  };
}

/** Opens every seed league's current season and plays the start of it (above). */
export async function putSeedSeasonsUnderWay(
  pglite: PGlite,
  now: Date = new Date(),
): Promise<void> {
  const { rows: leagues } = await pglite.query<LeagueRow>(
    `select leagues.id, leagues.owner_account_id, leagues.time_zone,
       seasons.id as season_id, seasons.version as season_version
     from leagues join seasons on seasons.league_id = leagues.id and seasons.is_current
     where leagues.deleted_at is null and seasons.deleted_at is null
     order by leagues.slug`,
  );
  const db = createDatabase({ kind: 'pglite', pglite });
  try {
    const deps: CommandDeps<SeasonTx> = {
      transaction: commandTransaction(db, (scope: LeagueScope) => ({
        jobs: jobsStore(scope),
        access: accessStore(scope),
        activity: activityLogStore(scope),
        leagues: leaguesStore(scope),
        divisions: divisionsStore(scope),
        scheduling: schedulingStore(scope),
        games: gamesStore(scope),
        standings: standingsStore(scope),
        teams: teamsStore(scope),
      })),
      events: eventHandlers,
      log: () => {},
      now: () => Date.now(),
    };
    for (const league of leagues) {
      const as: CommandContext = {
        leagueId: league.id,
        accountId: league.owner_account_id,
        requestId: 'seed-season-under-way',
      };
      const seasonId = league.season_id;
      must(
        'opening the season',
        await updateSeason(
          as,
          { seasonId, version: league.season_version, status: 'active', current: true },
          deps,
        ),
      );
      must(
        'the minimum games for leaders',
        await setSetting(
          as,
          { level: 'league', key: minimumGamesToRank.key, value: 1, version: null },
          deps,
        ),
      );
      const games = await plannedGames(pglite, league, dayIn(league.time_zone, now.getTime()));
      const players = await putPeopleOnTeams(pglite, as, games, deps);
      for (const game of games) {
        const draft = must('the schedule draft', await getScheduleDraft(as, { seasonId }, deps));
        must(
          'a game',
          await addDraftGame(
            as,
            {
              seasonId,
              basedOnRevision: draft.latestRevision,
              draftId: draft.draft?.id ?? null,
              version: draft.draft?.version ?? null,
              gameId: game.gameId,
              homeTeamId: game.homeTeamId,
              awayTeamId: game.awayTeamId,
              roundId: null,
              date: game.date,
              time: startTime,
              venueId: null,
              court: null,
              recording: game.score === null ? 'final-score' : 'box-score',
            },
            deps,
          ),
        );
      }
      const draft = must('the schedule draft', await getScheduleDraft(as, { seasonId }, deps));
      must(
        'publishing the schedule',
        await publishSchedule(
          as,
          {
            seasonId,
            basedOnRevision: draft.latestRevision,
            draftId: draft.draft?.id ?? '',
            version: draft.draft?.version ?? 0,
          },
          deps,
        ),
      );
      for (const game of games) {
        if (game.score === null) continue;
        const version = await deps.transaction(
          as,
          async (tx) => (await tx.games.find(game.gameId))?.version ?? 0,
        );
        const lines = players
          .filter((p) => p.teamId === game.homeTeamId || p.teamId === game.awayTeamId)
          .map(boxScoreLine);
        must(
          'a box score',
          await setBoxScore(
            as,
            {
              gameId: game.gameId,
              version,
              homeScore: game.score.home,
              awayScore: game.score.away,
              lines,
            },
            deps,
          ),
        );
      }
    }
  } finally {
    await db.close();
  }
}
