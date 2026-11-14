// Making a league from this computer (step 2.125 part 1, P3 §8, record 057): the
// internal version of the four steps of P3 §1, for our own staff. `previewNewLeague`
// says what would happen and changes nothing; `makeLeague` makes it.
//
// `makeLeague`, in this order:
//   1. checks the database is at this code's migrations (migration-state.ts) and that
//      no league holds the short name, so either refusal makes nothing at all;
//   2. finds the staff member's and the owner's accounts by email, and makes any that
//      is missing, with no name and no sign-in link, as the migration login (the
//      app's role may not add an account). The owner's first sign-in with that
//      email, once the sign-in service has proved the mailbox, links that account
//      (record 052), so whoever first signs in with it owns the league;
//   3. runs createLeague, as our staff, with the first season: the league, its
//      default program and its current season in one transaction (T-260). Nothing
//      is ever done as the owner.
// Step 2's accounts cannot share step 3's transaction: they are written by the
// migration login on its own connection, outside the league's fence, and the
// commands run as the app's role. So when the league is not made, the accounts THIS
// run made are removed again, never one that was there before; one that cannot be
// removed is named in the outcome. It never throws: anything unexpected comes back
// as an outcome that says what was and was not made.
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
  newLeagueId,
  removeUnusedAccount,
} from './login-queries.ts';
import { migrationState, type MigrationState } from './migration-state.ts';

/**
 * Where an email stands: no account; an account made earlier (by this tool) that
 * nobody has signed in with yet; or an account someone has signed in with.
 */
export type AccountState = 'none' | 'never-signed-in' | 'signed-up';

export type NewLeaguePreview =
  /** The database is not at this code's migrations: nothing else was read. */
  | { readonly ready: false; readonly migrations: Exclude<MigrationState, 'ready'> }
  | {
      readonly ready: true;
      readonly shortNameHeld: boolean;
      readonly owner: AccountState;
      readonly staff: AccountState;
    };

const stateOf = (account: { readonly signedUp: boolean } | undefined): AccountState =>
  account === undefined ? 'none' : account.signedUp ? 'signed-up' : 'never-signed-in';

/** What would happen. Reads only; the accounts only once the migrations are right. */
export async function previewNewLeague(
  target: LeagueMakingTarget,
  plan: NewLeaguePlan,
): Promise<NewLeaguePreview> {
  const migrations = await migrationState(target.login);
  if (migrations !== 'ready') return { ready: false, migrations };
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
};

/** An account this run made, by its email. */
export type MadeAccount = { readonly email: string; readonly accountId: string };

/** The accounts this run made, when no league was: removed again, or left. */
export type AccountsLeft = {
  readonly removed: readonly MadeAccount[];
  readonly left: readonly MadeAccount[];
};

export type MakeLeagueProblem =
  | { readonly kind: 'migrations'; readonly state: Exclude<MigrationState, 'ready'> }
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
  target: LeagueMakingTarget,
  made: readonly MadeAccount[],
): Promise<AccountsLeft> {
  const removed: MadeAccount[] = [];
  const left: MadeAccount[] = [];
  for (const account of made) {
    let gone = false;
    try {
      gone = await target.login.transaction((tx) => removeUnusedAccount(tx, account));
    } catch {
      gone = false;
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
  const madeNow: MadeAccount[] = [];
  let leagueId: string | undefined;
  try {
    const migrations = await migrationState(target.login);
    if (migrations !== 'ready') {
      return {
        ok: false,
        problem: { kind: 'migrations', state: migrations },
        accounts: nothingLeft,
      };
    }
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
      },
      deps,
    );
    if (!league.ok) {
      return {
        ok: false,
        problem: { kind: 'refused', code: league.error.code },
        accounts: await removeMadeAccounts(target, madeNow),
      };
    }
    const seasonId = league.value.firstSeasonId;
    if (seasonId === null) throw new Error('makeLeague: the league came back with no season.');
    return {
      ok: true,
      made: {
        leagueId,
        slug: plan.slug,
        seasonId,
        ownerAccountId: owner.accountId,
        owner: ownerBefore,
      },
    };
  } catch (error) {
    return failed(target, plan, leagueId, madeNow, reasonOf(error));
  }
}

/** After something unexpected: whether the league is there, and the accounts made. */
async function failed(
  target: LeagueMakingTarget,
  plan: NewLeaguePlan,
  leagueId: string | undefined,
  madeNow: readonly MadeAccount[],
  reason: string | undefined,
): Promise<MakeLeagueOutcome> {
  const because = reason === undefined ? {} : { reason };
  let league: 'not-made' | 'made' | 'unknown' = 'not-made';
  if (leagueId !== undefined) {
    try {
      const holder = await leagueHoldingShortName(target.login, plan.slug);
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
  // Only when the league is surely not there are its accounts taken away again.
  const accounts =
    league === 'not-made'
      ? await removeMadeAccounts(target, madeNow)
      : { removed: [], left: [...madeNow] };
  return { ok: false, problem: { kind: 'failed', league, ...because }, accounts };
}
