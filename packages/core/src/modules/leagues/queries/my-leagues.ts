// The leagues a signed-in person belongs to (P2 lines 67, 71 and 141; U-11): the
// product's one read across leagues for an ordinary person (record 066, T-269). It is
// asked by account, not by league, so it cannot run in a league's transaction: its
// reader answers for the account the server's session set (the database's
// my_leagues(), migration 0018, answers for current_account_id() only, and takes no
// account of its own), and returns only leagues where that account holds a role in
// force, owns the league, or has a roster place. Leagues in the bin never come back.
//
// What the person may see of each is decided here, by the same rule as the league's
// own pages (U-9, mayOpenLeague): a draft league only to those with an admin area in
// it, a suspended one only to its owner and admins, live and archived ones to everyone
// who belongs. A league the person may not open is dropped before its name leaves this
// function, so no page can show it.
//
// It lives in the leagues module, not the access module beside myAccess, because the
// visibility rule is the leagues module's and that module already uses the access
// module (an import back would make the two a ring).
import type { AccessHolder, Grant, Role, Scope } from '../../access/index.ts';
import { roles } from '../../access/index.ts';
import type { LeagueStatus } from '../league-values.ts';
import { mayOpenLeague } from '../rules/league-visibility.ts';

/** One league the account belongs to, as the reader gives it, before any visibility rule. */
export type AccountLeagueRow = {
  readonly leagueId: string;
  readonly slug: string;
  /** The league's own name. */
  readonly name: string;
  readonly status: LeagueStatus;
  /** Whether the account owns the league (O-7). */
  readonly isOwner: boolean;
  /** Each role the account holds there in force, at any scope (program, club, team or all). */
  readonly roles: readonly Role[];
  /** Of those, the roles it holds for the whole league. */
  readonly leagueWideRoles: readonly Role[];
  /** Whether a current roster place there belongs to one of the account's profiles. */
  readonly onRoster: boolean;
};

/**
 * Reads the leagues of the one account the session set on it, never another: it takes
 * no account id. packages/database supplies it (listMyLeagues), and the stand-in its own.
 */
export type MyLeaguesReader = () => Promise<readonly AccountLeagueRow[]>;

/** What a person is in a league, in the order a list shows them. */
export type LeagueMembership = 'owner' | Role | 'on-a-team';

/** One league for the person's own lists (the front page, the account page). */
export type MyLeague = {
  readonly leagueId: string;
  readonly slug: string;
  readonly name: string;
  readonly status: LeagueStatus;
  /** Owner first, then each role once in the access module's order, then "on a team". */
  readonly memberships: readonly LeagueMembership[];
};

/**
 * The leagues `accountId` belongs to and may see, by name. `accountId` is the session's
 * (null for a visitor, who belongs nowhere); `read` answers for that same account.
 */
export async function myLeagues(
  accountId: string | null,
  read: MyLeaguesReader,
): Promise<readonly MyLeague[]> {
  if (accountId === null) return [];
  const rows = await read();
  const shown: MyLeague[] = [];
  for (const row of rows) {
    const holder = holderOf(accountId, row);
    // Someone who belongs to a league by none of the three ways is not listed.
    if (!row.isOwner && row.roles.length === 0 && !row.onRoster) continue;
    if (!mayOpenLeague(row.status, holder)) continue;
    shown.push({
      leagueId: row.leagueId,
      slug: row.slug,
      name: row.name,
      status: row.status,
      memberships: membershipsOf(row),
    });
  }
  return shown.sort(
    (a, b) => a.name.localeCompare(b.name, 'en') || a.leagueId.localeCompare(b.leagueId),
  );
}

/**
 * A part of a league smaller than the whole (a program, club or team). U-9's two rules ask
 * only whether a role is held at all (an admin area, at any scope) and whether it is held
 * for the whole league (a suspended league's admins), never which part, so the reader
 * gives no part's id and none is needed here.
 */
const partOfTheLeague: Scope = { type: 'program', id: 'a part of the league' };

/** The account's holding in one league, as the league's own pages read it (league-gate). */
function holderOf(accountId: string, row: AccountLeagueRow): AccessHolder {
  const held: { readonly role: Role; readonly scope: Scope }[] = [
    ...row.leagueWideRoles.map((role) => ({ role, scope: { type: 'league' } as const })),
    ...row.roles
      .filter((role) => !row.leagueWideRoles.includes(role))
      .map((role) => ({ role, scope: partOfTheLeague })),
  ];
  const grants: Grant[] = held.map((grant, n) => ({
    id: `${row.leagueId}:${n}`,
    accountId,
    role: grant.role,
    scope: grant.scope,
    grantedByAccountId: null,
    revokedAt: null,
  }));
  return { accountId, isOwner: row.isOwner, grants };
}

function membershipsOf(row: AccountLeagueRow): readonly LeagueMembership[] {
  const held = new Set<Role>([...row.roles, ...row.leagueWideRoles]);
  return [
    ...(row.isOwner ? (['owner'] as const) : []),
    ...roles.filter((role) => held.has(role)),
    ...(row.onRoster ? (['on-a-team'] as const) : []),
  ];
}
