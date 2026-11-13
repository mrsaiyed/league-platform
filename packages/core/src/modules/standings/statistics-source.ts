// What both statistics reads start from: the season's player totals with every player
// whose numbers this viewer may not see already taken out (S-22, T-87). It is taken out
// before anything is ranked, so a rank, a gap in ranks or a count can never show that a
// hidden player exists. Names come only through the one name function (T-81).
import type { Audience } from '../leagues/index.ts';
import {
  showName,
  statsShown,
  type NamePolicy,
  type TeamStatsSetting,
  type Viewer,
} from '../people/index.ts';
import type {
  PlayerTotalsRecord,
  SeasonTeamRow,
  StandingsReadStore,
  TeamStatTotalRecord,
} from './read-ports.ts';

/** Who is looking and how the league shows names. The server builds it, never the request. */
export type StatisticsViewing = {
  /** The league the page is for. A viewer of another league sees only team totals. */
  readonly leagueId: string;
  readonly viewer: Viewer;
  readonly audience: Audience;
  readonly policy: NamePolicy;
};

/** A stat over the games where it was recorded; the average is over those games only. */
export type StatEntry = {
  readonly total: number;
  readonly gamesRecorded: number;
  readonly average: number;
};

export type PlayerName = {
  /** Null when the person asked to be taken off, or no name was recorded. */
  readonly text: string | null;
  readonly hiddenBecause: 'removed' | 'no_name' | null;
};

export type VisiblePlayer = {
  readonly personId: string;
  readonly name: PlayerName;
  readonly teamIds: readonly string[];
  readonly gamesPlayed: number;
  readonly seconds: StatEntry;
  readonly stats: Readonly<Record<string, StatEntry>>;
};

export type TeamTotals = {
  readonly teamId: string;
  readonly name: string;
  readonly color: string | null;
  /** True when this viewer sees the team's player lines; false means totals only. */
  readonly playerLinesShown: boolean;
  readonly stats: Readonly<Record<string, StatEntry>>;
};

export const entryOf = (total: number, gamesRecorded: number): StatEntry => ({
  total,
  gamesRecorded,
  average: gamesRecorded === 0 ? 0 : total / gamesRecorded,
});

const wholeCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Reads the versioned stats document; anything it cannot read counts as nothing recorded. */
function statsOf(document: unknown): Record<string, StatEntry> {
  const out: Record<string, StatEntry> = {};
  if (typeof document !== 'object' || document === null) return out;
  const stats: unknown = (document as { stats?: unknown }).stats;
  if (typeof stats !== 'object' || stats === null) return out;
  for (const [key, entry] of Object.entries(stats)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { total, gamesRecorded } = entry as { total?: unknown; gamesRecorded?: unknown };
    if (wholeCount(total) && wholeCount(gamesRecorded)) out[key] = entryOf(total, gamesRecorded);
  }
  return out;
}

function teamSetting(leagueId: string, team: SeasonTeamRow): TeamStatsSetting {
  // A value the settings do not know is read by statsShown as "totals only".
  return {
    leagueId,
    teamId: team.id,
    statsVisibility: team.statsVisibility as TeamStatsSetting['statsVisibility'],
  };
}

export type StatisticsSource = {
  readonly seasonId: string;
  readonly statKeys: readonly string[];
  readonly players: readonly VisiblePlayer[];
  readonly teams: readonly TeamTotals[];
};

/** Undefined when the season is not in this league. */
export async function statisticsSource(
  store: StandingsReadStore,
  seasonId: string,
  viewing: StatisticsViewing,
): Promise<StatisticsSource | undefined> {
  const season = await store.findSeason(seasonId);
  const keys = season === undefined ? undefined : await store.seasonStatKeys(season.id);
  if (season === undefined || keys === undefined) return undefined;
  const [teams, totals, links, teamTotalRows] = await Promise.all([
    store.teams(season.id),
    store.playerTotals(season.id),
    store.playerTeams(season.id),
    store.teamStatTotals(season.id),
  ]);
  const settings = new Map(teams.map((team) => [team.id, teamSetting(viewing.leagueId, team)]));
  const shownTeam = (teamId: string): boolean => {
    const setting = settings.get(teamId);
    return setting !== undefined && statsShown(setting, viewing.viewer) === 'player_lines';
  };
  const teamsOf = new Map<string, string[]>();
  for (const link of links) {
    teamsOf.set(link.personId, [...(teamsOf.get(link.personId) ?? []), link.teamId]);
  }
  // Fail closed: a player with no known team, or with any team whose numbers are hidden
  // from this viewer, is left out entirely.
  const visible = totals.filter((row: PlayerTotalsRecord) => {
    const own = teamsOf.get(row.personId) ?? [];
    return own.length > 0 && own.every(shownTeam);
  });
  const people = await store.people(visible.map((row) => row.personId));
  const personOf = new Map(people.map((p) => [p.id, p]));
  const players: VisiblePlayer[] = visible.map((row) => {
    const person = personOf.get(row.personId);
    const own = [...new Set(teamsOf.get(row.personId) ?? [])].sort();
    const setting = settings.get(own[0] ?? '');
    const shown =
      person === undefined || setting === undefined
        ? undefined
        : showName(
            {
              firstName: person.firstName,
              lastName: person.lastName,
              isMinor: person.isMinor,
              nameRequest: person.visibility as 'none' | 'initials' | 'removed',
            },
            {
              audience: viewing.audience,
              policy: viewing.policy,
              viewer: viewing.viewer,
              statsOf: setting,
            },
          );
    const name: PlayerName =
      shown === undefined
        ? { text: null, hiddenBecause: 'no_name' }
        : shown.shown
          ? { text: shown.text, hiddenBecause: null }
          : { text: null, hiddenBecause: shown.why === 'removed' ? 'removed' : 'no_name' };
    return {
      personId: row.personId,
      name,
      teamIds: own,
      gamesPlayed: row.gamesPlayed,
      seconds: entryOf(row.secondsPlayed, row.secondsGames),
      stats: statsOf(row.stats),
    };
  });
  const totalsByTeam = new Map<string, Record<string, StatEntry>>();
  for (const row of teamTotalRows as readonly TeamStatTotalRecord[]) {
    const own = totalsByTeam.get(row.teamId) ?? {};
    own[row.statKey] = entryOf(row.total, row.gamesRecorded);
    totalsByTeam.set(row.teamId, own);
  }
  return {
    seasonId: season.id,
    statKeys: keys,
    players,
    teams: teams.map((team) => ({
      teamId: team.id,
      name: team.name,
      color: team.color,
      playerLinesShown: shownTeam(team.id),
      stats: totalsByTeam.get(team.id) ?? {},
    })),
  };
}
