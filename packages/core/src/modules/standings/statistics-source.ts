// What both statistics reads start from: the season's player totals with every player
// whose numbers this viewer may not see already taken out (S-22, T-87). It is taken out
// before anything is ranked, so a rank, a gap in ranks or a count can never show that a
// hidden player exists. Names come only through the one name function (T-81).
import { seasonTotals, type CaptureMode, type StatsGame } from '@srleagues/sports';
import { statisticsKept } from '../games/index.ts';
import type { Audience } from '../leagues/index.ts';
import {
  showName,
  statsShown,
  type NamePolicy,
  type TeamStatsSetting,
  type Viewer,
} from '../people/index.ts';
import type {
  DecidedGameLines,
  PlayerTotalsRecord,
  SeasonTeamRow,
  StandingsReadStore,
  TeamOwnTurnoversRecord,
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

const captureModes: readonly string[] = ['final', 'box', 'live'] satisfies CaptureMode[];

/** Totals of these players over the games of shown teams only (the calculation is packages/sports'). */
async function recompute(
  store: StandingsReadStore,
  seasonId: string,
  personIds: ReadonlySet<string>,
  hiddenTeamIds: ReadonlySet<string>,
): Promise<
  {
    personId: string;
    teamIds: string[];
    gamesPlayed: number;
    seconds: StatEntry;
    stats: Record<string, StatEntry>;
  }[]
> {
  const games = await store.decidedGamesOf(seasonId, [...personIds]);
  const statsGames: StatsGame[] = games.flatMap((game: DecidedGameLines) =>
    (game.status === 'final' || game.status === 'forfeit') &&
    captureModes.includes(game.captureMode)
      ? [
          {
            gameId: game.gameId,
            status: game.status,
            captureMode: game.captureMode as CaptureMode,
            homeTeamId: game.homeTeamId,
            awayTeamId: game.awayTeamId,
            lines: game.lines.filter((line) => personIds.has(line.personId)),
          },
        ]
      : [],
  );
  return seasonTotals(statsGames, { hiddenTeamIds }).map((total) => ({
    personId: total.personId,
    teamIds: [...total.teamIds],
    gamesPlayed: total.gamesPlayed,
    seconds: entryOf(total.seconds.total, total.seconds.gamesRecorded),
    stats: Object.fromEntries(
      Object.entries(total.stats).map(([key, t]) => [key, entryOf(t.total, t.gamesRecorded)]),
    ),
  }));
}

/**
 * A team's season total counts everything the team did (step 2.196, the numbers audit's
 * H1): the turnovers charged to the team itself, which are in no player's line, are
 * added to its turnovers, counted from each game's saved plays as the game's page counts
 * them. A game counts once among the games a team's turnovers were recorded in: it is
 * counted already when a line of one of the team's players carries turnovers (a tracked
 * game's lines always do), and added when none does.
 */
function addTeamTurnovers(
  totalsByTeam: Map<string, Record<string, StatEntry>>,
  records: readonly TeamOwnTurnoversRecord[],
): void {
  for (const own of records) {
    if (own.turnovers <= 0) continue;
    const stats = totalsByTeam.get(own.teamId) ?? {};
    const before = stats['turnovers'];
    const counted = own.countedByLines && before !== undefined;
    stats['turnovers'] = entryOf(
      (before?.total ?? 0) + own.turnovers,
      (before?.gamesRecorded ?? 0) + (counted ? 0 : 1),
    );
    totalsByTeam.set(own.teamId, stats);
  }
}

/** Undefined when the season is not in this league. */
export async function statisticsSource(
  store: StandingsReadStore,
  seasonId: string,
  viewing: StatisticsViewing,
): Promise<StatisticsSource | undefined> {
  const season = await store.findSeason(seasonId);
  const named = season === undefined ? undefined : await store.seasonStatKeys(season.id);
  if (season === undefined || named === undefined) return undefined;
  // "Statistics kept" (P7 §1): the same answer a game's box score draws its columns from.
  const keys = statisticsKept(named, season.rules);
  const [teams, totals, links, teamTotalRows, teamTurnoverGames] = await Promise.all([
    store.teams(season.id),
    store.playerTotals(season.id),
    store.playerTeams(season.id),
    store.teamStatTotals(season.id),
    store.teamTurnoverGames(season.id),
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
  // A player with no known team is left out (fail closed). A player whose teams are all
  // shown keeps the stored totals. A player on both a shown and a hidden team has the
  // stored totals thrown away and recomputed from the box score lines of the shown teams'
  // games only, so a hidden team's numbers never reach the page (S-22, record 033). A
  // player with only hidden teams, or with no line for a shown team, is left out.
  const mixed = new Set<string>();
  const stored: PlayerTotalsRecord[] = [];
  for (const row of totals) {
    const own = teamsOf.get(row.personId) ?? [];
    if (own.length === 0) continue;
    if (own.every(shownTeam)) stored.push(row);
    else if (own.some(shownTeam)) mixed.add(row.personId);
  }
  const hiddenTeamIds = new Set(teams.filter((t) => !shownTeam(t.id)).map((t) => t.id));
  const recomputed =
    mixed.size === 0 ? [] : await recompute(store, season.id, mixed, hiddenTeamIds);
  const rows: Array<{
    personId: string;
    teamIds: string[];
    gamesPlayed: number;
    seconds: StatEntry;
    stats: Record<string, StatEntry>;
  }> = [
    ...stored.map((row) => ({
      personId: row.personId,
      teamIds: [...new Set(teamsOf.get(row.personId) ?? [])].sort(),
      gamesPlayed: row.gamesPlayed,
      seconds: entryOf(row.secondsPlayed, row.secondsGames),
      stats: statsOf(row.stats),
    })),
    ...recomputed,
  ].sort((x, y) => (x.personId < y.personId ? -1 : x.personId > y.personId ? 1 : 0));
  const people = await store.people(rows.map((row) => row.personId));
  const personOf = new Map(people.map((p) => [p.id, p]));
  const players: VisiblePlayer[] = rows.map((row) => {
    const person = personOf.get(row.personId);
    const setting = settings.get(row.teamIds[0] ?? '');
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
          : // A name the league hides (R-24) is worded as a removed one's: no name at all.
            {
              text: null,
              hiddenBecause:
                shown.why === 'removed' || shown.why === 'hidden' ? 'removed' : 'no_name',
            };
    return {
      personId: row.personId,
      name,
      teamIds: row.teamIds,
      gamesPlayed: row.gamesPlayed,
      seconds: row.seconds,
      stats: row.stats,
    };
  });
  const totalsByTeam = new Map<string, Record<string, StatEntry>>();
  for (const row of teamTotalRows as readonly TeamStatTotalRecord[]) {
    const own = totalsByTeam.get(row.teamId) ?? {};
    own[row.statKey] = entryOf(row.total, row.gamesRecorded);
    totalsByTeam.set(row.teamId, own);
  }
  addTeamTurnovers(totalsByTeam, teamTurnoverGames);
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
