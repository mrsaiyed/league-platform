// THE WEB APP'S LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY, NEVER FOR PRODUCTION.
//
// Made-up leagues and people held in this process's memory (T-201), so the shell can
// be opened and tested with no database and no sign-in service. container.ts uses it
// only when APP_ENV is local or test, and it refuses to be made for any other, or
// for a site address that is not this computer or a test name (PUBLIC_BASE_URL on
// localhost, 127.0.0.1, [::1], *.localhost or *.test), so a wrong APP_ENV on a real
// server still cannot hand out its made-up sign-ins.
//
// Being someone: the sign-in screens (step 1.14) run on the sign-in stand-in of
// packages/providers, in this process's memory, its emails caught by the email
// capture instead of sent (T-140). Beside it, the four made-up people below are
// "signed in" when the browser's session cookie holds their made-up token, so the
// shell's checks can be someone who holds roles in the made-up leagues; nothing
// about that works outside this file.
//
// Reads go through the access module's own query (myAccess) on an in-memory
// transaction; this stand-in cannot change anything.
import {
  fail,
  ok,
  type AccessTx,
  type CommandDeps,
  type Grant,
  type LeagueStatus,
  type Role,
} from '@srleagues/core';
import { captureEmail, createLocalSignInStandIn, type SessionIdentity } from '@srleagues/providers';
import { randomUUID } from 'node:crypto';
import { accessOfVia } from './access-of.ts';
import type { FoundLeague, LeagueById } from './context.ts';
import type { WebPorts } from './ports.ts';
import { sharedRenewal } from './sign-in/renew-session.ts';
import { createSignInMail } from './sign-in/sign-in-mail.ts';

type MadeUpLeague = {
  readonly id: string;
  readonly slug: string;
  readonly status: LeagueStatus;
  readonly inBin: boolean;
  readonly ownerAccountId: string;
  /** Former short names, still forwarding (U-7). */
  readonly formerSlugs: readonly string[];
};

type MadeUpPerson = { readonly accountId: string; readonly token: string };

const id = (n: number) => `01900000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

/** The made-up people. A token is the session cookie's value for being that person. */
export const standInPeople = {
  owner: { accountId: id(0xa1), token: 'local-owner-token' },
  scheduler: { accountId: id(0xa2), token: 'local-scheduler-token' },
  coach: { accountId: id(0xa3), token: 'local-coach-token' },
  stranger: { accountId: id(0xa4), token: 'local-stranger-token' },
} as const satisfies Record<string, MadeUpPerson>;

const { owner, scheduler, coach } = standInPeople;

/** The made-up leagues, one in each state, all run by the made-up owner. */
export const standInLeagues = {
  live: league(1, 'north-valley', 'live', ['north-vale']),
  other: league(2, 'harbor-city', 'live'),
  draft: league(3, 'quiet-pines', 'draft', ['quiet-pine']),
  archived: league(4, 'old-meadow', 'archived'),
  suspended: league(5, 'closed-gate', 'suspended'),
  inBin: { ...league(6, 'binned-league', 'live'), inBin: true },
} as const satisfies Record<string, MadeUpLeague>;

function league(
  n: number,
  slug: string,
  status: LeagueStatus,
  formerSlugs: readonly string[] = [],
): MadeUpLeague {
  return { id: id(n), slug, status, inBin: false, ownerAccountId: owner.accountId, formerSlugs };
}

const grantOf = (n: number, accountId: string, role: Role, leagueId: string) => ({
  leagueId,
  grant: {
    id: id(0xd0 + n),
    accountId,
    role,
    scope: { type: 'league' },
    grantedByAccountId: owner.accountId,
    revokedAt: null,
  } satisfies Grant,
});

/** Who holds what, beside each league's owner. */
const grants = [
  grantOf(1, scheduler.accountId, 'scheduler', standInLeagues.live.id),
  grantOf(2, scheduler.accountId, 'scheduler', standInLeagues.draft.id),
  grantOf(3, coach.accountId, 'coach', standInLeagues.live.id),
  grantOf(4, coach.accountId, 'coach', standInLeagues.draft.id),
];

const leagues: readonly MadeUpLeague[] = Object.values(standInLeagues);

const signedInAt = new Date('2026-11-01T10:00:00Z');

function identityOf(person: MadeUpPerson): SessionIdentity {
  return {
    accountId: person.accountId,
    email: `${person.token}@example.test`,
    sessionId: `session-${person.token}`,
    hasPassword: true,
    passwordEnteredAt: signedInAt,
    lastSignInAt: signedInAt,
  };
}

const notInTheShell = (what: string) => async (): Promise<never> => {
  throw new Error(`The web app's stand-in cannot ${what}: it only reads.`);
};

/** An access transaction over the made-up data, for one league; it only reads. */
function accessTx(leagueId: string): AccessTx {
  const found = leagues.find((l) => l.id === leagueId && !l.inBin);
  return {
    jobs: { enqueue: notInTheShell('record jobs') },
    activity: { record: notInTheShell('write the activity log'), list: async () => [] },
    access: {
      ownerAccountId: async () => found?.ownerAccountId,
      leagueStatus: async () => found?.status,
      activeGrantsOf: async (accountId) =>
        found === undefined
          ? []
          : grants
              .filter((g) => g.leagueId === found.id && g.grant.accountId === accountId)
              .map((g) => g.grant),
      programExists: async () => false,
      hasPendingInvitation: async () => false,
      createInvitation: notInTheShell('invite'),
      findInvitation: async () => undefined,
      findInvitationByTokenHash: async () => undefined,
      renewInvitation: notInTheShell('re-send invitations'),
      replaceInvitationLink: notInTheShell('make invitation links'),
      cancelInvitation: notInTheShell('cancel invitations'),
      acceptInvitation: notInTheShell('accept invitations'),
      createGrant: notInTheShell('give access'),
      findGrant: async () => undefined,
      revokeGrant: notInTheShell('remove access'),
      listGrants: async () =>
        found === undefined
          ? []
          : grants.filter((g) => g.leagueId === found.id).map((g) => g.grant),
      listOpenInvitations: async () => [],
    },
  };
}

export type StandInOptions = {
  /** APP_ENV: the stand-in refuses to be made for anything but local or test. */
  readonly appEnv: string;
  /** PUBLIC_BASE_URL: the stand-in refuses any host but this computer's or a test name. */
  readonly publicBaseUrl: string;
  /** Where the access module's T-196 lines go. */
  readonly log: CommandDeps<AccessTx>['log'];
  /** EMAIL_FROM, the sign-in emails' sending address. */
  readonly emailFrom: string;
};

export function standInPorts(options: StandInOptions): WebPorts {
  if (options.appEnv !== 'local' && options.appEnv !== 'test') {
    throw new Error(
      `The web app's made-up stand-in is for local work and tests only, not "${options.appEnv}".`,
    );
  }
  if (!isLocalOrTestHost(options.publicBaseUrl)) {
    throw new Error(
      "The web app's made-up stand-in is for local work and tests only: PUBLIC_BASE_URL " +
        'must be on localhost, 127.0.0.1, [::1], or a name ending in .localhost or .test.',
    );
  }
  const people: readonly MadeUpPerson[] = Object.values(standInPeople);
  const now = () => new Date();
  // The capture keeps every email in memory and never fails, so no notice is lost.
  const signInMail = createSignInMail({
    sender: captureEmail({ now }),
    fromAddress: options.emailFrom,
    siteOrigin: options.publicBaseUrl,
    onNoticeFailed: () => undefined,
    now,
  });
  const { service: signIn } = createLocalSignInStandIn({
    environment: options.appEnv === 'local' ? 'development' : 'test',
    // The sign-in stand-in also refuses NODE_ENV "production", but Next.js's built
    // server always sets that, the test server of npm run test:web included. The
    // guards above (APP_ENV local or test, and a site address on this computer or a
    // test name) are this app's, so the stand-in is told the APP_ENV (record 031).
    nodeEnv: options.appEnv,
    codeSender: signInMail.codeSender,
    returnOrigins: [options.publicBaseUrl],
    now,
  });
  const deps: CommandDeps<AccessTx> = {
    transaction: (context, work) => work(accessTx(context.leagueId)),
    events: [],
    log: options.log,
    now: () => performance.now(),
  };
  return {
    findLeague: async (shortName): Promise<FoundLeague | undefined> => {
      const found = leagues.find((l) => l.slug === shortName || l.formerSlugs.includes(shortName));
      if (found === undefined) return undefined;
      return {
        leagueId: found.id,
        slug: found.slug,
        status: found.status,
        inBin: found.inBin,
        forwarded: found.slug !== shortName,
      };
    },
    findLeagueById: async (leagueId): Promise<LeagueById | undefined> => {
      const found = leagues.find((l) => l.id === leagueId && !l.inBin);
      return found === undefined
        ? undefined
        : { id: found.id, slug: found.slug, status: found.status };
    },
    newRequestId: () => randomUUID(),
    identify: async (accessToken) => {
      const person = people.find((p) => p.token === accessToken);
      return person === undefined ? signIn.identify({ accessToken }) : ok(identityOf(person));
    },
    signIn,
    signInMail,
    renewSession: sharedRenewal((refreshToken) => signIn.renew({ refreshToken }), now),
    accessOf: accessOfVia(deps),
  };
}

/** Whether `address` is on this computer, or on a name kept for tests (`.test`). */
export function isLocalOrTestHost(address: string): boolean {
  let host: string;
  try {
    host = new URL(address).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.localhost') ||
    host.endsWith('.test')
  );
}
