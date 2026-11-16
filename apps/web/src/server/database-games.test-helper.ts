// The games area and the tracker on the database ports, for their tests (step 2.93 part
// 6): the made-up database with its seasons under way, the web app's own databasePorts
// over it, the people the step names signed in as the sign-in service would say, and
// games of Lakeside's season to play: Herons against Otters, made and published by the
// schedule's own commands, with five players a side put on the rosters by the people and
// teams commands. Everything is the product's own commands on packages/database's stores;
// nothing is written by hand.
import {
  addDraftGame,
  addToRoster,
  assignScorekeeper,
  createPerson,
  dayIn,
  eventHandlers,
  fail,
  getScheduleDraft,
  leagueScope,
  ok,
  publishSchedule,
  type CommandContext,
  type CommandDeps,
  type PeopleTx,
  type Scope,
  type StandingsLine,
  type StandingsTx,
  type TeamsTx,
} from '@srleagues/core';
import * as database from '@srleagues/database';
import type { SessionIdentity, SignInService } from '@srleagues/providers';
import { randomUUID } from 'node:crypto';
import { databasePorts } from './database-ports.ts';
import type { WebPorts } from './ports.ts';
import type { SignInMail } from './sign-in/sign-in-mail.ts';

/** The people the step names, and someone signed out. */
export const actors = [
  'owner',
  'admin',
  'scheduler',
  /** Lakeside's seed scorekeeper, assigned to score every game made here. */
  'scorekeeper',
  /** A second scorekeeper of the whole league, assigned to no game. */
  'unassignedScorekeeper',
  /** The coach of the Herons: a role with no part in scoring (P4 §4). */
  'coach',
  'stranger',
  /** Maple Street's admin, asking through Lakeside. */
  'otherLeagueAdmin',
  'signedOut',
] as const;
export type Actor = (typeof actors)[number];

/** Lakeside's time zone (seed-data.ts). */
const zone = 'America/Chicago';

function must<T>(what: string, result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`${what}: ${JSON.stringify(result.error)}`);
  return result.value;
}

/** yyyy-mm-dd, `days` days on from `day` (or back, when negative). */
const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export type GamesWorld = Awaited<ReturnType<typeof gamesWorld>>;

/** How many games of each kind to make, and who plays in Lakeside. */
export type GamesWorldOptions = {
  readonly byHand: number;
  readonly live: number;
  /**
   * Lakeside told it is a youth league (R-15), with the Herons' first player recorded as a
   * child and the other four of unknown age; the Otters stay adults. Left out: an adult
   * league, every player an adult.
   */
  readonly youth?: true;
};

/**
 * The world. `byHand` games are recorded by final score, `live` ones in the tracker; each
 * is Herons (home) against Otters (away), started some days ago at 20:00, so each needs a
 * result.
 */
export async function gamesWorld(counts: GamesWorldOptions) {
  const made = await database.madeUpDatabase({
    underWay: true,
    ...(counts.youth === true ? { audiences: { lakeside: 'youth' as const } } : {}),
  });
  const db = database.createDatabase(made.source);
  /** The ports' clock: the server's now, moved on by hand. */
  const clock = { at: Date.now() };
  const sessions = new Map<string, SessionIdentity>();
  const ports: WebPorts = databasePorts({
    database,
    db,
    signIn: {
      identify: async ({ accessToken }: { accessToken: string }) => {
        const who = sessions.get(accessToken);
        return who === undefined ? fail({ code: 'session-ended' as const }) : ok(who);
      },
    } as unknown as SignInService,
    signInMail: {} as SignInMail,
    log: () => {},
    warn: () => {},
    now: () => new Date(clock.at),
  });
  /** Our account for an address, as signing in makes or links it (record 052). */
  const accountFor = async (email: string) => {
    const token = `token-${randomUUID()}`;
    sessions.set(token, {
      accountId: randomUUID(),
      email,
      emailConfirmed: true,
      sessionId: `session-${token}`,
      hasPassword: true,
      passwordEnteredAt: null,
      lastSignInAt: new Date('2026-11-01T10:00:00Z'),
    });
    const who = await ports.identify(token);
    if (!who.ok) throw new Error(`${email} not signed in: ${who.error.code}`);
    return who.value.accountId;
  };
  const lakeside = made.leagues.find((l) => l.slug === 'lakeside');
  const maple = made.leagues.find((l) => l.slug === 'maple-street');
  if (lakeside === undefined || maple === undefined) throw new Error('no seed leagues');
  const leagueId = lakeside.leagueId;
  const otherLeagueId = maple.leagueId;
  const owner = lakeside.ownerAccountId;
  const asOwner = { leagueId, accountId: owner, requestId: randomUUID() };
  const asOtherOwner = {
    leagueId: otherLeagueId,
    accountId: maple.ownerAccountId,
    requestId: randomUUID(),
  };
  const seasonOf = async (leagueOf: string) => {
    const seasons = await database.withTransaction(
      db,
      { leagueId: leagueOf },
      database.listLeagueSeasons,
    );
    const current = seasons.find((s) => s.isCurrent);
    if (current === undefined) throw new Error('no current season');
    return current.id;
  };
  const seasonId = await seasonOf(leagueId);
  const otherSeasonId = await seasonOf(otherLeagueId);
  const names = await ports.games.namesOf(leagueId);
  const teamId = (name: string) => {
    const found = Object.entries(names.teams).find(([, n]) => n === name)?.[0];
    if (found === undefined) throw new Error(`no team ${name}`);
    return found;
  };
  const herons = teamId('Lakeside Herons');
  const otters = teamId('Lakeside Otters');

  // The people and teams commands, on the league's own stores with core's handlers, to put
  // players on rosters (Admin → Teams moves to the database in a part of its own).
  const rosterDeps: CommandDeps<PeopleTx & TeamsTx & StandingsTx> = {
    transaction: database.commandTransaction(db, (scope) => ({
      jobs: database.jobsStore(scope),
      access: database.accessStore(scope),
      activity: database.activityLogStore(scope),
      people: database.peopleStore(scope),
      teams: database.teamsStore(scope),
      games: database.gamesStore(scope),
      standings: database.standingsStore(scope),
    })),
    events: eventHandlers,
    log: () => {},
    now: () => performance.now(),
  };
  /** Five new players a team, numbered from `first`, each an adult unless `ageOf` says. */
  const squad = async (
    team: string,
    first: number,
    family: string,
    ageOf: (n: number) => { readonly isMinor?: boolean } = () => ({ isMinor: false }),
  ) => {
    const ids: string[] = [];
    for (let n = 0; n < 5; n++) {
      const { personId } = must(
        'a person',
        await createPerson(
          asOwner,
          { firstName: `Player${first + n}`, lastName: family, ...ageOf(n) },
          rosterDeps,
        ),
      );
      must(
        'a roster place',
        await addToRoster(
          asOwner,
          { teamId: team, personId, jerseyNumber: String(first + n), role: 'player' },
          rosterDeps,
        ),
      );
      ids.push(personId);
    }
    return ids;
  };
  const players = {
    herons: await squad(
      herons,
      30,
      'Heronfamily',
      counts.youth === true ? (n) => (n === 0 ? { isMinor: true } : {}) : undefined,
    ),
    otters: await squad(otters, 40, 'Otterfamily'),
  };

  // The games to play, published as one revision of the schedule.
  const today = dayIn(zone, Date.now());
  const plan = [
    ...Array.from({ length: counts.byHand }, () => 'final-score' as const),
    ...Array.from({ length: counts.live }, () => 'live' as const),
  ].map((recording, k) => ({ gameId: randomUUID(), recording, date: addDays(today, -(k + 1)) }));
  for (const game of plan) {
    const draft = must(
      'the draft',
      await getScheduleDraft(asOwner, { seasonId }, ports.scheduleAdmin.deps),
    );
    must(
      'a game',
      await addDraftGame(
        asOwner,
        {
          seasonId,
          basedOnRevision: draft.latestRevision,
          draftId: draft.draft?.id ?? null,
          version: draft.draft?.version ?? null,
          gameId: game.gameId,
          homeTeamId: herons,
          awayTeamId: otters,
          roundId: null,
          date: game.date,
          time: '20:00',
          venueId: null,
          court: null,
          recording: game.recording,
        },
        ports.scheduleAdmin.deps,
      ),
    );
  }
  const draft = must(
    'the draft',
    await getScheduleDraft(asOwner, { seasonId }, ports.scheduleAdmin.deps),
  );
  must(
    'publishing',
    await publishSchedule(
      asOwner,
      {
        seasonId,
        basedOnRevision: draft.latestRevision,
        draftId: draft.draft?.id ?? '',
        version: draft.draft?.version ?? 0,
      },
      ports.scheduleAdmin.deps,
    ),
  );

  // Who is who.
  const accountOf = new Map<Actor, string | null>();
  accountOf.set('owner', owner);
  accountOf.set('admin', await accountFor('admin@lakeside.example.test'));
  accountOf.set('scheduler', await accountFor('scheduler@lakeside.example.test'));
  accountOf.set('scorekeeper', await accountFor('scorer@lakeside.example.test'));
  const grant = async (role: 'scorekeeper' | 'coach', scope: Scope) => {
    const accountId = await accountFor(`${role}-${randomUUID()}@example.test`);
    await database.withTransaction(db, asOwner, (s) =>
      database.accessStore(s).createGrant({
        accountId,
        role,
        scope,
        grantedByAccountId: owner,
      }),
    );
    return accountId;
  };
  accountOf.set('unassignedScorekeeper', await grant('scorekeeper', { type: 'league' }));
  accountOf.set('coach', await grant('coach', { type: 'team', id: herons }));
  accountOf.set('stranger', await accountFor(`stranger-${randomUUID()}@example.test`));
  accountOf.set('otherLeagueAdmin', await accountFor('admin@maple.example.test'));
  accountOf.set('signedOut', null);
  // The seed scorekeeper is assigned to every game made here, by the owner.
  for (const game of plan) {
    must(
      'an assignment',
      await assignScorekeeper(
        asOwner,
        { gameId: game.gameId, accountId: accountOf.get('scorekeeper') ?? '' },
        ports.games.deps,
      ),
    );
  }

  /** The request's context as `actor`, through Lakeside's address unless said otherwise. */
  const contextOf = (actor: Actor, through: string = leagueId): CommandContext => ({
    leagueId: through,
    accountId: accountOf.get(actor) ?? null,
    requestId: randomUUID(),
  });

  const byHand = plan.filter((g) => g.recording === 'final-score').map((g) => g.gameId);
  const live = plan.filter((g) => g.recording === 'live').map((g) => g.gameId);
  /** The next game of a kind not used yet. */
  const take = (pool: string[]) => {
    const next = pool.shift();
    if (next === undefined) throw new Error('no game left: make more');
    return next;
  };

  /** A game as its league's owner reads it. */
  const gameOf = async (gameId: string, through: CommandContext = asOwner) =>
    ports.games.deps.transaction(through, (tx) => tx.games.find(gameId));
  /** A game's version, read in whichever of the two leagues it belongs to. */
  const versionOf = async (gameId: string) =>
    ((await gameOf(gameId)) ?? (await gameOf(gameId, asOtherOwner)))?.version ?? 0;

  /** The public standings of Lakeside's season, team by team: played, won, lost, for, against. */
  const standings = async (leagueOf = leagueId, season = seasonId) => {
    const read = await ports.publicStats.standingsOf(leagueOf, season);
    if (!read.ok) throw new Error(`no standings: ${read.error.code}`);
    const lines = read.value.tables.flatMap((t) => t.lines);
    return Object.fromEntries(
      lines.map((l: StandingsLine) => [
        l.team.name,
        [l.gamesPlayed, l.wins, l.losses, l.pointsFor, l.pointsAgainst],
      ]),
    );
  };

  /**
   * Everything of a league these tests could change, read as its owner: the results and
   * versions of its decided games and of `gameIds`, their sessions and saved states, the
   * assignments, the activity log and the standings. Equal before and after a refusal:
   * nothing changed.
   */
  const everything = async (leagueOf: string, gameIds: readonly string[]) => {
    const as = leagueOf === leagueId ? asOwner : asOtherOwner;
    const season = leagueOf === leagueId ? seasonId : otherSeasonId;
    const rows = await database.withTransaction(db, as, async (scope) => {
      const assignments = (await database.listGameNames(scope)).assignments;
      const games = await database.gamesStore(scope).listDecided(season);
      const sessionsAndStates = [];
      for (const gameId of [...gameIds, ...games.map((g) => g.id)]) {
        sessionsAndStates.push({
          game: await database.gamesStore(scope).find(gameId),
          session: await database.scoringSessionsStore(scope).findForGame(gameId),
          state: await database.liveGamesStore(scope).findState(gameId),
        });
      }
      const activity = await database.activityLogStore(scope).list(1000, undefined, leagueScope);
      return { assignments, sessionsAndStates, activity };
    });
    return { ...rows, standings: await standings(leagueOf, season) };
  };

  /** One game of the other league's, not decided: the seed's game a week on. */
  const otherGameId = await database.withTransaction(db, asOtherOwner, async (scope) => {
    const window = await database.gamesStore(scope).listWindow(maple.ownerAccountId, 14);
    const found = window.games.find((g) => g.game.status === 'scheduled')?.game.id;
    if (found === undefined) throw new Error('the other league has no game to come');
    return found;
  });

  return {
    made,
    db,
    ports,
    clock,
    leagueId,
    otherLeagueId,
    seasonId,
    otherSeasonId,
    asOwner,
    asOtherOwner,
    accountOf,
    contextOf,
    herons,
    otters,
    players,
    byHand,
    live,
    take,
    gameOf,
    versionOf,
    standings,
    everything,
    otherGameId,
    close: async () => {
      await db.close();
      await made.close();
    },
  };
}
