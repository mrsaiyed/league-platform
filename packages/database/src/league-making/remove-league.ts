// Removing a league made by mistake from this computer (step 2.150, record 063, T-266),
// the twin of makeLeague: for scripts/remove-league.mjs. `previewLeagueRemoval` says
// what would happen and changes nothing; `removeLeague` removes it.
//
// `removeLeague`, in this order:
//   1. asks each login whether it may do its part, as the maker does (probeLogins and
//      the migration check), and whether the migration login may run the removal
//      (probe-removal-login.ts); any refusal changes nothing;
//   2. finds the league by its short name and our staff member's account by email
//      (the tool makes no account);
//   3. runs core's removeDraftLeague as our staff, in one transaction of the migration
//      login set to that league and account (removal-transaction.ts): the database
//      locks the league, checks it is exactly what the maker writes, writes the
//      platform log's entry, and removes the league's two activity-log rows, its
//      season, its program and the league (remove_draft_league, 0017);
//   4. only then, in a transaction of its own, removes the owner's account if the
//      database shows it was made ahead and never used (owner-account.ts);
//   5. reads back what is left, for the person to see.
// It never throws: anything unexpected comes back as an outcome that says whether the
// league is still there, read again on a new connection, never more than is known.
import {
  removeDraftLeague,
  type CommandDeps,
  type LeagueRemovalFinding,
  type LeagueRemovalTx,
} from '@srleagues/core';
import type { MigrationDriver } from '../migrations/index.ts';
import type { LeagueMakingTarget } from './league-making-target.ts';
import { accountByEmail, leagueHoldingShortName } from './login-queries.ts';
import { targetProblem, type TargetProblem } from './make-league.ts';
import {
  ownerAccountKept,
  removeOwnerAccountIfUnused,
  type AccountKept,
  type OwnerAccountOutcome,
} from './owner-account.ts';
import { migrationLoginMayRemove } from './probe-removal-login.ts';
import {
  leagueRowsLeft,
  leagueStillThere,
  leagueToRemove,
  platformLogEntry,
  type LeagueToRemove,
  type PlatformLogEntry,
} from './removal-queries.ts';
import { removalTransaction } from './removal-transaction.ts';

/** Which league, and who of our staff removes it. */
export type LeagueRemovalRequest = { readonly slug: string; readonly staffEmail: string };

/** The maker's questions, then whether the migration login may run the removal. */
async function removalTargetProblem(
  target: LeagueMakingTarget,
): Promise<TargetProblem | undefined> {
  const problem = await targetProblem(target);
  if (problem !== undefined) return problem;
  if (await migrationLoginMayRemove(target.login)) return undefined;
  return { kind: 'login', problems: [{ login: 'migration', gaps: ['removal'] }] };
}

export type LeagueRemovalPreview =
  | { readonly ready: false; readonly problem: TargetProblem }
  /** No league holds that short name (or it was removed already). */
  | { readonly ready: true; readonly league: undefined }
  | {
      readonly ready: true;
      readonly league: LeagueToRemove;
      /** Our staff member's account, or undefined when that email has none. */
      readonly staffAccountId: string | undefined;
      /** Why the owner's account would be kept; empty when it would be removed too. */
      readonly ownerKept: readonly AccountKept[];
    };

/** What would happen. Reads only. */
export async function previewLeagueRemoval(
  target: LeagueMakingTarget,
  request: LeagueRemovalRequest,
): Promise<LeagueRemovalPreview> {
  const problem = await removalTargetProblem(target);
  if (problem !== undefined) return { ready: false, problem };
  const leagueId = await leagueHoldingShortName(target.login, request.slug);
  const league = leagueId === undefined ? undefined : await leagueToRemove(target.login, leagueId);
  if (league === undefined) return { ready: true, league: undefined };
  const staff = await accountByEmail(target.login, request.staffEmail);
  return {
    ready: true,
    league,
    staffAccountId: staff?.accountId,
    ownerKept: await ownerAccountKept(
      target.login,
      league.ownerAccountId,
      staff?.accountId ?? '',
      league.leagueId,
    ),
  };
}

/** What the database holds afterwards, read back. */
export type RemovalReadBack = {
  /** The platform log's entry, or undefined when it is not there. */
  readonly entry: PlatformLogEntry | undefined;
  /** Rows of the league left in any table, the league's own row included. */
  readonly rowsLeft: number;
  readonly shortNameFree: boolean;
  readonly ownerAccountThere: boolean;
};

export type RemovedLeague = {
  readonly leagueId: string;
  readonly slug: string;
  readonly name: string;
  readonly logEntryId: string;
  readonly ownerEmail: string;
  readonly owner: OwnerAccountOutcome;
  /** Undefined when it could not be read back. */
  readonly readBack: RemovalReadBack | undefined;
};

export type RemoveLeagueProblem =
  | TargetProblem
  | { readonly kind: 'not-found' }
  | { readonly kind: 'staff-unknown' }
  | { readonly kind: 'short-name-differs' }
  | { readonly kind: 'in-use'; readonly found: readonly LeagueRemovalFinding[] }
  /**
   * Something unexpected stopped it. `league` says whether the league is still there
   * (the removal is one transaction: all of it or none), 'unknown' when even that
   * could not be read. `reason` is an error code, never a message.
   */
  | {
      readonly kind: 'failed';
      readonly league: 'removed' | 'not-removed' | 'unknown';
      readonly reason?: string;
    };

export type RemoveLeagueOutcome =
  | { readonly ok: true; readonly removed: RemovedLeague }
  | { readonly ok: false; readonly problem: RemoveLeagueProblem };

export type RemoveLeagueOptions = { readonly now?: () => number };

/** A short error code (SQLSTATE such as 23503, or ECONNRESET), never a message. */
function reasonOf(error: unknown): string | undefined {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && /^[A-Z0-9_]{2,24}$/.test(code) ? code : undefined;
}

/** Removes the league, then its owner's account if unused. Never throws. */
export async function removeLeague(
  target: LeagueMakingTarget,
  request: LeagueRemovalRequest & { readonly typedSlug: string },
  { now = () => Date.now() }: RemoveLeagueOptions = {},
): Promise<RemoveLeagueOutcome> {
  let leagueId: string | undefined;
  let commandRan = false;
  try {
    // Asked again here, not only in the preview: things may have changed meanwhile.
    const problem = await removalTargetProblem(target);
    if (problem !== undefined) return { ok: false, problem };
    leagueId = await leagueHoldingShortName(target.login, request.slug);
    const league =
      leagueId === undefined ? undefined : await leagueToRemove(target.login, leagueId);
    if (leagueId === undefined || league === undefined) {
      return { ok: false, problem: { kind: 'not-found' } };
    }
    const staff = await accountByEmail(target.login, request.staffEmail);
    if (staff === undefined) return { ok: false, problem: { kind: 'staff-unknown' } };

    const deps: CommandDeps<LeagueRemovalTx> = {
      transaction: removalTransaction(target.login, [staff.accountId]),
      events: [],
      log: () => {},
      now,
    };
    commandRan = true;
    const result = await removeDraftLeague(
      { leagueId, accountId: staff.accountId, requestId: `remove-league-${league.slug}` },
      { typedSlug: request.typedSlug },
      deps,
    );
    if (!result.ok) {
      const { error } = result;
      if (error.code === 'league-not-found') return { ok: false, problem: { kind: 'not-found' } };
      if (error.code === 'league-in-use') {
        return { ok: false, problem: { kind: 'in-use', found: error.found } };
      }
      if (error.code === 'short-name-differs' || error.code === 'invalid-input') {
        return { ok: false, problem: { kind: 'short-name-differs' } };
      }
      // Refused as not our staff: it cannot be, since this run names them.
      return { ok: false, problem: { kind: 'failed', league: 'not-removed', reason: error.code } };
    }
    const removed = result.value;
    const owner = await removeOwnerAccountIfUnused(
      target.login,
      { accountId: removed.ownerAccountId, email: league.ownerEmail },
      staff.accountId,
    );
    return {
      ok: true,
      removed: {
        leagueId,
        slug: removed.slug,
        name: removed.name,
        logEntryId: removed.logEntryId,
        ownerEmail: league.ownerEmail,
        owner,
        readBack: await readBack(target.login, removed, request.slug),
      },
    };
  } catch (error) {
    return {
      ok: false,
      problem: await failed(target, commandRan ? leagueId : undefined, reasonOf(error)),
    };
  }
}

/** What is left, read back; undefined when it cannot be read. */
async function readBack(
  login: MigrationDriver,
  removed: {
    readonly leagueId: string;
    readonly logEntryId: string;
    readonly ownerAccountId: string;
  },
  slug: string,
): Promise<RemovalReadBack | undefined> {
  try {
    const { rows } = await login.query<{ there: boolean }>(
      'select exists (select 1 from public.accounts where id = $1) as there',
      [removed.ownerAccountId],
    );
    return {
      entry: await platformLogEntry(login, removed.logEntryId),
      rowsLeft: await leagueRowsLeft(login, removed.leagueId),
      shortNameFree: (await leagueHoldingShortName(login, slug)) === undefined,
      ownerAccountThere: rows[0]?.there === true,
    };
  } catch {
    return undefined;
  }
}

/**
 * After something unexpected: whether the league is still there, read on a new
 * connection. Before the command ran, surely not removed; 'unknown' when it cannot
 * be read.
 */
async function failed(
  target: LeagueMakingTarget,
  leagueId: string | undefined,
  reason: string | undefined,
): Promise<RemoveLeagueProblem> {
  const because = reason === undefined ? {} : { reason };
  if (leagueId === undefined) return { kind: 'failed', league: 'not-removed', ...because };
  let fresh: MigrationDriver | undefined;
  try {
    fresh = await target.freshLogin();
    const there = await leagueStillThere(fresh, leagueId);
    return { kind: 'failed', league: there ? 'not-removed' : 'removed', ...because };
  } catch {
    return { kind: 'failed', league: 'unknown', ...because };
  } finally {
    if (fresh !== undefined) await fresh.close().catch(() => {});
  }
}
