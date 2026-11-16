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
// member's teams and each league's name (database-league-sites.ts). Every other area
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
  type CommandDeps,
  type Result,
} from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle } from '@srleagues/database';
import type { SignInService } from '@srleagues/providers';
import { randomUUID } from 'node:crypto';
import { accessOfVia } from './access-of.ts';
import type { AccountRefusal } from './context.ts';
import {
  databaseLeagueSites,
  type DesignReport,
  type LeagueSitesQueries,
} from './database-league-sites.ts';
import { databasePublicSchedule, type PublicScheduleQueries } from './database-public-schedule.ts';
import { databasePublicStats, type PublicStatsQueries } from './database-public-stats.ts';
import { databasePublicTeams, type PublicTeamsQueries } from './database-public-teams.ts';
import { notMovedYet, NotOnTheDatabaseYet } from './not-on-the-database-yet.ts';
import type { WebPorts } from './ports.ts';
import { sharedRenewal } from './sign-in/renew-session.ts';
import type { SignInMail } from './sign-in/sign-in-mail.ts';

export { NotOnTheDatabaseYet } from './not-on-the-database-yet.ts';

/** What these ports use of packages/database. */
export type DatabaseQueries = Pick<
  typeof DatabaseModule,
  | 'withTransaction'
  | 'commandTransaction'
  | 'findLeagueByShortName'
  | 'findCurrentLeague'
  | 'findAccountOfSignIn'
  | 'accountForSignIn'
  | 'isSignInLinkConflict'
  | 'isSignInRefusal'
  | 'listMyLeagues'
  | 'accessStore'
  | 'activityLogStore'
  | 'jobsStore'
> &
  PublicScheduleQueries &
  PublicStatsQueries &
  PublicTeamsQueries &
  LeagueSitesQueries;

export type DatabasePortsOptions = {
  readonly database: DatabaseQueries;
  readonly db: DatabaseHandle;
  /** The sign-in service: its `accountId` is the service's own user id (record 052). */
  readonly signIn: SignInService;
  readonly signInMail: SignInMail;
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
    })),
    events: [],
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
    renewSession: sharedRenewal((refreshToken) => signIn.renew({ refreshToken }), now),
    accessOf: accessOfVia(deps),
    // The one read across leagues (record 066): in a transaction set to the session's
    // account and no league, through my_leagues(), which answers for that account only.
    leaguesOfAccount: (accountId) =>
      database.withTransaction(db, { accountId }, (scope) => database.listMyLeagues(scope)),
    leagueSites: databaseLeagueSites(database, db, {
      ...(options.reportDesign === undefined ? {} : { report: options.reportDesign }),
      now: () => now().getTime(),
    }),
    publicStats: databasePublicStats(database, db),
    games: notMovedYet('games area'),
    fixtureImport: notMovedYet('fixture import'),
    publicSchedule: databasePublicSchedule(database, db, now),
    // When moved (step 2.93), its seasonsOf lists only what mayListSeason allows the holder.
    scheduleAdmin: notMovedYet('schedule grid'),
    publicTeams: databasePublicTeams(database, db),
    adminTeams: notMovedYet('Admin → Teams'),
    adminSettings: notMovedYet('league settings'),
    tracker: notMovedYet('tracker'),
    publishPlays: async () => {
      throw new NotOnTheDatabaseYet('tracker');
    },
    // No live hub until the tracker moves: nothing would publish to it.
    liveFeed: null,
    madeUpWorld: false,
    answers: () => true,
  };
}
