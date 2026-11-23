// The web app's ports on a database (step 2.93, record 055): what every request
// needs, read from the database through packages/database. startup.ts makes them,
// on the made-up database in local work (LOCAL_DATA=made-up-database) and, once
// every area has moved, on PostgreSQL in staging and production.
//
// Moved so far: finding a league by its short name or id, who the signed-in person
// is (identify, below), what they hold in a league (accessOf) and the leagues they
// belong to (leaguesOfAccount, step 2.127); and, in part 2, the public schedule
// (database-public-schedule.ts) and the standings with the seasons a visitor may pick
// (database-public-stats.ts) and the members' start page the league home reads first
// (database-public-teams.ts); in part 3 (record 070) the statistics, a team's roster, a
// member's teams and each league's name (database-league-sites.ts); in part 4 League
// settings and Season settings (database-admin-settings.ts) and Admin → Schedule, the
// grid with its drafts, rounds and publishing and its list of seasons
// (database-schedule-admin.ts); in part 6 (record 076) Admin → Games and "My games to
// score" (database-games.ts) and the tracker with its game page and snapshot
// (database-tracker.ts); in part 5 Admin → Teams, its teams, rosters and the league list
// of people (database-admin-teams.ts). Every other area
// still runs on the stand-in only: here each one refuses with NotOnTheDatabaseYet
// the first time it is used, so its page shows the error page rather than made-up
// data that is not in the database. Each moves in a part of its own.
//
// packages/database is handed in, not imported: Node.js loads it when the app starts
// (container.ts), so Next.js never bundles it.
import {
  fail,
  isLeagueIdFormat,
  ok,
  type AccessTx,
  type BinTx,
  type CommandDeps,
  type Result,
} from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle } from '@srleagues/database';
import type { BotCheck, SignInService } from '@srleagues/providers';
import { randomUUID } from 'node:crypto';
import { accessOfVia } from './access-of.ts';
import { peopleDepsOf } from './admin-people.ts';
import type { AccountRefusal } from './context.ts';
import { databaseAdminAccess, type AdminAccessQueries } from './database-admin-access.ts';
import { databaseAdminSettings, type AdminSettingsQueries } from './database-admin-settings.ts';
import { databaseAdminTeams, type AdminTeamsQueries } from './database-admin-teams.ts';
import { coreEventHandlers } from './database-event-handlers.ts';
import {
  databaseGames,
  databaseGamesDeps,
  databaseScorekeepersDeps,
  databaseStandingsDeps,
  type GamesQueries,
} from './database-games.ts';
import {
  databaseLeagueSites,
  type DesignReport,
  type LeagueSitesQueries,
} from './database-league-sites.ts';
import { databasePublicSchedule, type PublicScheduleQueries } from './database-public-schedule.ts';
import { databasePublicStats, type PublicStatsQueries } from './database-public-stats.ts';
import { databasePublicTeams, type PublicTeamsQueries } from './database-public-teams.ts';
import { databaseScheduleAdmin, type ScheduleAdminQueries } from './database-schedule-admin.ts';
import { databaseTracker, type TrackerQueries } from './database-tracker.ts';
import type { LocalTools } from './local-tools.ts';
import type { SendQueuedInvitations } from './made-up-invitation-mail.ts';
import { notMovedYet } from './not-on-the-database-yet.ts';
import type { WebPorts } from './ports.ts';
import { sharedRenewal } from './sign-in/renew-session.ts';
import type { SignInMail } from './sign-in/sign-in-mail.ts';
import { answersOnlyHere } from './this-computer.ts';

export { NotOnTheDatabaseYet } from './not-on-the-database-yet.ts';

/** What these ports use of packages/database. */
export type DatabaseQueries = Pick<
  typeof DatabaseModule,
  | 'withTransaction'
  | 'commandTransaction'
  | 'findLeagueByShortName'
  | 'findCurrentLeague'
  | 'databaseAnswers'
  | 'findAccountOfSignIn'
  | 'accountForSignIn'
  | 'isSignInLinkConflict'
  | 'isSignInRefusal'
  | 'listMyLeagues'
  | 'accessStore'
  | 'activityLogStore'
  | 'jobsStore'
  | 'binStore'
> &
  AdminAccessQueries &
  AdminSettingsQueries &
  AdminTeamsQueries &
  GamesQueries &
  PublicScheduleQueries &
  PublicStatsQueries &
  PublicTeamsQueries &
  LeagueSitesQueries &
  ScheduleAdminQueries &
  TrackerQueries;

export type DatabasePortsOptions = {
  readonly database: DatabaseQueries;
  readonly db: DatabaseHandle;
  /** The sign-in service: its `accountId` is the service's own user id (record 052). */
  readonly signIn: SignInService;
  readonly signInMail: SignInMail;
  /** The bot check in front of sign-in and sign-up (record 081). */
  readonly botCheck: BotCheck;
  /** Where the access module's T-196 lines go. */
  readonly log: CommandDeps<AccessTx>['log'];
  /**
   * Where a sign-in that needs putting right by hand is reported: a fixed message and
   * the sign-in user's id, never an address or a token (T-86).
   */
  readonly warn: (message: string, fields: { readonly signInUserId: string }) => void;
  /**
   * Where a league's published design that cannot be drawn is reported: a fixed message,
   * the league's id and the release's number only (record 073).
   */
  readonly reportDesign?: DesignReport;
  readonly now?: () => Date;
  /**
   * Whether this is the test copy (APP_ENV staging, step 2.205): given true by startup.ts
   * there only. Absent, false: production, and the made-up database of local work and tests.
   */
  readonly testCopy?: boolean;
  /**
   * The kept emails and "be this made-up person" (step 2.96): given only on the made-up
   * database (startup.ts), with the site's address (PUBLIC_BASE_URL). Ports that carry them
   * answer only requests made on this computer (answersOnlyHere, as the stand-in's do), so
   * no other computer on the network can read a code or press "Be …". A real database has
   * none, so both pages answer "not found" and its ports answer every request.
   */
  readonly localTools?: {
    readonly tools: LocalTools;
    readonly publicBaseUrl: string;
  } | null;
  /**
   * The worker's turn for invitation emails (step 2.97, made-up-invitation-mail.ts): given
   * only on the made-up database, whose jobs no worker can reach. Left out, the worker
   * sends them.
   */
  readonly sendQueuedInvitations?: SendQueuedInvitations | null;
};

/** How often one sign-in user's account problem is logged again: once an hour (T-86). */
const warnEveryMs = 60 * 60 * 1000;
/** The most users remembered as logged; past it, the memory starts again. */
const mostWarned = 10_000;

const linkConflict =
  'A sign-in user cannot be linked: the account for its address belongs to another sign-in user. Put it right by hand (records 052 and 055).';
const addressRefused =
  'A sign-in user cannot be linked or given an account: the database refuses its address (records 052 and 055).';
const notPlainAddress =
  'A sign-in user cannot be linked or given an account: its address is not plain ASCII (record 055).';

/** Printable ASCII, no space: what an address may hold to be linked or given an account. */
const plainAscii = /^[\x21-\x7e]+$/;

/** Lower-cases A to Z only, so no other character is folded into ASCII. */
const asciiLowerCase = (text: string) =>
  text.replace(/[A-Z]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) + 32));

export function databasePorts(options: DatabasePortsOptions): WebPorts {
  const { database, db, signIn } = options;
  const now = options.now ?? (() => new Date());
  const deps: CommandDeps<AccessTx> = {
    transaction: database.commandTransaction(db, (scope) => ({
      jobs: database.jobsStore(scope),
      activity: database.activityLogStore(scope),
      access: database.accessStore(scope),
      standings: database.standingsStore(scope),
      games: database.gamesStore(scope),
    })),
    // Core's handlers, from the one place every database port takes them.
    events: coreEventHandlers<AccessTx>(),
    log: options.log,
    now: () => performance.now(),
  };

  // Which of our accounts the service's user is (record 052, T-256). The service has
  // already proved this session, and a session is only ever made after it proved the
  // mailbox (a right code, Google, or a right password), so the first time a user is
  // seen, accountForSignIn may link or make their account, provided the service also
  // says the address is confirmed (record 055). This is its only call: the email is
  // the one the service holds for the session, never one from the request.
  // When that address's account is linked to another sign-in user (put right by hand,
  // record 052), the answer is a refusal, never another person's account; so is any
  // other refusal of the database for linking or making the account (an address on
  // .invalid, one the accounts' email format refuses), and an address that is not
  // plain ASCII (below). Each is logged with the sign-in user's id only, once an hour
  // per user (T-86), for whoever puts it right, and the person is told so plainly on
  // the account page, where they can still sign out (record 055). A fault, such as
  // the database not being reached, is still an error.
  const warned = new Map<string, number>();
  const warnOnce = (message: string, signInUserId: string) => {
    const at = now().getTime();
    const last = warned.get(`${message}\n${signInUserId}`);
    if (last !== undefined && at - last < warnEveryMs) return;
    if (warned.size >= mostWarned) warned.clear();
    warned.set(`${message}\n${signInUserId}`, at);
    options.warn(message, { signInUserId });
  };
  const accountOfSignIn = async (
    signInId: string,
    email: string,
    emailConfirmed: boolean,
  ): Promise<Result<string, AccountRefusal>> => {
    const linked = await database.withTransaction(db, {}, (scope) =>
      database.findAccountOfSignIn(scope, signInId),
    );
    if (linked !== undefined) return ok(linked);
    // Linking hands the address's account over, so only for an address the service
    // holds as proved; nor is an account made for one it does not.
    if (!emailConfirmed) return fail({ code: 'account-problem', problem: 'address-not-confirmed' });
    // The database matches addresses with lower(), which folds some other characters
    // into ASCII (the Kelvin sign into k), so two mailboxes could meet in one account.
    // Only a plain ASCII address, lower-cased as plain ASCII, is linked or given an
    // account; any other is refused (record 055).
    const address = asciiLowerCase(email);
    if (!plainAscii.test(address)) {
      warnOnce(notPlainAddress, signInId);
      return fail({ code: 'account-problem', problem: 'address-refused' });
    }
    try {
      return ok(
        await database.withTransaction(db, {}, (scope) =>
          database.accountForSignIn(scope, signInId, address),
        ),
      );
    } catch (error) {
      if (database.isSignInLinkConflict(error)) {
        warnOnce(linkConflict, signInId);
        return fail({ code: 'account-problem', problem: 'sign-in-link-conflict' });
      }
      if (!database.isSignInRefusal(error)) throw error;
      warnOnce(addressRefused, signInId);
      return fail({ code: 'account-problem', problem: 'address-refused' });
    }
  };

  const identify: WebPorts['identify'] = async (accessToken) => {
    const who = await signIn.identify({ accessToken });
    if (!who.ok) return who;
    const { accountId, email, emailConfirmed } = who.value;
    const account = await accountOfSignIn(accountId, email, emailConfirmed);
    if (!account.ok) return account;
    return ok({ ...who.value, accountId: account.value });
  };

  const accessOf = accessOfVia(deps);
  // The games commands' one transaction, the tracker's too (database-games.ts).
  const clock = { now: () => now().getTime() };
  const gamesDeps = databaseGamesDeps(database, db, { log: options.log, clock });
  // Admin → Teams' transaction, whose people store Admin → People's commands run on too
  // (step 2.50): one people store, so a person added on People is the one Teams puts on
  // a roster; with the same event handlers.
  const adminTeams = databaseAdminTeams(database, db, options.log, accessOf);

  return {
    findLeague: (shortName) =>
      database.withTransaction(db, {}, (scope) => database.findLeagueByShortName(scope, shortName)),
    findLeagueById: async (leagueId) => {
      // Not a UUID is no league, asked of no database (where it could not be cast).
      if (!isLeagueIdFormat(leagueId.toLowerCase())) return undefined;
      const found = await database.withTransaction(db, { leagueId }, (scope) =>
        database.findCurrentLeague(scope),
      );
      return found === undefined
        ? undefined
        : { id: found.id, slug: found.slug, status: found.status };
    },
    newRequestId: () => randomUUID(),
    identify,
    signIn,
    signInMail: options.signInMail,
    botCheck: options.botCheck,
    renewSession: sharedRenewal((refreshToken) => signIn.renew({ refreshToken }), now),
    accessOf,
    // The one read across leagues (record 066): in a transaction set to the session's
    // account and no league, through my_leagues(), which answers for that account only.
    leaguesOfAccount: (accountId) =>
      database.withTransaction(db, { accountId }, (scope) => database.listMyLeagues(scope)),
    leagueSites: databaseLeagueSites(database, db, {
      ...(options.reportDesign === undefined ? {} : { report: options.reportDesign }),
      now: () => now().getTime(),
    }),
    localTools: options.localTools?.tools ?? null,
    publicStats: databasePublicStats(database, db),
    games: databaseGames(
      database,
      db,
      gamesDeps,
      databaseStandingsDeps(database, db, { log: options.log }),
      databaseScorekeepersDeps(database, db, { log: options.log }),
    ),
    fixtureImport: notMovedYet('fixture import'),
    publicSchedule: databasePublicSchedule(database, db, now),
    // Its seasonsOf lists only what mayListSeason allows the holder, read again for the
    // league it lists (part 4).
    scheduleAdmin: databaseScheduleAdmin(database, db, options.log, accessOf),
    publicTeams: databasePublicTeams(database, db),
    adminAccess: databaseAdminAccess(database, db, deps, options.sendQueuedInvitations ?? null),
    // The people commands and reads, on Admin → Teams' own transaction (step 2.50): every
    // one is a league transaction set to the session's league and account (T-23, T-28),
    // and a person's private fields are read only for people.read_sensitive (T-76).
    // Putting a removed person back (A-5): the bin's command on the bin's own store, as
    // the worker's purge has it; restoring a person sets off no handler.
    adminPeople: {
      deps: peopleDepsOf(adminTeams.deps),
      putBack: {
        transaction: database.commandTransaction(db, (scope) => ({
          jobs: database.jobsStore(scope),
          bin: database.binStore(scope),
          access: database.accessStore(scope),
          activity: database.activityLogStore(scope),
          // The stores core's handlers use, so the port is given them from the one place
          // (database-event-handlers.ts) though restoring a person sets none of them off.
          standings: database.standingsStore(scope),
          games: database.gamesStore(scope),
        })),
        events: coreEventHandlers<BinTx>(),
        log: options.log,
        now: () => performance.now(),
      },
    },
    // Its commands run with core's event handlers, never an empty list (part 5).
    adminTeams,
    adminSettings: databaseAdminSettings(database, db, options.log),
    tracker: databaseTracker(database, db, gamesDeps, clock),
    // No live service on the database yet (steps 2.124 and 2.116): nothing listens, so a
    // saved play is not published; a watcher's page asks for the snapshot again.
    publishPlays: async () => {},
    liveFeed: null,
    madeUpWorld: false,
    testCopy: options.testCopy ?? false,
    // The health check asks the database itself (health.ts).
    databaseCheck: () => database.databaseAnswers(db),
    // Carrying the local tools, only requests made on this computer (step 2.96).
    answers:
      options.localTools === undefined || options.localTools === null
        ? () => true
        : answersOnlyHere(options.localTools.publicBaseUrl),
  };
}
