// Making a league from this computer (step 2.125 part 1, P3 §8, record 057): the
// internal version of the four steps of P3 §1, for our own staff. `previewNewLeague`
// says what would happen and changes nothing; `makeLeague` makes it.
//
// It makes, in this order, each through the product's own commands:
//   1. the staff member's account and the owner's, by email, if either has none. The
//      owner's first sign-in later links that account (record 052), so the person who
//      signs up with that email owns the league;
//   2. the league, in draft (createLeague, as our staff);
//   3. its first season in the default program (createSeason), and makes it the
//      current one (setCurrentSeason), as the league's owner: the owner holds those
//      permissions, our staff hold none in a league (T-77), and these are the owner's
//      own steps (P3 §1 step 4), which we take for them until self-serve sign-up.
// Each command is its own transaction. A stop part-way says what was made; nothing is
// undone, and the league, once made, is shown so it can be finished by hand.
import {
  createLeague,
  createSeason,
  getSeason,
  setCurrentSeason,
  type CommandContext,
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
  accountForEmail,
  findAccountByEmail,
  hasLeagueCity,
  isShortNameHeld,
  newLeagueId,
} from './login-queries.ts';

export type NewLeaguePreview = {
  /** False when migration 0014 is not applied: nothing can be made. */
  readonly schemaReady: boolean;
  readonly shortNameHeld: boolean;
  readonly ownerHasAccount: boolean;
  readonly staffHasAccount: boolean;
};

/** What would happen. Reads only. */
export async function previewNewLeague(
  target: LeagueMakingTarget,
  plan: NewLeaguePlan,
  staffEmail: string,
): Promise<NewLeaguePreview> {
  const schemaReady = await hasLeagueCity(target.login);
  return {
    schemaReady,
    shortNameHeld: schemaReady && (await isShortNameHeld(target.login, plan.slug)),
    ownerHasAccount: (await findAccountByEmail(target.login, plan.ownerEmail)) !== undefined,
    staffHasAccount: (await findAccountByEmail(target.login, staffEmail)) !== undefined,
  };
}

export type MadeLeague = {
  readonly leagueId: string;
  readonly slug: string;
  readonly seasonId: string;
  readonly ownerAccountId: string;
  /** Whether the owner's account was made now (they have not signed up yet). */
  readonly ownerAccountMade: boolean;
};

export type MakeLeagueProblem =
  | { readonly kind: 'schema-not-ready' }
  | { readonly kind: 'short-name-held' }
  /** A command refused; `leagueId` is set once the league itself was made. */
  | {
      readonly kind: 'refused';
      readonly step: 'league' | 'season' | 'current-season';
      readonly code: string;
      readonly leagueId?: string;
    };

export type MakeLeagueOutcome =
  | { readonly ok: true; readonly made: MadeLeague }
  | { readonly ok: false; readonly problem: MakeLeagueProblem };

export type MakeLeagueOptions = {
  /**
   * The email of the member of our staff who makes it (P3 §8), named as staff for this
   * run only. It may be the owner's own (the founder making their own league).
   */
  readonly staffEmail: string;
  readonly now?: () => number;
};

/** Makes the league in draft with its first season as the current one. */
export async function makeLeague(
  target: LeagueMakingTarget,
  plan: NewLeaguePlan,
  { staffEmail, now = () => Date.now() }: MakeLeagueOptions,
): Promise<MakeLeagueOutcome> {
  if (!(await hasLeagueCity(target.login))) {
    return { ok: false, problem: { kind: 'schema-not-ready' } };
  }
  // Checked before any account is made, so a short name already held makes nothing.
  if (await isShortNameHeld(target.login, plan.slug)) {
    return { ok: false, problem: { kind: 'short-name-held' } };
  }
  const staff = await target.login.transaction((tx) => accountForEmail(tx, staffEmail.trim()));
  const owner = await target.login.transaction((tx) => accountForEmail(tx, plan.ownerEmail));
  const leagueId = await newLeagueId(target.login);

  const deps: CommandDeps<LeaguesTx> = {
    transaction: commandTransaction(target.db, (scope: LeagueScope) => ({
      jobs: jobsStore(scope),
      leagues: leaguesStore(scope, { platformStaff: [staff.accountId] }),
      divisions: divisionsStore(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
    })),
    events: [],
    log: () => {},
    now,
  };
  const as = (accountId: string): CommandContext => ({
    leagueId,
    accountId,
    requestId: `make-league-${plan.slug}`,
  });
  const refused = (
    step: 'league' | 'season' | 'current-season',
    code: string,
  ): MakeLeagueOutcome => ({
    ok: false,
    problem:
      step === 'league'
        ? { kind: 'refused', step, code }
        : { kind: 'refused', step, code, leagueId },
  });

  const league = await createLeague(
    as(staff.accountId),
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
    },
    deps,
  );
  if (!league.ok) return refused('league', league.error.code);

  const season = await createSeason(as(owner.accountId), { ...plan.season }, deps);
  if (!season.ok) return refused('season', season.error.code);
  const view = await getSeason(as(owner.accountId), { seasonId: season.value.seasonId }, deps);
  if (!view.ok) return refused('current-season', view.error.code);
  const current = await setCurrentSeason(
    as(owner.accountId),
    { seasonId: season.value.seasonId, version: view.value.version },
    deps,
  );
  if (!current.ok) return refused('current-season', current.error.code);

  return {
    ok: true,
    made: {
      leagueId,
      slug: plan.slug,
      seasonId: season.value.seasonId,
      ownerAccountId: owner.accountId,
      ownerAccountMade: owner.made,
    },
  };
}
