// Making a league from this computer (step 2.125 part 1, P3 §8, record 057): the
// internal version of the four steps of P3 §1, for our own staff. `previewNewLeague`
// says what would happen and changes nothing; `makeLeague` makes it.
//
// `makeLeague`, in this order:
//   1. asks each login whether it may do its part (probe-logins.ts), checks the
//      database is at this code's migrations (migration-state.ts) and that no league
//      holds the short name, so any refusal makes nothing at all. The preview asks
//      the same first two questions before the plan is shown;
//   2. finds the staff member's and the owner's accounts by email, and makes any that
//      is missing, with no name and no sign-in link, as the migration login (the
//      app's role may not add an account). The owner's first sign-in with that
//      email, once the sign-in service has proved the mailbox, links that account
//      (record 052), so whoever first signs in with it owns the league;
//   3. runs createLeague, as our staff, with the first season and the site's first
//      release (its starting design, step 2.187): the league, its default program,
//      its current season and its site in one transaction (T-260), under the
//      app's own login on a hosted database, through the league fence, exactly as the
//      web app would. Nothing is ever done as the owner.
// Step 2's accounts cannot share step 3's transaction: they are written by the
// migration login on its own connection, outside the league's fence, and the
// commands run as the app's role. So when the league is not made, the accounts THIS
// run made are removed again, never one that was there before; one that cannot be
// removed is named in the outcome. It never throws: anything unexpected comes back
// as an outcome that says what was and was not made, and never more than is known.
// After a failure whose outcome is uncertain (the league's commit, or an account's,
// may have landed with its reply lost) the database is read again on a NEW
// connection; when that read cannot be made, the league is "not known" and nothing
// is removed. On success it reads back what it made, for the person to see.
import {
  createLeague,
  type CommandDeps,
  type LeaguesTx,
  type NewLeaguePlan,
} from '@srleagues/core';
import { commandTransaction } from '../db/command-transaction.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { accessStore } from '../stores/access-store.ts';
import { activityLogStore } from '../stores/activity-log-store.ts';
import { divisionsStore } from '../stores/divisions-store.ts';
import { jobsStore } from '../stores/jobs-store.ts';
import { leaguesStore } from '../stores/leagues-store.ts';
import type { LeagueMakingTarget } from './league-making-target.ts';
import {
  accountByEmail,
  accountForEmail,
  leagueHoldingShortName,
  madeLeagueFacts,
  newLeagueId,
  removeUnusedAccount,
  type MadeLeagueFacts,
} from './login-queries.ts';
import type { MigrationDriver } from '../migrations/index.ts';
import { migrationState, type MigrationState } from './migration-state.ts';
import { probeLogins, type LoginProblem } from './probe-logins.ts';

/**
 * Where an email stands: no account; an account made earlier (by this tool) that
 * nobody has signed in with yet; or an account someone has signed in with.
 */
export type AccountState = 'none' | 'never-signed-in' | 'signed-up';

/** Why nothing can be made there: a login that cannot do its part, or the migrations. */
export type TargetProblem =
  | { readonly kind: 'login'; readonly problems: readonly LoginProblem[] }
  | { readonly kind: 'migrations'; readonly state: Exclude<MigrationState, 'ready'> };

/**
 * The logins first, then the migrations: undefined when both are right. Reads only.
 * The removal tool asks the same (remove-league.ts), with its own login question.
 */
export async function targetProblem(
  target: LeagueMakingTarget,
): Promise<TargetProblem | undefined> {
  const problems = await probeLogins(target);
  if (problems.length > 0) return { kind: 'login', problems };
  const state = await migrationState(target.login);
  return state === 'ready' ? undefined : { kind: 'migrations', state };
}

export type NewLeaguePreview =
  /** A login cannot do its part, or the migrations are not right: nothing else was read. */
  | { readonly ready: false; readonly problem: TargetProblem }
  | {
      readonly ready: true;
      readonly shortNameHeld: boolean;
      readonly owner: AccountState;
      readonly staff: AccountState;
    };

const stateOf = (account: { readonly signedUp: boolean } | undefined): AccountState =>
  account === undefined ? 'none' : account.signedUp ? 'signed-up' : 'never-signed-in';

/** What would happen. Reads only; the accounts only once the logins and migrations are right. */
export async function previewNewLeague(
  target: LeagueMakingTarget,
  plan: NewLeaguePlan,
): Promise<NewLeaguePreview> {
  const problem = await targetProblem(target);
  if (problem !== undefined) return { ready: false, problem };
  return {
    ready: true,
    shortNameHeld: (await leagueHoldingShortName(target.login, plan.slug)) !== undefined,
    owner: stateOf(await accountByEmail(target.login, plan.ownerEmail)),
    staff: stateOf(await accountByEmail(target.login, plan.staffEmail)),
  };
}

export type MadeLeague = {
  readonly leagueId: string;
  readonly slug: string;
  readonly seasonId: string;
  readonly ownerAccountId: string;
  /** Where the owner's account stood: 'none' means it was made by this run. */
  readonly owner: AccountState;
  /** What the database holds now, read back; undefined when it could not be read. */
  readonly readBack: MadeLeagueFacts | undefined;
};

/**
 * An account this run made, by its email. `accountId` is null when it may have been
 * made but could not be looked up again (its own reply, and the read after, were lost).
 */
export type MadeAccount = { readonly email: string; readonly accountId: string | null };

/** The accounts this run made, when no league was: removed again, or left. */
export type AccountsLeft = {
  readonly removed: readonly MadeAccount[];
  readonly left: readonly MadeAccount[];
};

export type MakeLeagueProblem =
  | TargetProblem
  | { readonly kind: 'short-name-held' }
  /** createLeague refused: nothing of the league was made. */
  | { readonly kind: 'refused'; readonly code: string }
  /**
   * Something unexpected stopped it. `league` says whether the league is there: when
   * it is, it is whole (one transaction) and `leagueId` names it; 'unknown' when even
   * that could not be checked. `reason` is a database or system error code, never a
   * message (a message can repeat an address or a login).
   */
  | {
      readonly kind: 'failed';
      readonly league: 'not-made' | 'made' | 'unknown';
      readonly leagueId?: string;
      readonly reason?: string;
    };

export type MakeLeagueOutcome =
  | { readonly ok: true; readonly made: MadeLeague }
  | { readonly ok: false; readonly problem: MakeLeagueProblem; readonly accounts: AccountsLeft };

export type MakeLeagueOptions = { readonly now?: () => number };

/** A short error code (SQLSTATE such as 23505, or a system code such as ECONNRESET). */
function reasonOf(error: unknown): string | undefined {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && /^[A-Z0-9_]{2,24}$/.test(code) ? code : undefined;
}

const nothingLeft: AccountsLeft = { removed: [], left: [] };

/** Removes the accounts this run made, each in its own transaction; any refusal leaves it. */
async function removeMadeAccounts(
  login: MigrationDriver,
  made: readonly MadeAccount[],
): Promise<AccountsLeft> {
  const removed: MadeAccount[] = [];
  const left: MadeAccount[] = [];
  for (const account of made) {
    const { accountId } = account;
    let gone = false;
    if (accountId !== null) {
      try {
        gone = await login.transaction((tx) =>
          removeUnusedAccount(tx, { accountId, email: account.email }),
        );
      } catch {
        gone = false;
      }
    }
    (gone ? removed : left).push(account);
  }
  return { removed, left };
}

/** Makes the league in draft with its first season as the current one. Never throws. */
export async function makeLeague(
  target: LeagueMakingTarget,
  plan: NewLeaguePlan,
  { now = () => Date.now() }: MakeLeagueOptions = {},
): Promise<MakeLeagueOutcome> {
  const run: RunSoFar = { madeNow: [], hadNoAccount: [], commandRan: false };
  const { madeNow } = run;
  let leagueId: string | undefined;
  try {
    // Asked again here, not only in the preview: the logins and the database may have
    // changed while the plan was read.
    const problem = await targetProblem(target);
    if (problem !== undefined) return { ok: false, problem, accounts: nothingLeft };
    // Checked before any account is made, so a short name already held makes nothing.
    if ((await leagueHoldingShortName(target.login, plan.slug)) !== undefined) {
      return { ok: false, problem: { kind: 'short-name-held' }, accounts: nothingLeft };
    }
    const accountFor = async (email: string) => {
      const account = await target.login.transaction((tx) => accountForEmail(tx, email));
      if (account.made) madeNow.push({ email, accountId: account.accountId });
      return account;
    };
    // How the owner's address stood before this run made anything (the staff member's
    // account, made first, may be the owner's own).
    const ownerBefore = stateOf(await accountByEmail(target.login, plan.ownerEmail));
    const staffBefore = stateOf(await accountByEmail(target.login, plan.staffEmail));
    for (const [email, before] of [
      [plan.staffEmail, staffBefore],
      [plan.ownerEmail, ownerBefore],
    ] as const) {
      const seen = run.hadNoAccount.some((e) => e.toLowerCase() === email.toLowerCase());
      if (before === 'none' && !seen) run.hadNoAccount.push(email);
    }
    const staff = await accountFor(plan.staffEmail);
    const owner = await accountFor(plan.ownerEmail);
    leagueId = await newLeagueId(target.login);

    const deps: CommandDeps<LeaguesTx> = {
      transaction: commandTransaction(target.db, (scope: LeagueScope) => ({
        jobs: jobsStore(scope),
        // Our staff member is platform staff for this run only, in memory: no grant.
        leagues: leaguesStore(scope, { platformStaff: [staff.accountId] }),
        divisions: divisionsStore(scope),
        access: accessStore(scope),
        activity: activityLogStore(scope),
      })),
      events: [],
      log: () => {},
      now,
    };
    // From here the league's own commit may land even if its reply is lost.
    run.commandRan = true;
    const league = await createLeague(
      { leagueId, accountId: staff.accountId, requestId: `make-league-${plan.slug}` },
      {
        slug: plan.slug,
        name: plan.name,
        timeZone: plan.timeZone,
        audience: plan.audience,
        listed: plan.listed,
        ownerAccountId: owner.accountId,
        sportKey: plan.sportKey,
        contactEmail: plan.contactEmail,
        city: plan.city,
        firstSeason: {
          name: plan.season.name,
          slug: plan.season.slug,
          ...(plan.season.startsOn === null ? {} : { startsOn: plan.season.startsOn }),
          ...(plan.season.endsOn === null ? {} : { endsOn: plan.season.endsOn }),
        },
        // Its site's first release, in the same transaction (step 2.187, record 073).
        design: { startingDesign: plan.design.startingDesign, colors: plan.design.colors },
      },
      deps,
    );
    if (!league.ok) {
      return {
        ok: false,
        problem: { kind: 'refused', code: league.error.code },
        accounts: await removeMadeAccounts(target.login, madeNow),
      };
    }
    const seasonId = league.value.firstSeasonId;
    if (seasonId === null) throw new Error('makeLeague: the league came back with no season.');
    let readBack: MadeLeagueFacts | undefined;
    try {
      readBack = await madeLeagueFacts(target.login, leagueId, staff.accountId);
    } catch {
      readBack = undefined;
    }
    return {
      ok: true,
      made: {
        leagueId,
        slug: plan.slug,
        seasonId,
        ownerAccountId: owner.accountId,
        owner: ownerBefore,
        readBack,
      },
    };
  } catch (error) {
    return failed(target, plan, leagueId, run, reasonOf(error));
  }
}

/** What a run had done when it stopped: what failed() needs to tell the truth. */
type RunSoFar = {
  /** The accounts whose making this run saw commit. */
  readonly madeNow: MadeAccount[];
  /** The emails that had no account before this run (one of them may have been made). */
  readonly hadNoAccount: string[];
  /** Whether createLeague was called: its commit may have landed with its reply lost. */
  commandRan: boolean;
};

/**
 * After something unexpected: whether the league is there, and which accounts this
 * run made, read again on a new connection. "not-made" only when that read shows it,
 * or when no command ran; "unknown" (and nothing removed) when it cannot be read.
 */
async function failed(
  target: LeagueMakingTarget,
  plan: NewLeaguePlan,
  leagueId: string | undefined,
  run: RunSoFar,
  reason: string | undefined,
): Promise<MakeLeagueOutcome> {
  const because = reason === undefined ? {} : { reason };
  let fresh: MigrationDriver | undefined;
  try {
    fresh = await target.freshLogin();
  } catch {
    fresh = undefined;
  }
  try {
    let league: 'not-made' | 'made' | 'unknown';
    if (!run.commandRan || leagueId === undefined) league = 'not-made';
    else if (fresh === undefined) league = 'unknown';
    else {
      try {
        const holder = await leagueHoldingShortName(fresh, plan.slug);
        league = holder === leagueId ? 'made' : 'not-made';
      } catch {
        league = 'unknown';
      }
    }
    if (league === 'made' && leagueId !== undefined) {
      return {
        ok: false,
        problem: { kind: 'failed', league, leagueId, ...because },
        accounts: nothingLeft,
      };
    }
    // The accounts this run made, with any whose own reply was lost: an email that had
    // no account before and has one now that nobody has signed in with.
    const made: MadeAccount[] = [...run.madeNow];
    for (const email of run.hadNoAccount) {
      if (made.some((m) => m.email.toLowerCase() === email.toLowerCase())) continue;
      let found: { accountId: string; signedUp: boolean } | undefined | null = null;
      if (fresh !== undefined) {
        try {
          found = await accountByEmail(fresh, email);
        } catch {
          found = null;
        }
      }
      if (found === null) made.push({ email, accountId: null });
      else if (found !== undefined && !found.signedUp)
        made.push({ email, accountId: found.accountId });
    }
    // Only when the league is surely not there are its accounts taken away again.
    const accounts =
      league === 'not-made' && fresh !== undefined
        ? await removeMadeAccounts(fresh, made)
        : { removed: [], left: made };
    return { ok: false, problem: { kind: 'failed', league, ...because }, accounts };
  } finally {
    if (fresh !== undefined) await fresh.close().catch(() => {});
  }
}
