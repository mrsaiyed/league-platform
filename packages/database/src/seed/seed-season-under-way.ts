// Development-only (T-195, T-201): puts each seed league's season under way, so the web
// app run locally on the made-up database (record 055, step 2.93) has a public schedule,
// results and standings to show. Made-up data only: it takes a PGlite, never an address.
//
// For every seed league, through the product's own commands as its owner, each in its
// own scoped transaction: the current season is opened (made active), and in each
// division the first two teams played a week ago, a final score recorded, and the second
// and third play a week from now, published as the season's schedule. The standings are
// rebuilt by the standings module's own event handler, as for any result. The same for
// every league: no league is named here, and the dates follow the league's own today.
import type { PGlite } from '@electric-sql/pglite';
import {
  addDraftGame,
  dayIn,
  eventHandlers,
  getScheduleDraft,
  publishSchedule,
  recordFinalScore,
  updateSeason,
  type CommandContext,
  type CommandDeps,
  type GamesTx,
  type LeaguesTx,
  type SchedulingTx,
  type StandingsTx,
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
} from '../stores/index.ts';

type SeasonTx = LeaguesTx & SchedulingTx & GamesTx & StandingsTx;

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
      const games = await plannedGames(pglite, league, dayIn(league.time_zone, now.getTime()));
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
              recording: 'final-score',
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
        must(
          'a final score',
          await recordFinalScore(
            as,
            {
              gameId: game.gameId,
              version,
              homeScore: game.score.home,
              awayScore: game.score.away,
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
