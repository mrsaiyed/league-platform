// THE MADE-UP ROSTERS AND START PAGES OF THE STAND-IN LEAGUES. FOR LOCAL WORK AND TESTS ONLY.
//
// Plain data behind the same shapes the database queries return, so the teams pages run the
// same code here as they will on the database: roster lines are made by core's one
// publicRosterLine (names through the one name function, T-81). The adult league keeps the
// league home as its start page; the youth league starts members on their team's page, so
// both settings can be tried. One made-up account has a roster place on a team of each.
import { publicRosterLine, type PublicRoster, type RosterLineSource } from '@srleagues/core';
import type { PublicTeamsPorts, StartPage } from './public-teams.ts';
import { adultTeams, standInSeasonIds, youthTeams } from './stand-in-public-stats.ts';

type Spec = {
  first: string;
  last: string;
  number: string | null;
  role?: 'player' | 'captain' | 'coach';
  left?: string;
  request?: 'none' | 'initials' | 'removed';
};

const rosterSpecs: Record<string, Spec[]> = {
  falcons: [
    { first: 'Dana', last: 'Whitfield', number: '4', role: 'captain' },
    { first: 'Marcus', last: 'Oyelaran', number: '11' },
    { first: 'Lee', last: 'Fontaine', number: '23', request: 'removed' },
    { first: 'Pat', last: 'Gorski', number: '8', left: '2026-10-02' },
    { first: 'Rosa', last: 'Delgado', number: null, role: 'coach' },
  ],
  herons: [
    { first: 'Priya', last: 'Raman', number: '7', role: 'captain' },
    { first: 'Theo', last: 'Lindqvist', number: '12' },
    { first: 'Amal', last: 'Nasser', number: null, role: 'coach' },
  ],
  owls: [
    { first: 'Jordan', last: 'Castellanos', number: '3', role: 'captain' },
    { first: 'Imani', last: 'Brooks', number: '15' },
  ],
  badgers: [
    { first: 'Wen', last: 'Zhao', number: '9', role: 'captain' },
    { first: 'Kofi', last: 'Mensah', number: '21' },
  ],
  otters: [
    { first: 'Ravi', last: 'Patel', number: '5', role: 'captain' },
    { first: 'Gita', last: 'Shah', number: '14' },
  ],
  comets: [
    { first: 'Sam', last: 'Rivera', number: '2' },
    { first: 'Maya', last: 'Cho', number: '10' },
    { first: 'Dev', last: 'Anand', number: null, role: 'coach' },
  ],
  rockets: [
    { first: 'Noor', last: 'Haddad', number: '6', role: 'captain' },
    { first: 'Jay', last: 'Whitaker', number: '13' },
    { first: 'Tess', last: 'Moreno', number: '1', left: '2026-11-01' },
  ],
  meteors: [{ first: 'Eli', last: 'Okafor', number: '17' }],
};

function lineOf(spec: Spec, index: number, teamId: string): RosterLineSource {
  return {
    entryId: `${teamId}-entry-${index + 1}`,
    jerseyNumber: spec.number,
    role: spec.role ?? 'player',
    leftOn: spec.left ?? null,
    firstName: spec.first,
    lastName: spec.last,
    isMinor: null,
    nameRequest: spec.request ?? 'none',
    personBinned: false,
  };
}

export function standInPublicTeams(
  ids: { readonly adultLeagueId: string; readonly youthLeagueId: string },
  /** The made-up account that has a roster place on a team of each league. */
  memberAccountId: string,
): PublicTeamsPorts {
  const teamsOf = (leagueId: string) =>
    leagueId === ids.adultLeagueId ? adultTeams : leagueId === ids.youthLeagueId ? youthTeams : [];
  const startPage = (leagueId: string): StartPage =>
    leagueId === ids.youthLeagueId ? 'myTeam' : 'leagueHome';
  return {
    startPageOf: async (leagueId) => startPage(leagueId),
    rosterOf: async (leagueId, teamId, display): Promise<PublicRoster> => {
      const team = teamsOf(leagueId).find((t) => t.id === teamId);
      const specs = team === undefined ? [] : (rosterSpecs[team.slug] ?? []);
      const audience = leagueId === ids.youthLeagueId ? 'youth' : 'adult';
      const ordered = [
        ...specs.filter((s) => s.left === undefined),
        ...specs.filter((s) => s.left !== undefined),
      ];
      return {
        lines: ordered.map((spec, i) =>
          publicRosterLine(lineOf(spec, i, teamId), audience, display),
        ),
      };
    },
    teamIdsOfAccount: async (leagueId, seasonId, accountId) => {
      if (accountId !== memberAccountId) return [];
      // The adult league's current season and the youth league's season, one team each.
      if (leagueId === ids.adultLeagueId && seasonId === standInSeasonIds.adultFall) {
        return adultTeams.filter((t) => t.slug === 'herons').map((t) => t.id);
      }
      if (leagueId === ids.youthLeagueId && seasonId === standInSeasonIds.youthWinter) {
        return youthTeams.filter((t) => t.slug === 'rockets').map((t) => t.id);
      }
      return [];
    },
  };
}
