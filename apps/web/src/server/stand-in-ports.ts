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
import type { FoundLeague, LeagueById } from './context.ts';
import { liveListenAuthorize } from './live-listen.ts';
import type { WebPorts } from './ports.ts';
import { namePolicyOf } from './name-policy-of.ts';
import { standInAdminSettings } from './stand-in-admin-settings.ts';
import { createPlayPublisher } from './publish-plays.ts';
import { standInAdminTeams } from './stand-in-admin-teams.ts';
import { standInFixtureImport } from './stand-in-fixture-import.ts';
import { standInGames } from './stand-in-games.ts';
import { standInPublicSchedule } from './stand-in-public-schedule.ts';
import {
  adultTeams,
  standInPublicStats,
  standInSeasonIds,
  youthTeams,
} from './stand-in-public-stats.ts';
import { standInSchedule } from './stand-in-schedule.ts';
import { standInPublicTeams } from './stand-in-public-teams.ts';
import { sharedRenewal } from './sign-in/renew-session.ts';
import { createSignInMail } from './sign-in/sign-in-mail.ts';
import type { TrackerPorts } from './tracker-ports.ts';

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
  scorekeeper: { accountId: id(0xa5), token: 'local-scorekeeper-token' },
  // The other staff roles, in the draft league only (step 2.87).
  admin: { accountId: id(0xa6), token: 'local-admin-token' },
  registrar: { accountId: id(0xa7), token: 'local-registrar-token' },
  editor: { accountId: id(0xa8), token: 'local-editor-token' },
  clubAdmin: { accountId: id(0xa9), token: 'local-club-admin-token' },
  /** A scheduler for one program of the draft league only. */
  programScheduler: { accountId: id(0xaa), token: 'local-program-scheduler-token' },
  /** The admin of another league, a draft too, and nothing in the others. */
  otherAdmin: { accountId: id(0xab), token: 'local-other-admin-token' },
} as const satisfies Record<string, MadeUpPerson>;

const { owner, scheduler, coach, scorekeeper } = standInPeople;

/**
 * The made-up leagues, one in each state, all owned by the made-up owner, and a
 * second draft league with an admin of its own who holds nothing elsewhere, to show
 * that one draft's staff do not see another's.
 */
export const standInLeagues = {
  live: league(1, 'north-valley', 'live', ['north-vale']),
  other: league(2, 'harbor-city', 'live'),
  draft: league(3, 'quiet-pines', 'draft', ['quiet-pine']),
  archived: league(4, 'old-meadow', 'archived'),
  suspended: league(5, 'closed-gate', 'suspended'),
  inBin: { ...league(6, 'binned-league', 'live'), inBin: true },
  otherDraft: league(7, 'still-waters', 'draft'),
} as const satisfies Record<string, MadeUpLeague>;

function league(
  n: number,
  slug: string,
  status: LeagueStatus,
  formerSlugs: readonly string[] = [],
): MadeUpLeague {
  return { id: id(n), slug, status, inBin: false, ownerAccountId: owner.accountId, formerSlugs };
}

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
    id: id(0xc1),
  }),
  grantOf(12, standInPeople.otherAdmin.accountId, 'admin', standInLeagues.otherDraft.id),
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
  /** Where a sign-in email that could not be sent is reported: its kind only (T-86). */
  readonly warn?: (message: string, fields: { readonly kind: string }) => void;
};

/**
 * A made-up member who signs in with a password on the sign-in stand-in, made when
 * the app starts (signUpMadeUpMember), so checks can compare an address that has an
 * account with one that has none (T-68).
 */
export const standInMember = {
  email: 'member@example.test',
  password: 'made-up member password',
} as const;

export type StandInPorts = WebPorts & {
  /** Gives standInMember an account, through the sign-in service's own steps. */
  readonly signUpMadeUpMember: () => Promise<void>;
};

export function standInPorts(options: StandInOptions): StandInPorts {
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
    return person === undefined ? signIn.identify({ accessToken }) : ok(identityOf(person));
  };
  const accessOf = accessOfVia(deps);
  // The League settings screen's settings: the public pages read how names show from them.
  const adminSettings = standInAdminSettings({
    accessOf: (leagueId) => accessTx(leagueId).access,
    log: options.log,
  });
  const namesShown = namePolicyOf(adminSettings.deps);
  const games = standInGames({
    namePolicyOf: namesShown,
    leagueId: standInLeagues.live.id,
    people: {
      [owner.accountId]: 'Olive Owner',
      [scheduler.accountId]: 'Sky Scheduler',
      [scorekeeper.accountId]: 'Sam Scorekeeper',
    },
    assignees: [scorekeeper.accountId, owner.accountId],
    accessOf: (leagueId) => accessTx(leagueId).access,
    log: options.log,
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
    games,
    tracker,
    publishPlays: createPlayPublisher({
      ...tracker,
      warn: (message, fields) => options.warn?.(message, { kind: fields.reason }),
    }),
    liveFeed: (request) => hub.serve(request),
    fixtureImport: standInFixtureImport({
      leagueId: standInLeagues.live.id,
      accessOf: (leagueId) => accessTx(leagueId).access,
      log: options.log,
    }),
    publicStats: standInPublicStats(
      { adultLeagueId: standInLeagues.live.id, youthLeagueId: standInLeagues.other.id },
      namesShown,
    ),
    adminTeams: standInAdminTeams({
      accessOf: (leagueId) => accessTx(leagueId).access,
      log: options.log,
      seededLeagueId: standInLeagues.live.id,
    }),
    adminSettings,
    publicSchedule: standInPublicSchedule(
      { adultLeagueId: standInLeagues.live.id, youthLeagueId: standInLeagues.other.id },
      now,
    ),
    scheduleAdmin: standInSchedule({
      leagues: [
        {
          leagueId: standInLeagues.live.id,
          seasonId: standInSeasonIds.adultFall,
          teams: adultTeams.map((t) => ({ id: t.id, name: t.name })),
          rounds: 6,
        },
        {
          leagueId: standInLeagues.other.id,
          seasonId: standInSeasonIds.youthWinter,
          teams: youthTeams.map((t) => ({ id: t.id, name: t.name })),
          rounds: 4,
        },
      ],
      accessFor: (leagueId) => accessTx(leagueId).access,
      log: options.log,
      today: () => new Date().toISOString().slice(0, 10),
    }),
    publicTeams: standInPublicTeams(
      { adultLeagueId: standInLeagues.live.id, youthLeagueId: standInLeagues.other.id },
      coach.accountId,
    ),
    signUpMadeUpMember: async () => {
      const here = '127.0.0.1';
      const { email, password } = standInMember;
      const asked = await signIn.startSignUp({ email, networkAddress: here });
      // The code email is handed over without waiting: let it reach the capture.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const sent = outbox.messages().findLast((m) => m.to === email);
      const code = /\b(\d{6})\b/.exec(sent?.text ?? '')?.[1];
      if (!asked.ok || code === undefined) throw new Error('The made-up member got no code.');
      const proved = await signIn.verifyCode({ email, code, networkAddress: here });
      if (!proved.ok) throw new Error('The made-up member could not be proved.');
      const set = await signIn.setPassword({
        proof: proved.value.proof,
        password,
        device: { deviceId: 'made-up-member-device', label: 'made-up', networkAddress: here },
      });
      if (!set.ok) throw new Error('The made-up member could not choose a password.');
      await signIn.signOut({ accessToken: set.value.session.accessToken });
    },
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
