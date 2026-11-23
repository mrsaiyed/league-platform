// The statistics page's data and the words around it. The page reads it as the public
// viewer: it is the cached page that looks the same for everyone. People allowed to see
// more get their own signed-in request after it (step 2.46, T-87, T-95, T-287), which reads
// it again as the viewer their roles make. Players of a team whose numbers this viewer may
// not see never reach this file: core takes them out first.
import {
  publicViewer,
  readStatLeaders,
  readStatisticsTable,
  type StatisticsTable,
  type StatLeader,
  type StatLeaders,
  type Viewer,
} from '@srleagues/core';
import type { Sort, StatRow, StatsColumn } from '@srleagues/ui';
import type { PublicStatsSettings } from '../../server/public-stats.ts';
import type { StandingsReadStore } from '@srleagues/core';
import { locale, t } from '../../server/messages.ts';

export type StatsBy = 'average' | 'total';

export const parseBy = (value: string | undefined): StatsBy =>
  value === 'total' ? 'total' : 'average';

const known = {
  points: ['stat.points', 'stat.points.short'],
  fg3: ['stat.fg3', 'stat.fg3.short'],
  fg1: ['stat.fg1', 'stat.fg1.short'],
  rebounds: ['stat.rebounds', 'stat.rebounds.short'],
  assists: ['stat.assists', 'stat.assists.short'],
  steals: ['stat.steals', 'stat.steals.short'],
  blocks: ['stat.blocks', 'stat.blocks.short'],
  turnovers: ['stat.turnovers', 'stat.turnovers.short'],
  fouls: ['stat.fouls', 'stat.fouls.short'],
} as const;

function isKnown(key: string): key is keyof typeof known {
  return Object.hasOwn(known, key);
}

/** True when the message file has words for this statistic. */
export const hasStatLabel = (key: string): boolean => isKnown(key);

/** A statistic's name and short name; a statistic we have no words for shows its own key. */
export function statLabel(key: string): { readonly full: string; readonly short: string } {
  return isKnown(key)
    ? { full: t(known[key][0]), short: t(known[key][1]) }
    : { full: key, short: key };
}

const average = new Intl.NumberFormat(locale, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

const shown = (value: number, by: StatsBy): string =>
  by === 'average' ? average.format(value) : whole.format(value);

/** The most decimals a leader's number is ever given beyond the usual one. */
const mostMore = 5;

/** A number written with `more` decimals beyond the usual: 7.33 for 7.3 with one more. */
const shownWithMore = (value: number, by: StatsBy, more: number): string =>
  more === 0
    ? shown(value, by)
    : new Intl.NumberFormat(locale, {
        minimumFractionDigits: by === 'average' ? 1 + more : 0,
        maximumFractionDigits: 1 + more,
      }).format(value);

/**
 * A board's numbers as the page writes them (step 2.199). Two players next to each other
 * who are not level but whose numbers would read the same (22 points in 3 games, 7.33, and
 * 29 in 4, 7.25: both "7.3") are both written with as many more decimals as tell them
 * apart, one almost always, so the page shows why one is ahead. Level players read the
 * same and share a place. The decimals are worked out once for each PLACE and every player
 * of that place is written with them, so two players shown the same number are always
 * level and two shown different numbers never are. Only the players this viewer sees are
 * on the board (S-22), so a number never gains a decimal because of a player who is not
 * shown.
 */
export function leaderValues(
  leaders: readonly { readonly rank: number; readonly value: number }[],
  by: StatsBy,
): string[] {
  const places: { readonly rank: number; readonly value: number }[] = [];
  for (const leader of leaders) {
    const last = places[places.length - 1];
    if (last === undefined || last.rank !== leader.rank) places.push(leader);
  }
  const more = places.map(() => 0);
  for (let index = 1; index < places.length; index += 1) {
    const above = places[index - 1];
    const here = places[index];
    if (above === undefined || here === undefined) continue;
    let extra = 0;
    while (
      extra < mostMore &&
      shownWithMore(above.value, by, extra) === shownWithMore(here.value, by, extra)
    ) {
      extra += 1;
    }
    more[index - 1] = Math.max(more[index - 1] ?? 0, extra);
    more[index] = Math.max(more[index] ?? 0, extra);
  }
  const moreByRank = new Map(places.map((place, index) => [place.rank, more[index] ?? 0]));
  return leaders.map((leader) => shownWithMore(leader.value, by, moreByRank.get(leader.rank) ?? 0));
}

export type LeaderBoard = {
  readonly key: string;
  readonly title: string;
  readonly columns: readonly StatsColumn[];
  readonly rows: readonly StatRow[];
  /**
   * Who leads, for the number card that opens the page: the name as the league's name
   * setting shows it, the number as the board's first line writes it, the games the
   * statistic was recorded in (what the number is over), and the player's team when they
   * have one team only. None while nobody is ranked.
   */
  readonly first?:
    | undefined
    | {
        readonly id: string;
        readonly name: string;
        readonly value: string;
        readonly games: number;
        readonly teams: string;
        readonly team?: { readonly name: string; readonly color: string | null } | undefined;
        /**
         * First place is shared: the next player has the same place. A page then names no
         * one leader on a card of their own; the list shows them level.
         */
        readonly tied: boolean;
      };
};

export type StatsPageData = {
  readonly by: StatsBy;
  readonly minimumGames: number;
  readonly leaders: readonly LeaderBoard[];
  readonly playerColumns: readonly StatsColumn[];
  readonly playerRows: readonly StatRow[];
  readonly teamColumns: readonly StatsColumn[];
  readonly teamRows: readonly StatRow[];
  /** Teams whose players' numbers this viewer does not see: only their totals are on the page. */
  readonly totalsOnlyTeams: readonly string[];
  /** Those of them that have totals on the page: the teams the note under "Teams" names. */
  readonly totalsNoteTeams: readonly string[];
  /** How both tables are sorted when the page opens; nothing while the sport has no statistic. */
  readonly openingSort: Sort | null;
  /** Sentences said once, above both tables, of what their numbers count. */
  readonly tableNotes: readonly string[] /**
   * A player who has played the games to be ranked has a statistic recorded in fewer of
   * them, so that column's top may be on no leaders board: the table says so.
   */;
  readonly recordedInFewer: boolean;
};

export type StatsFailure = { readonly code: 'season-not-found' | 'invalid-input' };

/** The places a board shows; everyone level with the last of them is shown too (core). */
const leaderLimit = 5;

/**
 * Statistics nobody is glad to lead: they stay in the tables and get no leaders card, on
 * the statistics page or the home page (decision S-48: in any league, until a league's
 * setting switches the cards on; that setting is a later step's).
 */
export const noLeaderCard: ReadonlySet<string> = new Set(['fouls', 'turnovers']);

export async function loadStatsPage(
  store: StandingsReadStore,
  settings: PublicStatsSettings,
  input: {
    readonly leagueId: string;
    readonly seasonId: string;
    readonly by: StatsBy;
    /** Who is looking, from the server's session; the public viewer when left out. */
    readonly viewer?: Viewer;
  },
): Promise<StatsPageData | StatsFailure> {
  const viewing = {
    leagueId: input.leagueId,
    viewer: input.viewer ?? publicViewer(input.leagueId),
    audience: settings.audience,
    policy: settings.namePolicy,
  };
  const table = await readStatisticsTable(store, { seasonId: input.seasonId, viewing });
  if (!table.ok) return { code: table.error.code };
  const boards: StatLeaders[] = [];
  for (const measure of table.value.statKeys) {
    // Fouls and turnovers are in the tables below and have no leaders card (S-48).
    if (noLeaderCard.has(measure)) continue;
    const result = await readStatLeaders(
      store,
      {
        seasonId: input.seasonId,
        measure,
        by: input.by,
        minimumGames: settings.minimumGames,
        limit: leaderLimit,
      },
      viewing,
    );
    if (!result.ok) return { code: result.error.code };
    boards.push(result.value);
  }
  return pageData(table.value, boards, settings, input.by);
}

function pageData(
  table: StatisticsTable,
  boards: readonly StatLeaders[],
  settings: PublicStatsSettings,
  by: StatsBy,
): StatsPageData {
  const teamName = new Map(table.teams.map((team) => [team.teamId, team.name]));
  const teamColor = new Map(table.teams.map((team) => [team.teamId, team.color]));
  // A player of one team carries that team's color and letter on their mark; one who
  // played for several gets a plain mark with no letter.
  const colorOf = (ids: readonly string[]): string | null =>
    ids.length === 1 ? (teamColor.get(ids[0] ?? '') ?? null) : null;
  const teamsOf = (ids: readonly string[]) =>
    ids
      .map((id) => teamName.get(id) ?? '')
      .filter((name) => name !== '')
      .join(', ');
  const playerName = (name: { readonly text: string | null }) =>
    name.text ?? t('stats.unnamedPlayer');
  const valueOf = (entry: { total: number; average: number } | undefined): string | null =>
    entry === undefined ? null : shown(by === 'average' ? entry.average : entry.total, by);
  // The numbers behind the written ones: a column is sorted by these, never by its words.
  const numbersOf = (
    stats: Readonly<Record<string, { total: number; average: number } | undefined>>,
  ): Record<string, number> =>
    Object.fromEntries(
      table.statKeys.flatMap((key) => {
        const entry = stats[key];
        return entry === undefined
          ? []
          : [[key, by === 'average' ? entry.average : entry.total] as const];
      }),
    );

  // A board's games are the games its statistic was recorded in: what its minimum counts
  // and its average is over (S-63, step 2.199), not always the games played.
  const leaderColumns: StatsColumn[] = [
    { key: 'player', label: t('stats.col.player') },
    { key: 'team', label: t('stats.col.team') },
    {
      key: 'games',
      label: t('stats.col.games'),
      fullName: t('stats.col.leaderGamesFull'),
      numeric: true,
    },
    { key: 'value', label: t('stats.col.value'), numeric: true },
  ];
  const firstOf = (board: StatLeaders, values: readonly string[]): LeaderBoard['first'] => {
    const leader = board.leaders[0];
    if (leader === undefined) return undefined;
    const only = leader.teamIds.length === 1 ? (leader.teamIds[0] ?? '') : '';
    const name = teamName.get(only);
    return {
      // The key of the board's first row (below): a place, never the person's id.
      id: 'leader-0',
      name: playerName(leader.name),
      value: values[0] ?? shown(leader.value, board.by),
      games: leader.gamesRecorded,
      teams: teamsOf(leader.teamIds),
      team: name === undefined ? undefined : { name, color: teamColor.get(only) ?? null },
      tied: board.leaders[1]?.rank === leader.rank,
    };
  };
  const leaders: LeaderBoard[] = boards.map((board) => {
    const values = leaderValues(board.leaders, board.by);
    return {
      key: board.measure,
      title: statLabel(board.measure).full,
      first: firstOf(board, values),
      columns: leaderColumns,
      rows: board.leaders.map(
        (leader: StatLeader, index): StatRow => ({
          // A place in this board, for this page only: never the person's id.
          id: `leader-${index}`,
          cells: {
            player: t('stats.leaderName', { rank: leader.rank, name: playerName(leader.name) }),
            team: teamsOf(leader.teamIds),
            games: leader.gamesRecorded,
            value: values[index] ?? shown(leader.value, board.by),
          },
        }),
      ),
    };
  });

  const statColumns: StatsColumn[] = table.statKeys.map((key) => ({
    key,
    label: statLabel(key).short,
    fullName: statLabel(key).full,
    numeric: true,
  }));
  const playerColumns: StatsColumn[] = [
    { key: 'player', label: t('stats.col.player') },
    { key: 'team', label: t('stats.col.team') },
    {
      key: 'games',
      label: t('stats.col.games'),
      fullName: t('stats.col.gamesFull'),
      numeric: true,
    },
    ...statColumns,
  ];
  // A place in this table, for this page only: a person's id does not go into the page.
  const playerRows: StatRow[] = table.players.map((player, index) => ({
    id: `player-${index}`,
    cells: {
      player: playerName(player.name),
      team: teamsOf(player.teamIds),
      games: player.gamesPlayed,
      ...Object.fromEntries(table.statKeys.map((key) => [key, valueOf(player.stats[key])])),
    },
    chips: { team: colorOf(player.teamIds) },
    sortValues: numbersOf(player.stats),
    // Listed, not ranked: too few games for the league's leaders. Core's leaders query
    // counts, for each board, the games its statistic was recorded in, never more than
    // the games played, so a player marked here is on no board. The games played are drawn
    // quieter and say so.
    ...(player.gamesPlayed < settings.minimumGames
      ? { quiet: { games: t('stats.notRankedYet') } }
      : {}),
    ...(player.teamIds.length > 1 ? { severalTeams: { team: true } } : {}),
  }));
  // A team's numbers come from the games where they were recorded (P7 §8), which may be
  // fewer than the games the standings count: the table says how many (step 2.195). A
  // statistic kept in fewer of them is averaged over its own games, as before.
  const teamColumns: StatsColumn[] = [
    { key: 'team', label: t('stats.col.team') },
    {
      key: 'games',
      label: t('stats.col.games'),
      fullName: t('stats.col.teamGamesFull'),
      numeric: true,
    },
    ...statColumns,
  ];
  const gamesWithStatistics = (stats: StatisticsTable['teams'][number]['stats']): number | null => {
    const counts = table.statKeys.flatMap((key) => {
      const entry = stats[key];
      return entry === undefined ? [] : [entry.gamesRecorded];
    });
    return counts.length === 0 ? null : Math.max(...counts);
  };
  const teamRows: StatRow[] = table.teams.map((team) => ({
    id: team.teamId,
    cells: {
      team: team.name,
      games: gamesWithStatistics(team.stats),
      ...Object.fromEntries(table.statKeys.map((key) => [key, valueOf(team.stats[key])])),
    },
    chips: { team: team.color },
    sortValues: numbersOf(team.stats),
  }));
  // The statistic both tables open sorted by, biggest first: points where the sport counts
  // them, otherwise the first statistic it has.
  const sortKey = table.statKeys.includes('points') ? 'points' : table.statKeys[0];
  // A row's statistic kept in fewer of its games than the GP beside it is averaged over its
  // own games (P7 §5.2, T6 §9): right, and a parent dividing by GP would get it wrong.
  const keptInFewer = (games: number | null, stats: StatisticsTable['teams'][number]['stats']) =>
    games !== null &&
    table.statKeys.some((key) => {
      const entry = stats[key];
      return entry !== undefined && entry.gamesRecorded < games;
    });
  const averagedOverFewer =
    by === 'average' &&
    (table.players.some((player) => keptInFewer(player.gamesPlayed, player.stats)) ||
      table.teams.some((team) => keptInFewer(gamesWithStatistics(team.stats), team.stats)));
  // Ranked by games played, but a statistic recorded in fewer than the minimum: the
  // table's first row may then be on no board (step 2.199, fix round L2).
  const recordedInFewer = table.players.some(
    (player) =>
      player.gamesPlayed >= settings.minimumGames &&
      Object.values(player.stats).some(
        (entry) =>
          entry !== undefined && entry.total > 0 && entry.gamesRecorded < settings.minimumGames,
      ),
  );
  return {
    by,
    minimumGames: settings.minimumGames,
    leaders,
    recordedInFewer,
    playerColumns,
    playerRows,
    teamColumns,
    teamRows,
    totalsOnlyTeams: table.teams.filter((team) => !team.playerLinesShown).map((team) => team.name),
    // Only a team that has totals on the page is named in the note: a team with no numbers
    // recorded shows none, and the note must not say it does.
    totalsNoteTeams: table.teams
      .filter(
        (team) =>
          !team.playerLinesShown && table.statKeys.some((key) => team.stats[key] !== undefined),
      )
      .map((team) => team.name),
    openingSort: sortKey === undefined ? null : { key: sortKey, direction: 'descending' },
    // What is said once, above both tables, of what their numbers count (step 2.195): which
    // games the statistics count, and, where it applies, that a statistic not kept in every
    // game is averaged over its own. A later sentence about both tables goes in this list.
    tableNotes: [
      t('stats.countsGames'),
      ...(averagedOverFewer ? [t('stats.averagedOverOwnGames')] : []),
      // A team's totals count everything the team did (step 2.196): its own turnovers and
      // its final scores, so they can differ from its players' numbers. Said only when a
      // team the viewer sees the players of has such a total in a column shown here.
      ...(table.teams.some((team) => team.countsMoreThanPlayers.length > 0)
        ? [t('stats.teamTotalsCountTeam')]
        : []),
    ],
  };
}
