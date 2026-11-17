// Who is looking at a public page or a live message (S-22, T-87).
import type { AccessHolder } from '../../access/index.ts';

/**
 * What the server knows about the person looking, read from their roles on the
 * server (T-75), never from the request. Stage 4 adds league members and a team's own
 * players and parents, for the two middle statistics levels of S-22.
 */
export interface Viewer {
  /** The league whose page or message this is. Roles count only inside it. */
  readonly leagueId: string;
  /** An admin of this league. */
  readonly leagueAdmin: boolean;
  /** Teams this person is staff of (a coach or captain role on the team), in this league. */
  readonly staffOfTeamIds: readonly string[];
}

/**
 * Anyone at all, looking at one league. The cached public page and every live message
 * are built for this viewer (T-87, T-120); viewers allowed more get it in their own
 * signed-in request (T-95).
 */
export function publicViewer(leagueId: string): Viewer {
  return Object.freeze({
    leagueId,
    leagueAdmin: false,
    staffOfTeamIds: Object.freeze([]),
  });
}

/**
 * The person signed in, as their roles in this league make them (step 2.46, T-287): what
 * the signed-in request after a public page (T-95) reads the numbers for. `holder` is
 * what the account holds in `leagueId`, read fresh on the server (T-75) for the session's
 * own account; no holder (a visitor, a session that no longer works, a league in the bin)
 * is the public viewer.
 *
 * - The league's admins: its owner, and an admin of the whole league (S-22: "the league's
 *   admins"). An admin limited to one program is not one of them: which program a team is
 *   in is not read here, so it sees what the public sees (fail closed, record 085).
 * - The team's staff: a coach or captain role on that team, in force. A coach or captain
 *   role anywhere else (the whole league, a program: scopes those roles cannot have,
 *   T3 §5) makes no one staff of a team.
 * - Every other role (a scorekeeper, a scheduler, a club admin) sees what the public sees.
 *
 * A grant of another account, or of a scope this does not know, counts for nothing.
 */
export function signedInViewer(leagueId: string, holder: AccessHolder | undefined): Viewer {
  if (holder === undefined) return publicViewer(leagueId);
  const own = holder.grants.filter(
    (grant) => grant.accountId === holder.accountId && grant.revokedAt === null,
  );
  const leagueAdmin =
    holder.isOwner === true ||
    own.some((grant) => grant.role === 'admin' && grant.scope.type === 'league');
  const staffOfTeamIds = [
    ...new Set(
      own.flatMap((grant) =>
        (grant.role === 'coach' || grant.role === 'captain') && grant.scope.type === 'team'
          ? [grant.scope.id.toLowerCase()]
          : [],
      ),
    ),
  ].sort();
  return Object.freeze({
    leagueId,
    leagueAdmin,
    staffOfTeamIds: Object.freeze(staffOfTeamIds),
  });
}
