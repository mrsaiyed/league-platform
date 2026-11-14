// The web app's ports on a database (step 2.93, record 055): what every request
// needs, read from the database through packages/database. startup.ts makes them,
// on the made-up database in local work (LOCAL_DATA=made-up-database) and, once
// every area has moved, on PostgreSQL in staging and production.
//
// Moved so far: finding a league by its short name or id, who the signed-in person
// is (identify, below) and what they hold in a league (accessOf). Every other area
// still runs on the stand-in only: here each one refuses with NotOnTheDatabaseYet
// the first time it is used, so its page shows the error page rather than made-up
// data that is not in the database. Each moves in a part of its own.
//
// packages/database is handed in, not imported: Node.js loads it when the app starts
// (container.ts), so Next.js never bundles it.
import { fail, ok, type AccessTx, type CommandDeps, type Result } from '@srleagues/core';
import type * as DatabaseModule from '@srleagues/database';
import type { DatabaseHandle } from '@srleagues/database';
import type { SignInService } from '@srleagues/providers';
import { randomUUID } from 'node:crypto';
import { accessOfVia } from './access-of.ts';
import type { AccountRefusal } from './context.ts';
import type { WebPorts } from './ports.ts';
import { sharedRenewal } from './sign-in/renew-session.ts';
import type { SignInMail } from './sign-in/sign-in-mail.ts';

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
  | 'accessStore'
  | 'activityLogStore'
  | 'jobsStore'
>;

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
  readonly now?: () => Date;
};

/** An area used before it has moved onto the database (record 055). */
export class NotOnTheDatabaseYet extends Error {
  readonly area: string;
  constructor(area: string) {
    super(`The web app's ${area} does not run on the database yet (step 2.93).`);
    this.name = 'NotOnTheDatabaseYet';
    this.area = area;
  }
}

/**
 * An area's ports that refuse the moment any of them is reached. `then` and symbols
 * answer nothing, so awaiting or printing the object itself does not refuse.
 */
function notMovedYet<T extends object>(area: string): T {
  const refuse = (): never => {
    throw new NotOnTheDatabaseYet(area);
  };
  const handler: ProxyHandler<object> = {
    get: (_target, name) => (typeof name === 'symbol' || name === 'then' ? undefined : refuse()),
  };
  return new Proxy({}, handler) as T;
}

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
  // seen, accountForSignIn may link or make their account. This is its only call: the
  // email is the one the service holds for the session, never one from the request.
  // When that address's account is linked to another sign-in user (put right by hand,
  // record 052), the answer is a refusal, never another person's account: each request
  // logs the sign-in user's id for whoever puts it right, and the person is told so
  // plainly on the account page, where they can still sign out (record 055).
  const accountOfSignIn = async (
    signInId: string,
    email: string,
  ): Promise<Result<string, AccountRefusal>> => {
    const linked = await database.withTransaction(db, {}, (scope) =>
      database.findAccountOfSignIn(scope, signInId),
    );
    if (linked !== undefined) return ok(linked);
    try {
      return ok(
        await database.withTransaction(db, {}, (scope) =>
          database.accountForSignIn(scope, signInId, email),
        ),
      );
    } catch (error) {
      if (!database.isSignInLinkConflict(error)) throw error;
      options.warn(
        'A sign-in user cannot be linked: the account for its address belongs to another sign-in user. Put it right by hand (records 052 and 055).',
        { signInUserId: signInId },
      );
      return fail({ code: 'account-problem', problem: 'sign-in-link-conflict' });
    }
  };

  const identify: WebPorts['identify'] = async (accessToken) => {
    const who = await signIn.identify({ accessToken });
    if (!who.ok) return who;
    const account = await accountOfSignIn(who.value.accountId, who.value.email);
    if (!account.ok) return account;
    return ok({ ...who.value, accountId: account.value });
  };

  return {
    findLeague: (shortName) =>
      database.withTransaction(db, {}, (scope) => database.findLeagueByShortName(scope, shortName)),
    findLeagueById: async (leagueId) => {
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
    publicStats: notMovedYet('public standings and statistics'),
    games: notMovedYet('games area'),
    fixtureImport: notMovedYet('fixture import'),
    publicSchedule: notMovedYet('public schedule'),
    scheduleAdmin: notMovedYet('schedule grid'),
    publicTeams: notMovedYet('public teams pages'),
    adminTeams: notMovedYet('Admin → Teams'),
    adminSettings: notMovedYet('league settings'),
    tracker: notMovedYet('tracker'),
    publishPlays: async () => {
      throw new NotOnTheDatabaseYet('tracker');
    },
    // No live hub until the tracker moves: nothing would publish to it.
    liveFeed: null,
  };
}
