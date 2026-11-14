// The league's "Start page for members" (U-5, R-10). With "my team's page" a signed-in
// member who has a team (a coach or captain role on it, or a roster place linked to them)
// lands on that team's page; a visitor who picked "my team" on this device lands on the one
// the device remembers; everyone else, and every league that kept "league home", sees the
// league home. A link to the league home that stays there is always on the page.
import { leagueUrl, type AccessHolder, type LeagueAddressee } from '@srleagues/core';
import { myTeamSlugOf } from '../../server/my-team-cookie.ts';

/** The value of `?start=` on the league home that keeps the visitor there (never forwards). */
export const stayAtHome = 'league';

/** The address of the league home that never forwards to a team (the "league home" links). */
export function leagueHomeStayUrl(league: LeagueAddressee, season?: string): string {
  return `${leagueUrl(league, 'home', season === undefined ? {} : { season })}${
    season === undefined ? '?' : '&'
  }${new URLSearchParams({ start: stayAtHome })}`;
}

/** The teams an account is a coach or captain of: roles on a team, still in force. */
export function teamIdsFromGrants(holder: AccessHolder | undefined): readonly string[] {
  if (holder === undefined) return [];
  return holder.grants
    .filter(
      (grant) =>
        grant.accountId === holder.accountId &&
        grant.revokedAt === null &&
        (grant.role === 'coach' || grant.role === 'captain') &&
        grant.scope.type === 'team',
    )
    .flatMap((grant) => (grant.scope.type === 'team' ? [grant.scope.id.toLowerCase()] : []));
}

export type MyTeamInput = {
  /** The season's teams (never one in the bin). */
  readonly teams: readonly { readonly id: string; readonly slug: string; readonly name: string }[];
  /** Teams the signed-in account leads, from its grants. */
  readonly grantTeamIds: readonly string[];
  /** Teams the signed-in account has a roster place on. */
  readonly rosterTeamIds: readonly string[];
  /** The short name this device remembered, as the cookie held it. */
  readonly rememberedSlug: string | undefined;
};

/**
 * The team a person lands on, or undefined. A signed-in member's own team wins over what
 * the device remembers; a member with several teams gets the first by name, and a team
 * that is not in the season's list (binned, other season) never counts.
 */
export function chooseMyTeam(input: MyTeamInput): string | undefined {
  const byName = [...input.teams].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  const mine = new Set(
    [...input.grantTeamIds, ...input.rosterTeamIds].map((id) => id.toLowerCase()),
  );
  const own = byName.find((team) => mine.has(team.id.toLowerCase()));
  if (own !== undefined) return own.slug;
  const remembered = myTeamSlugOf(input.rememberedSlug);
  return remembered === undefined
    ? undefined
    : byName.find((team) => team.slug === remembered)?.slug;
}
