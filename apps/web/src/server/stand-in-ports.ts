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
// capture instead of sent (T-140). Beside it, the made-up people below are
// "signed in" when the browser's session cookie holds their made-up token, so the
// shell's checks can be someone who holds roles in the made-up leagues; nothing
// about that works outside this file. Since step 2.127 the made-up owner, scheduler,
// scorekeeper and coach, and the made-up member, also sign in through the form with a
// made-up password (stand-in-sign-ins.ts), so the product can be walked by tapping.
//
// Who holds what is read through the access module's own query (myAccess) on an
// in-memory transaction that cannot change it. Everything else a league holds is the
// one made-up world (stand-in-world.ts, seeded by stand-in-world-seed.ts), which every
// area reads and writes through the product's own commands; it is made again each time
// the server starts.
import {
  ok,
  type AccessTx,
  type CommandDeps,
  type Grant,
  type Role,
  type Scope,
} from '@srleagues/core';
import {
  captureEmail,
  createLocalLiveHub,
  createLocalSignInStandIn,
  type SessionIdentity,
} from '@srleagues/providers';
import { randomUUID } from 'node:crypto';
import { accessOfVia } from './access-of.ts';
import {
  castId,
  standInDraftProgramId,
  standInLeagues,
  standInPeople,
  standInSeedCast,
} from './stand-in-cast.ts';
import type { FoundLeague, LeagueById } from './context.ts';
import { liveListenAuthorize } from './live-listen.ts';
import type { WebPorts } from './ports.ts';
import { namePolicyOf, namesShownOf } from './name-policy-of.ts';
import { standInAdminSettings } from './stand-in-admin-settings.ts';
import { createPlayPublisher } from './publish-plays.ts';
import { standInAdminTeams } from './stand-in-admin-teams.ts';
import { standInFixtureImport } from './stand-in-fixture-import.ts';
import { standInGames } from './stand-in-games.ts';
import { standInPublicSchedule } from './stand-in-public-schedule.ts';
import { standInPublicStats } from './stand-in-public-stats.ts';
import { standInSchedule } from './stand-in-schedule.ts';
import { standInPublicTeams } from './stand-in-public-teams.ts';
import { standInMyLeagues } from './stand-in-my-leagues.ts';
import {
  madeUpAccountOf,
  standInMemberAccountId,
  standInStaffSignIns,
} from './stand-in-sign-ins.ts';
import { madeUpLeagues } from './stand-in-world-seed.ts';
import { madeUpWorld } from './stand-in-world.ts';
import { sharedRenewal } from './sign-in/renew-session.ts';
import { createSignInMail } from './sign-in/sign-in-mail.ts';
import type { TrackerPorts } from './tracker-ports.ts';

export { standInDraftProgramId, standInLeagues, standInPeople } from './stand-in-cast.ts';

type MadeUpPerson = { readonly accountId: string; readonly token: string };

const id = castId;

const { owner, scheduler, coach, scorekeeper } = standInPeople;

const grantOf = (
  n: number,
  accountId: string,
  role: Role,
  leagueId: string,
  scope: Scope = { type: 'league' },
) => ({
  leagueId,
  grant: {
    id: id(0xd0 + n),
    accountId,
    role,
    scope,
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
  grantOf(5, scorekeeper.accountId, 'scorekeeper', standInLeagues.live.id),
  grantOf(6, scorekeeper.accountId, 'scorekeeper', standInLeagues.draft.id),
  grantOf(7, standInPeople.admin.accountId, 'admin', standInLeagues.draft.id),
  grantOf(8, standInPeople.registrar.accountId, 'registrar', standInLeagues.draft.id),
  grantOf(9, standInPeople.editor.accountId, 'editor', standInLeagues.draft.id),
  grantOf(10, standInPeople.clubAdmin.accountId, 'club_admin', standInLeagues.draft.id),
  grantOf(11, standInPeople.programScheduler.accountId, 'scheduler', standInLeagues.draft.id, {
    type: 'program',
    id: standInDraftProgramId,
  }),
  grantOf(12, standInPeople.otherAdmin.accountId, 'admin', standInLeagues.otherDraft.id),
  // A scorekeeper still holding the role in an archived league is told it is archived,
  // not "no access" (step 2.33).
  grantOf(13, scorekeeper.accountId, 'scorekeeper', standInLeagues.archived.id),
];

const leagues: readonly (typeof standInLeagues)[keyof typeof standInLeagues][] =
  Object.values(standInLeagues);

const signedInAt = new Date('2026-11-01T10:00:00Z');

function identityOf(person: MadeUpPerson): SessionIdentity {
  return {
    accountId: person.accountId,
    email: `${person.token}@example.test`,
    emailConfirmed: true,
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
  /** Where a sign-in email that could not be sent is reported: its kind only (T-86). */
  readonly warn?: (message: string, fields: { readonly kind: string }) => void;
};

/**
 * A made-up member who signs in with a password on the sign-in stand-in, made when
 * the app starts (signUpMadeUpMember), so checks can compare an address that has an
 * account with one that has none (T-68). Its password is written here, on the stand-in and
 * on the made-up database alike, so in local work and tests the server listens on this
 * computer's loopback address only, whatever LOCAL_DATA says (scripts/web-listen.mjs).
 */
export const standInMember = {
  email: 'member@example.test',
  password: 'made-up member password',
} as const;

export type StandInPorts = WebPorts & {
  /** Gives standInMember an account, through the sign-in service's own steps. */
  readonly signUpMadeUpMember: () => Promise<void>;
  /**
   * Gives the made-up staff who sign in with a password (stand-in-sign-ins.ts) their
   * accounts on the sign-in stand-in, through the same steps. The stand-in only.
   */
  readonly signUpMadeUpStaff: () => Promise<void>;
};

/** The sign-in stand-in and its emails, for the stand-in and for the made-up database. */
export type StandInSignIn = Pick<StandInPorts, 'signIn' | 'signInMail' | 'signUpMadeUpMember'> & {
  /** Gives one made-up address an account with this password, through the service's steps. */
  readonly signUpMadeUp: (email: string, password: string) => Promise<void>;
};

/**
 * The sign-in screens' stand-in (record 031), with the same refusals as the stand-in
 * itself: local work and tests only, on this computer or a test name. The made-up
 * database (record 055) signs people in with it too.
 */
export function standInSignIn(options: StandInOptions): StandInSignIn {
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
  const now = () => new Date();
  const outbox = captureEmail({ now });
  const signInMail = createSignInMail({
    sender: outbox,
    fromAddress: options.emailFrom,
    siteOrigin: options.publicBaseUrl,
    onNoticeFailed: (kind) => options.warn?.('sign-in email not sent', { kind }),
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
  const signUpMadeUp = async (email: string, password: string) => {
    const here = '127.0.0.1';
    const asked = await signIn.startSignUp({ email, networkAddress: here });
    // The code email is handed over without waiting: let it reach the capture.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const sent = outbox.messages().findLast((m) => m.to === email);
    const code = /\b(\d{6})\b/.exec(sent?.text ?? '')?.[1];
    if (!asked.ok || code === undefined) throw new Error('A made-up person got no code.');
    const proved = await signIn.verifyCode({ email, code, networkAddress: here });
    if (!proved.ok) throw new Error('A made-up person could not be proved.');
    const set = await signIn.setPassword({
      proof: proved.value.proof,
      password,
      device: { deviceId: 'made-up-person-device', label: 'made-up', networkAddress: here },
    });
    if (!set.ok) throw new Error('A made-up person could not choose a password.');
    await signIn.signOut({ accessToken: set.value.session.accessToken });
  };
  return {
    signIn,
    signInMail,
    signUpMadeUp,
    signUpMadeUpMember: () => signUpMadeUp(standInMember.email, standInMember.password),
  };
}

export function standInPorts(options: StandInOptions): StandInPorts {
  const { signIn, signInMail, signUpMadeUpMember, signUpMadeUp } = standInSignIn(options);
  const people: readonly MadeUpPerson[] = Object.values(standInPeople);
  const now = () => new Date();
  const deps: CommandDeps<AccessTx> = {
    transaction: (context, work) => work(accessTx(context.leagueId)),
    events: [],
    log: options.log,
    now: () => performance.now(),
  };
  const findLeagueById = async (leagueId: string): Promise<LeagueById | undefined> => {
    const found = leagues.find((l) => l.id === leagueId && !l.inBin);
    return found === undefined
      ? undefined
      : { id: found.id, slug: found.slug, status: found.status };
  };
  const identify: WebPorts['identify'] = async (accessToken) => {
    const person = people.find((p) => p.token === accessToken);
    if (person !== undefined) return ok(identityOf(person));
    const who = await signIn.identify({ accessToken });
    if (!who.ok) return who;
    // A made-up person who signed in through the form is their made-up account, by the
    // address the sign-in stand-in proved (stand-in-sign-ins.ts).
    const madeUp = madeUpAccountOf(who.value.email, standInMember.email, standInPeople);
    return madeUp === undefined ? who : ok({ ...who.value, accountId: madeUp });
  };
  const accessOf = accessOfVia(deps);
  // The one made-up world: every area below reads and writes the same rows (step 2.152).
  const world = madeUpWorld({
    leagues: madeUpLeagues(standInSeedCast, now()),
    accessOf: (leagueId) => accessTx(leagueId).access,
    log: options.log,
  });
  // The League settings screen's settings: every area reads them from the same world, and
  // the Privacy settings read who plays there and whether anyone is recorded as a child
  // from its rows too (record 065), so they never say something the public pages do not.
  const adminSettings = standInAdminSettings(world);
  const namePolicy = namePolicyOf(adminSettings.deps);
  // Who plays in each made-up league and how it shows names, read by every page that
  // shows a name (R-15).
  const namesShown = namesShownOf(namePolicy, world.audienceOf);
  const games = standInGames(world, {
    namesShownOf: namesShown,
    people: {
      [owner.accountId]: 'Olive Owner',
      [scheduler.accountId]: 'Sky Scheduler',
      [scorekeeper.accountId]: 'Sam Scorekeeper',
      [standInPeople.admin.accountId]: 'Avery Admin',
    },
  });
  // One live hub for this process (record 021): the tracker's endpoints publish to it,
  // and GET /api/v1/live lets a page listen, only to a league it may open.
  const hub = createLocalLiveHub({
    authorize: liveListenAuthorize({
      identify,
      findLeagueById,
      accessOf,
      newRequestId: () => randomUUID(),
    }),
  });
  const tracker: TrackerPorts = { ...games.tracker, publisher: hub };
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
    findLeagueById,
    newRequestId: () => randomUUID(),
    identify,
    signIn,
    signInMail,
    renewSession: sharedRenewal((refreshToken) => signIn.renew({ refreshToken }), now),
    accessOf,
    leaguesOfAccount: standInMyLeagues({
      leagues,
      accessOf: (leagueId) => accessTx(leagueId).access,
      // Roster places are the world's rows: the made-up coach is the person on a team of
      // each seeded league there (standInSeedCast.memberAccountId).
      world,
      // The made-up member who signs in with a password is no person in the world's rows.
      // They play in both public leagues, and in the draft league, which they may not see
      // before it is published (U-9).
      placesBeyondTheWorld: {
        [standInMemberAccountId]: [
          standInLeagues.live.id,
          standInLeagues.other.id,
          standInLeagues.draft.id,
        ],
      },
    }),
    games,
    tracker,
    publishPlays: createPlayPublisher({
      ...tracker,
      warn: (message, fields) => options.warn?.(message, { kind: fields.reason }),
    }),
    liveFeed: (request) => hub.serve(request),
    madeUpWorld: true,
    // The made-up owner's cookie is in the code and the world takes writes. Other computers
    // cannot connect at all: the server listens on the loopback address alone
    // (scripts/web-listen.mjs). This keeps out what can still arrive on this computer
    // (review 2, M1): a request for another name, or one passed on by another server.
    answers: answersOnlyHere(options.publicBaseUrl),
    fixtureImport: standInFixtureImport(world),
    publicStats: standInPublicStats(world, namePolicy),
    adminTeams: standInAdminTeams(world),
    adminSettings,
    publicSchedule: standInPublicSchedule(world),
    scheduleAdmin: standInSchedule(world),
    publicTeams: standInPublicTeams(world, namePolicy),
    signUpMadeUpMember,
    signUpMadeUpStaff: async () => {
      for (const person of Object.values(standInStaffSignIns)) {
        await signUpMadeUp(person.email, person.password);
      }
    },
  };
}

/** A Host header that is only a name or an address, and a port: nothing a URL reads otherwise. */
const plainHost =
  /^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*|\[[0-9a-f:]+\]|\d{1,3}(?:\.\d{1,3}){3})(?::\d{1,5})?$/i;

/**
 * The loopback address as the server's own socket gives it. Next.js writes it into
 * X-Forwarded-For when a request carries none, so it alone says nothing was passed on.
 */
const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** A URL's host name in small letters, or '' when it is not a URL. */
function hostnameOf(address: string): string {
  try {
    return new URL(address).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** This computer's own names: they reach only the loopback address. */
function isThisComputer(host: string): boolean {
  return (
    host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')
  );
}

/** Whether `address` is on this computer, or on a name kept for tests (`.test`). */
export function isLocalOrTestHost(address: string): boolean {
  const host = hostnameOf(address);
  return isThisComputer(host) || host.endsWith('.test');
}

/**
 * Which requests the made-up stand-in answers (step 2.152, review 2 M1). Only one
 * addressed by its Host header to this computer's own names, or to the one `.test` name
 * PUBLIC_BASE_URL gives (review 2 L1), and carrying no sign of having been passed on by
 * another server: no Forwarded or Via header, no X-Forwarded-Host other than its own Host,
 * no X-Forwarded-For other than the loopback address Next.js itself writes. A program on
 * this computer that passes requests on and removes those headers is not told apart: the
 * loopback address is what keeps other computers out.
 */
export function answersOnlyHere(publicBaseUrl: string): (headers: Headers) => boolean {
  const ownTestName = hostnameOf(publicBaseUrl);
  return (headers) => {
    const host = headers.get('host') ?? '';
    if (!plainHost.test(host)) return false;
    const name = hostnameOf(`http://${host}`);
    if (!isThisComputer(name) && !(name.endsWith('.test') && name === ownTestName)) return false;
    if (headers.has('forwarded') || headers.has('via')) return false;
    const forwardedHost = headers.get('x-forwarded-host');
    if (forwardedHost !== null && forwardedHost !== host) return false;
    const forwardedFor = headers.get('x-forwarded-for');
    return forwardedFor === null || loopbackAddresses.has(forwardedFor.trim());
  };
}
