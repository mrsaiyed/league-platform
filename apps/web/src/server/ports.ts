// What the web app's pages need from outside, as one object (T-21: the app wires
// adapters to core). container.ts chooses which adapters fill it: the made-up
// stand-ins for local work and tests, or the database for staging and production.
//
// The imports, and each area's ports below (adminSettings to tracker), are in alphabetical
// order: a new area's go in their place, never at the end (step 2.188, record 072).
import type { OwnName, OwnNameStore } from '@srleagues/core';
import type {
  AccessHolder,
  AccountLeagueRow,
  CommandContext,
  Result,
  SiteFacts,
} from '@srleagues/core';
import type { BotCheck, SessionIdentity, SignInService } from '@srleagues/providers';
import type { AdminAccessPorts } from './admin-access.ts';
import type { AdminPeoplePorts } from './admin-people.ts';
import type { AdminSettingsPorts } from './admin-settings.ts';
import type { AdminTeamsPorts } from './admin-teams.ts';
import type { ContextDeps, IdentifyError } from './context.ts';
import type { FixtureImportPorts } from './fixture-import-ports.ts';
import type { GamesAreaPorts } from './games-area-ports.ts';
import type { LeagueSiteLookup } from './league-site.ts';
import type { LocalTools } from './local-tools.ts';
import type { PublicSchedulePorts } from './public-schedule.ts';
import type { PublicStatsPorts } from './public-stats.ts';
import type { PublicTeamsPorts } from './public-teams.ts';
import type { ScheduleAdminPorts } from './schedule-admin.ts';
import type { Renew } from './sign-in/renew-session.ts';
import type { SignInMail } from './sign-in/sign-in-mail.ts';
import type { PublishPlays } from './tracker-commands-endpoint.ts';
import type { TrackerPorts } from './tracker-ports.ts';

export type WebPorts = Omit<ContextDeps, 'siteOrigin'> & {
  /**
   * "Who is this?" for a session cookie's access token (T-6), as one of our accounts:
   * the service's refusal, or an AccountRefusal for a live session that is none of
   * our accounts' (record 055).
   */
  readonly identify: (accessToken: string) => Promise<Result<SessionIdentity, IdentifyError>>;
  /**
   * The signed-in person's own name (R-21, step 2.128, T-445). `accountOf` is the session's
   * account before the name gate (identify refuses a nameless account with `name-needed`),
   * for the one screen that asks the name; nothing else calls it.
   */
  readonly ownName: {
    readonly accountOf: (accessToken: string) => Promise<string | undefined>;
    readonly read: (accountId: string) => Promise<OwnName | undefined>;
    readonly store: OwnNameStore;
  };
  /**
   * Our own account's address (T-73, T-458): whether no other account in our records holds
   * one, a yes or a no only; and moving it once the sign-in service confirmed a change.
   */
  readonly ownEmail: {
    readonly isFree: (accountId: string, email: string) => Promise<boolean>;
    readonly change: (accountId: string, email: string) => Promise<'changed' | 'taken'>;
  };
  /** The sign-in service (T-6): the local stand-in, or Supabase (record 018). */
  readonly signIn: SignInService;
  /** The sign-in emails, through our own email service (T4 §3). */
  readonly signInMail: SignInMail;
  /**
   * The bot check in front of sign-in and sign-up (T4 §6, record 081): the local stand-in
   * on made-up data, Cloudflare Turnstile in staging and production (botCheckFor).
   */
  readonly botCheck: BotCheck;
  /** The service's renew, shared for requests sent at once (renew-session.ts). */
  readonly renewSession: Renew;
  /**
   * What the signed-in account holds in the context's league, read fresh by the
   * access module's own query (myAccess, T-75); undefined for a visitor, or when the
   * league is in the bin.
   */
  readonly accessOf: (context: CommandContext) => Promise<AccessHolder | undefined>;
  /**
   * The leagues the signed-in account belongs to (record 066): the product's one read across
   * leagues for an ordinary person, by the account the server's session gives, never one
   * from the request. Rows before the rule of what the person may see: only core's
   * myLeagues may turn them into a list, in its one caller (signed-in-leagues.ts).
   */
  readonly leaguesOfAccount: (accountId: string) => Promise<readonly AccountLeagueRow[]>;
  /** What the Admins page and the invitation's accept page run on (step 2.97). */
  readonly adminAccess: AdminAccessPorts;
  /**
   * Whether the database answers right now, for the health check (health.ts): true or
   * false, never an error. Null on the made-up stand-in, which has no database.
   */
  readonly databaseCheck: (() => Promise<boolean>) | null;
  /** What the admin's People screens run on (step 2.50). */
  readonly adminPeople: AdminPeoplePorts;
  /** What the admin's League settings screen runs on (step 2.48). */
  readonly adminSettings: AdminSettingsPorts;
  /** What the admin's Teams screens read and run (step 2.51). */
  readonly adminTeams: AdminTeamsPorts;
  /** What the admin's fixture import screen runs on (step 2.54). */
  readonly fixtureImport: FixtureImportPorts;
  /** What the admin's games area runs on (step 2.55). */
  readonly games: GamesAreaPorts;
  /** Each league's name and design, as its pages show them (league-site.ts). */
  readonly leagueSites: LeagueSiteLookup;
  /**
   * Each league's site notice and whether its public pages ask search engines not to
   * index them (step 2.60, core's readSiteFacts): read as no one, in one page snapshot.
   */
  readonly siteFactsOf: (leagueId: string) => Promise<SiteFacts>;
  /**
   * The kept emails' page and "be this made-up person" (step 2.96, local-tools.ts): only on
   * made-up data, null on a real database. The pages ask the app's mode first (local-only.ts).
   */
  readonly localTools: LocalTools | null;
  /** What the public home and schedule pages read (step 2.42). */
  readonly publicSchedule: PublicSchedulePorts;
  /** What the public standings and statistics pages read (step 2.43). */
  readonly publicStats: PublicStatsPorts;
  /** What the public teams pages and the members' start page read (step 2.44). */
  readonly publicTeams: PublicTeamsPorts;
  /** What Admin → Schedule runs its commands on (step 2.52). */
  readonly scheduleAdmin: ScheduleAdminPorts;
  /** What the tracker's endpoints run on (step 2.32). */
  readonly tracker: TrackerPorts;
  /** Publishes a game's newest state for the people watching, after a batch is saved (T-117). */
  readonly publishPlays: PublishPlays;
  /**
   * The page-facing door of the local live hub (`GET /api/v1/live`, record 021), which
   * only lets a page listen; null where pages listen to the live service itself (T-8).
   */
  readonly liveFeed: ((request: Request) => Promise<Response>) | null;
  /**
   * The made-up world in this process's memory (stand-in-world.ts), not a database: its
   * pages say so, and it answers only requests made on this computer (step 2.152).
   */
  readonly madeUpWorld: boolean;
  /**
   * Whether this is the test copy (APP_ENV staging, step 2.205): a real database that holds
   * only made-up data. Its pages say so in one line, and sign-up and a password reset take
   * only a made-up address (isMadeUpAddress), refused before the sign-in service is asked.
   * Production and local work: false.
   */
  readonly testCopy: boolean;
  /**
   * Whether a request with these headers may be answered at all. The made-up world, and any
   * ports that carry the local tools (the made-up database's), answer only one addressed to
   * this computer's names (or its own `.test` name) and not passed on by another server
   * (this-computer.ts, answersOnlyHere); a real database always answers.
   */
  readonly answers: (headers: Headers) => boolean;
};
