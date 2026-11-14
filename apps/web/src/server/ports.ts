// What the web app's pages need from outside, as one object (T-21: the app wires
// adapters to core). container.ts chooses which adapters fill it: the made-up
// stand-ins for local work and tests, or the database for staging and production.
import type { AccessHolder, CommandContext, Result } from '@srleagues/core';
import type { SessionError, SessionIdentity, SignInService } from '@srleagues/providers';
import type { Renew } from './sign-in/renew-session.ts';
import type { SignInMail } from './sign-in/sign-in-mail.ts';
import type { ContextDeps } from './context.ts';
import type { FixtureImportPorts } from './fixture-import-ports.ts';
import type { GamesAreaPorts } from './games-area-ports.ts';
import type { PublicSchedulePorts } from './public-schedule.ts';
import type { PublicStatsPorts } from './public-stats.ts';
import type { ScheduleAdminPorts } from './schedule-admin.ts';
import type { AdminTeamsPorts } from './admin-teams.ts';

export type WebPorts = Omit<ContextDeps, 'siteOrigin'> & {
  /** "Who is this?" for a session cookie's access token (T-6). */
  readonly identify: (accessToken: string) => Promise<Result<SessionIdentity, SessionError>>;
  /** The sign-in service (T-6): the local stand-in, or Supabase (record 018). */
  readonly signIn: SignInService;
  /** The sign-in emails, through our own email service (T4 §3). */
  readonly signInMail: SignInMail;
  /** The service's renew, shared for requests sent at once (renew-session.ts). */
  readonly renewSession: Renew;
  /**
   * What the signed-in account holds in the context's league, read fresh by the
   * access module's own query (myAccess, T-75); undefined for a visitor, or when the
   * league is in the bin.
   */
  readonly accessOf: (context: CommandContext) => Promise<AccessHolder | undefined>;
  /** What the public standings and statistics pages read (step 2.43). */
  readonly publicStats: PublicStatsPorts;
  /** What the admin's games area runs on (step 2.55). */
  readonly games: GamesAreaPorts;
  /** What the admin's fixture import screen runs on (step 2.54). */
  readonly fixtureImport: FixtureImportPorts;
  /** What the public home and schedule pages read (step 2.42). */
  readonly publicSchedule: PublicSchedulePorts;
  /** What Admin → Schedule runs its commands on (step 2.52). */
  readonly scheduleAdmin: ScheduleAdminPorts;
  /** What the admin's Teams screens read and run (step 2.51). */
  readonly adminTeams: AdminTeamsPorts;
};
