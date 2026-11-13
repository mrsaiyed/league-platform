// Who is looking at a public page or a live message (S-22, T-87).

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
  /** Teams this person is staff of (coach or team admin), in this league. */
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
