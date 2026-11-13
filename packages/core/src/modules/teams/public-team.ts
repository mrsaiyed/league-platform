// What the public teams list and a team's page are given (P2 §4, P7 §2, U-5, T-29),
// and the one place a roster line becomes public. A name goes through the one name
// function (T-81); a person's id, birth date, contact details and sign-in link never
// appear. A person who asked to be taken off the public pages stays as a nameless
// entry with their number (R-17).
import type { Audience } from '../leagues/index.ts';
import {
  showName,
  statsShown,
  type NamePolicy,
  type NameRequest,
  type ShownName,
  type StatsShown,
  type StatsVisibility,
  type Viewer,
} from '../people/index.ts';

/** Who is looking and the league's name rules: what a public query needs besides the league. */
export type PublicDisplay = {
  readonly viewer: Viewer;
  readonly policy: NamePolicy;
};

export type PublicDivision = {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
};

/** A team on the teams list and at the top of its page. */
export type PublicTeam = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly color: string | null;
  readonly division: PublicDivision | null;
  /** Whether this viewer may see the team's player lines or only its totals (S-22). */
  readonly statsShown: StatsShown;
};

export type PublicRosterLine = {
  /** The roster entry's id, for a list key; not the person's. */
  readonly entryId: string;
  readonly jerseyNumber: string | null;
  /** 'player', 'captain' or 'coach'. */
  readonly role: string;
  readonly name: ShownName;
  /** True for someone who left the team: they stay in its history, marked (R-17). */
  readonly former: boolean;
  /** The day they left (yyyy-mm-dd), or null while on the team. */
  readonly leftOn: string | null;
};

export type PublicRoster = {
  readonly teamId: string;
  readonly lines: readonly PublicRosterLine[];
};

/** What a roster line is built from: the entry and the person's name fields. */
export type RosterLineSource = {
  readonly entryId: string;
  readonly jerseyNumber: string | null;
  readonly role: string;
  readonly leftOn: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly isMinor: boolean | null;
  readonly nameRequest: string;
  /** A person in the bin has no name on a public page. */
  readonly personBinned: boolean;
};

function nameRequestOf(value: string): NameRequest {
  // Anything not known counts as a request to be taken off (R-17); showName agrees.
  return value === 'none' || value === 'initials' ? value : 'removed';
}

/** The public team card: statistics shown as this viewer may see them. */
export function publicTeam(
  source: {
    readonly leagueId: string;
    readonly id: string;
    readonly slug: string;
    readonly name: string;
    readonly color: string | null;
    readonly statsVisibility: string;
    readonly division: PublicDivision | null;
  },
  viewer: Viewer,
): PublicTeam {
  // Levels the code does not know yet show totals only.
  const level: StatsVisibility | 'unknown' =
    source.statsVisibility === 'everyone' || source.statsVisibility === 'staff'
      ? source.statsVisibility
      : 'unknown';
  return {
    id: source.id,
    slug: source.slug,
    name: source.name,
    color: source.color,
    division: source.division,
    statsShown:
      level === 'unknown'
        ? 'team_totals'
        : statsShown(
            { leagueId: source.leagueId, teamId: source.id, statsVisibility: level },
            viewer,
          ),
  };
}

/** One roster line. A roster stands beside no statistics, so no team's setting hides it. */
export function publicRosterLine(
  source: RosterLineSource,
  audience: Audience,
  display: PublicDisplay,
): PublicRosterLine {
  const name: ShownName = source.personBinned
    ? { shown: false, why: 'removed' }
    : showName(
        {
          firstName: source.firstName,
          lastName: source.lastName,
          isMinor: source.isMinor,
          nameRequest: nameRequestOf(source.nameRequest),
        },
        { audience, policy: display.policy, viewer: display.viewer, statsOf: null },
      );
  return {
    entryId: source.entryId,
    jerseyNumber: source.jerseyNumber,
    role: source.role,
    name,
    former: source.leftOn !== null,
    leftOn: source.leftOn,
  };
}
