// The statistics page's data and the words around it. The viewer is always the public
// one: the page is the cached page that looks the same for everyone, and people allowed
// to see more get their own signed-in request later (step 2.46, T-87, T-95). Players of
// a team whose numbers are staff only never reach this file: core takes them out first.
import {
  publicViewer,
  readStatLeaders,
  readStatisticsTable,
  type StatisticsTable,
  type StatLeader,
  type StatLeaders,
} from '@srleagues/core';
import type { StatRow, StatsColumn } from '@srleagues/ui';
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

export type LeaderBoard = {
  readonly key: string;
  readonly title: string;
  readonly columns: readonly StatsColumn[];
  readonly rows: readonly StatRow[];
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
};

export type StatsFailure = { readonly code: 'season-not-found' | 'invalid-input' };

const leaderLimit = 5;

export async function loadStatsPage(
  store: StandingsReadStore,
  settings: PublicStatsSettings,
  input: { readonly leagueId: string; readonly seasonId: string; readonly by: StatsBy },
): Promise<StatsPageData | StatsFailure> {
  const viewing = {
    leagueId: input.leagueId,
    viewer: publicViewer(input.leagueId),
    audience: settings.audience,
    policy: settings.namePolicy,
  };
  const table = await readStatisticsTable(store, { seasonId: input.seasonId, viewing });
  if (!table.ok) return { code: table.error.code };
  const boards: StatLeaders[] = [];
  for (const measure of table.value.statKeys) {
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
  const teamsOf = (ids: readonly string[]) =>
    ids
      .map((id) => teamName.get(id) ?? '')
      .filter((name) => name !== '')
      .join(', ');
  const playerName = (name: { readonly text: string | null }) =>
    name.text ?? t('stats.unnamedPlayer');
  const valueOf = (entry: { total: number; average: number } | undefined): string | null =>
    entry === undefined ? null : shown(by === 'average' ? entry.average : entry.total, by);

  const leaderColumns: StatsColumn[] = [
    { key: 'player', label: t('stats.col.player') },
    { key: 'team', label: t('stats.col.team') },
    {
      key: 'games',
      label: t('stats.col.games'),
      fullName: t('stats.col.gamesFull'),
      numeric: true,
    },
    { key: 'value', label: t('stats.col.value'), numeric: true },
  ];
  const leaders: LeaderBoard[] = boards.map((board) => ({
    key: board.measure,
    title: statLabel(board.measure).full,
    columns: leaderColumns,
    rows: board.leaders.map(
      (leader: StatLeader): StatRow => ({
        id: leader.personId,
        cells: {
          player: t('stats.leaderName', { rank: leader.rank, name: playerName(leader.name) }),
          team: teamsOf(leader.teamIds),
          games: leader.gamesPlayed,
          value: shown(leader.value, board.by),
        },
      }),
    ),
  }));

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
  const playerRows: StatRow[] = table.players.map((player) => ({
    id: player.personId,
    cells: {
      player: playerName(player.name),
      team: teamsOf(player.teamIds),
      games: player.gamesPlayed,
      ...Object.fromEntries(table.statKeys.map((key) => [key, valueOf(player.stats[key])])),
    },
  }));
  const teamColumns: StatsColumn[] = [{ key: 'team', label: t('stats.col.team') }, ...statColumns];
  const teamRows: StatRow[] = table.teams.map((team) => ({
    id: team.teamId,
    cells: {
      team: team.name,
      ...Object.fromEntries(table.statKeys.map((key) => [key, valueOf(team.stats[key])])),
    },
  }));
  return {
    by,
    minimumGames: settings.minimumGames,
    leaders,
    playerColumns,
    playerRows,
    teamColumns,
    teamRows,
    totalsOnlyTeams: table.teams.filter((team) => !team.playerLinesShown).map((team) => team.name),
  };
}
