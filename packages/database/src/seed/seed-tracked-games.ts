// Development-only (T-195, T-201): gives each seed league whose season is under way
// (seed-season-under-way.ts) a venue and one game scored live through the tracker, so the
// seed holds every way a game gets its result: a final score, a box score sheet and a
// tracked game (step 2.59). Made-up data only: it takes a PGlite, never an address.
//
// For each league, through the product's own commands as its owner, each in its own
// scoped transaction: the venue and its courts are made (seed-tracked-games-data.ts); a
// rematch of the first division's game a week ago, between the same two teams, is added
// to the schedule a few days ago at the venue, to be recorded live, and published; then it
// is opened to score on one device and its actions are sent through the tracker's door
// (games.apply_tracker_commands), which ends it with the tracker's own End game, settles
// its box score lines and works out the standings, as for any tracked game. The players
// are those the season under way put on the two teams' rosters. The same for every
// league: no league is named here.
import type { PGlite } from '@electric-sql/pglite';
import { trackerProtocolVersion } from '@srleagues/contracts';
import {
  addDraftGame,
  applyTrackerCommands,
  createCourt,
  createVenue,
  dayIn,
  eventHandlers,
  getScheduleDraft,
  openScoringSession,
  publishSchedule,
  releaseScoringSession,
  systemClock,
  type CommandContext,
  type CommandDeps,
  type LeaguesTx,
  type SchedulingTx,
  type StandingsTx,
  type TeamsTx,
  type TrackerTx,
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
  liveGamesStore,
  schedulingStore,
  scoringSessionsStore,
  standingsStore,
  teamsStore,
} from '../stores/index.ts';
import { seedLeagues } from './seed-data.ts';
import { seedVenues, trackedGameDaysAgo } from './seed-tracked-games-data.ts';

type SeedTx = LeaguesTx & SchedulingTx & TrackerTx & StandingsTx & TeamsTx;

/** The device the seed scores on, as a scoring session names it. */
const seedDevice = 'seed-tracker';
/** The local time the tracked game starts at, as the rest of the seed season. */
const startTime = '18:00';

function must<T>(what: string, result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`Seeding failed at ${what}: ${JSON.stringify(result.error)}`);
  return result.value;
}

/** yyyy-mm-dd, `days` days on from `day` (or back, when negative). */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type Side = 'home' | 'away';
type Play =
  | { readonly type: 'lineup'; readonly side: Side; readonly playerIds: readonly string[] }
  | {
      readonly type: 'score';
      readonly side: Side;
      readonly playerId: string;
      readonly points: 1 | 2 | 3;
    }
  | { readonly type: 'foul' | 'turnover'; readonly side: Side; readonly playerId: string }
  | { readonly type: 'period'; readonly period: number }
  | { readonly type: 'start' | 'pause' | 'end' };

/**
 * The tracked game's actions, as a scorer taps them: each side's player starts, two
 * periods are played, and the game is ended. Home wins 9 to 7, so no season's rules can
 * refuse it as a tie.
 */
export function trackedGamePlays(home: string, away: string): Play[] {
  return [
    { type: 'lineup', side: 'home', playerIds: [home] },
    { type: 'lineup', side: 'away', playerIds: [away] },
    { type: 'start' },
    { type: 'score', side: 'home', playerId: home, points: 2 },
    { type: 'score', side: 'away', playerId: away, points: 3 },
    { type: 'foul', side: 'away', playerId: away },
    { type: 'score', side: 'home', playerId: home, points: 3 },
    { type: 'pause' },
    { type: 'period', period: 2 },
    { type: 'start' },
    // No turnover: the seed seasons keep the standard set, which a turnover is not in,
    // so the server would refuse it (S-93, step 2.241).
    { type: 'score', side: 'away', playerId: away, points: 2 },
    { type: 'score', side: 'home', playerId: home, points: 2 },
    { type: 'score', side: 'away', playerId: away, points: 2 },
    { type: 'foul', side: 'home', playerId: home },
    { type: 'score', side: 'home', playerId: home, points: 2 },
    { type: 'pause' },
    { type: 'end' },
  ];
}

type LeagueRow = { id: string; owner_account_id: string; time_zone: string; season_id: string };

/** The first division's first two teams that each have a player on their roster. */
async function twoTeams(
  pglite: PGlite,
  league: LeagueRow,
): Promise<{ home: { team: string; person: string }; away: { team: string; person: string } }> {
  const { rows } = await pglite.query<{ team: string; person: string }>(
    `select teams.id as team, (
       select person_id from roster_entries
       where roster_entries.team_id = teams.id and roster_entries.left_on is null
       order by person_id limit 1
     ) as person
     from teams
     where teams.deleted_at is null and teams.division_id = (
       select id from divisions where league_id = $1 and season_id = $2 and deleted_at is null
       order by sort, id limit 1
     )
     order by teams.id`,
    [league.id, league.season_id],
  );
  const [home, away] = rows.filter((row) => row.person !== null);
  if (home === undefined || away === undefined) {
    throw new Error('Seeding failed at the tracked game: two teams with players are needed.');
  }
  return { home, away };
}

/** Gives each seed league under way its venue and its one tracked game (above). */
export async function addSeedTrackedGames(
  pglite: PGlite,
  now: Date = new Date(),
  slugs: readonly string[] = seedLeagues.map((league) => league.slug),
): Promise<void> {
  const { rows: leagues } = await pglite.query<LeagueRow & { slug: string }>(
    `select leagues.id, leagues.slug, leagues.owner_account_id, leagues.time_zone,
       seasons.id as season_id
     from leagues join seasons on seasons.league_id = leagues.id and seasons.is_current
     where leagues.deleted_at is null and seasons.deleted_at is null
       and seasons.status = 'active' and leagues.slug = any($1::text[])
     order by leagues.slug`,
    [[...slugs]],
  );
  const db = createDatabase({ kind: 'pglite', pglite });
  try {
    const deps: CommandDeps<SeedTx> = {
      transaction: commandTransaction(db, (scope: LeagueScope) => ({
        jobs: jobsStore(scope),
        access: accessStore(scope),
        activity: activityLogStore(scope),
        leagues: leaguesStore(scope),
        divisions: divisionsStore(scope),
        scheduling: schedulingStore(scope),
        games: gamesStore(scope),
        scoringSessions: scoringSessionsStore(scope),
        liveGames: liveGamesStore(scope),
        clock: systemClock,
        standings: standingsStore(scope),
        teams: teamsStore(scope),
      })),
      events: eventHandlers,
      log: () => {},
      now: () => Date.now(),
    };
    for (const league of leagues) {
      const venue = seedVenues[league.slug];
      if (venue === undefined) throw new Error(`Seeding failed at the venue: none for a league.`);
      const as: CommandContext = {
        leagueId: league.id,
        accountId: league.owner_account_id,
        requestId: 'seed-tracked-game',
      };
      const seasonId = league.season_id;
      const { venueId } = must(
        'the venue',
        await createVenue(as, { name: venue.name, address: venue.address }, deps),
      );
      for (const court of venue.courts) {
        must('a court', await createCourt(as, { venueId, name: court }, deps));
      }
      const { home, away } = await twoTeams(pglite, league);
      const gameId = randomUUID();
      const draft = must('the schedule draft', await getScheduleDraft(as, { seasonId }, deps));
      must(
        'the tracked game',
        await addDraftGame(
          as,
          {
            seasonId,
            basedOnRevision: draft.latestRevision,
            draftId: draft.draft?.id ?? null,
            version: draft.draft?.version ?? null,
            gameId,
            homeTeamId: home.team,
            awayTeamId: away.team,
            roundId: null,
            date: addDays(dayIn(league.time_zone, now.getTime()), -trackedGameDaysAgo),
            time: startTime,
            venueId,
            court: venue.courts[0] ?? null,
            recording: 'live',
          },
          deps,
        ),
      );
      const added = must('the schedule draft', await getScheduleDraft(as, { seasonId }, deps));
      must(
        'publishing the tracked game',
        await publishSchedule(
          as,
          {
            seasonId,
            basedOnRevision: added.latestRevision,
            draftId: added.draft?.id ?? '',
            version: added.draft?.version ?? 0,
          },
          deps,
        ),
      );
      const startsAt = (
        await pglite.query<{ at: number }>(
          'select (extract(epoch from starts_at) * 1000)::float8 as at from games where id = $1',
          [gameId],
        )
      ).rows[0]?.at;
      if (startsAt === undefined) throw new Error('Seeding failed at the tracked game: no start.');
      const opened = must(
        'opening the tracked game',
        await openScoringSession(as, { gameId, deviceId: seedDevice }, deps),
      );
      if (opened.status !== 'held-by-you') {
        throw new Error(`Seeding failed at opening the tracked game: ${opened.status}`);
      }
      const plays = trackedGamePlays(home.person, away.person);
      const sent = must(
        'scoring the tracked game',
        await applyTrackerCommands(
          as,
          {
            gameId,
            protocolVersion: trackerProtocolVersion,
            sessionId: opened.sessionId,
            commands: plays.map((input, k) => ({
              commandId: randomUUID(),
              at: startsAt + (k + 1) * 30_000,
              input,
            })),
          },
          deps,
        ),
      );
      const refused = sent.results.find((answer) => answer.status !== 'accepted');
      if (refused !== undefined) {
        throw new Error(`Seeding failed at scoring the tracked game: ${JSON.stringify(refused)}`);
      }
      must(
        'letting the tracked game go',
        await releaseScoringSession(as, { gameId, sessionId: opened.sessionId }, deps),
      );
    }
  } finally {
    await db.close();
  }
}
