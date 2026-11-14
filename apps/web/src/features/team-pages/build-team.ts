// What the teams list and a team's page draw (step 2.44): each team's record and seed, and
// one team's roster, games and statistics. Statistics follow the team's own setting through
// core: a team whose player lines this viewer may not see shows its totals and no player
// (S-22). The viewer is always the public one: the page is the same for everyone, and people
// allowed to see more get their own signed-in request later (step 2.46). Words come from the
// message file (T-187); nothing here reads anything but the ports it is given.
import {
  leagueUrl,
  publicTeam,
  publicViewer,
  readStatisticsTable,
  readTeamRecords,
  type LeagueAddressee,
  type PublicGame,
  type PublicRoster,
  type PublicRosterLine,
  type PublicSchedule,
  type StandingsReadStore,
  type TeamStanding,
} from '@srleagues/core';
import type { StatRow, StatsColumn } from '@srleagues/ui';
import type { LeagueClock } from '../../server/public-schedule.ts';
import type { PublicStatsSettings } from '../../server/public-stats.ts';
import { locale, t } from '../../server/messages.ts';
import { gameView, type GameView } from '../schedule-pages/index.ts';
import { statLabel } from '../stats-pages/index.ts';

export type TeamCard = {
  readonly slug: string;
  readonly name: string;
  readonly color: string | null;
  readonly href: string;
  readonly seedText: string;
  readonly recordText: string;
  readonly divisionName: string | null;
};

export function recordText(record: TeamStanding): string {
  return record.ties > 0
    ? t('teams.recordTies', { wins: record.wins, losses: record.losses, ties: record.ties })
    : t('teams.record', { wins: record.wins, losses: record.losses });
}

/** Every team of the season (teams in the bin are not in the read), with record and seed. */
export async function loadTeamCards(
  store: StandingsReadStore,
  league: LeagueAddressee,
  season: { readonly id: string; readonly slug: string },
  isCurrent: boolean,
): Promise<readonly TeamCard[] | undefined> {
  const records = await readTeamRecords(store, { seasonId: season.id });
  if (!records.ok) return undefined;
  const divisions = new Map((await store.divisions(season.id)).map((d) => [d.id, d.name]));
  return records.value.map((record) => ({
    slug: record.team.slug,
    name: record.team.name,
    color: record.team.color,
    href: leagueUrl(league, 'team', {
      team: record.team.slug,
      ...(isCurrent ? {} : { season: season.slug }),
    }),
    seedText: record.seed === null ? t('teams.noSeed') : String(record.seed),
    recordText: recordText(record),
    divisionName:
      record.team.divisionId === null ? null : (divisions.get(record.team.divisionId) ?? null),
  }));
}

export type RosterRowView = {
  readonly key: string;
  readonly number: string;
  readonly name: string;
  readonly role: string;
  readonly former: boolean;
};

const roles = ['player', 'captain', 'coach'] as const;

function dayText(day: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));
}

function nameText(line: PublicRosterLine): string {
  const name = line.name.shown ? line.name.text : t('team.nameNotShown');
  return line.leftOn === null ? name : t('team.nameLeft', { name, date: dayText(line.leftOn) });
}

export function rosterRow(line: PublicRosterLine): RosterRowView {
  const known = roles.find((r) => r === line.role);
  return {
    key: line.entryId,
    number: line.jerseyNumber ?? '',
    name: nameText(line),
    role: known === undefined ? t('team.role.player') : t(`team.role.${known}`),
    former: line.former,
  };
}

export type TeamGames = {
  readonly upcoming: readonly GameView[];
  readonly results: readonly GameView[];
};

const timeOf = (g: PublicGame): number | undefined =>
  g.startsAt !== null
    ? Date.parse(g.startsAt)
    : g.localDate !== null
      ? Date.parse(`${g.localDate}T12:00:00Z`)
      : undefined;

/** One team's games: the ones still to play by time (no time last), the finished ones newest first. */
export function buildTeamGames(
  schedule: PublicSchedule | undefined,
  teamSlug: string,
  clock: LeagueClock,
  league: LeagueAddressee,
): TeamGames {
  if (schedule === undefined) return { upcoming: [], results: [] };
  const mine = [...schedule.rounds.flatMap((r) => r.games), ...schedule.unplacedGames].filter(
    (g) => g.homeTeam.slug === teamSlug || g.awayTeam.slug === teamSlug,
  );
  const decided = (g: PublicGame) => g.status === 'final' || g.status === 'forfeit';
  const view = (g: PublicGame) => gameView(g, clock, league, schedule.season.slug);
  const results = mine
    .filter(decided)
    .sort(
      (a, b) => (timeOf(b) ?? Number.NEGATIVE_INFINITY) - (timeOf(a) ?? Number.NEGATIVE_INFINITY),
    )
    .map(view);
  const upcoming = mine
    .filter((g) => !decided(g) && g.status !== 'cancelled')
    .sort(
      (a, b) => (timeOf(a) ?? Number.POSITIVE_INFINITY) - (timeOf(b) ?? Number.POSITIVE_INFINITY),
    )
    .map(view);
  return { upcoming, results };
}

export type TeamStatsView = {
  /** False: this viewer sees only the team's totals (S-22). */
  readonly playerLinesShown: boolean;
  readonly playerColumns: readonly StatsColumn[];
  readonly playerRows: readonly StatRow[];
  readonly totalsColumns: readonly StatsColumn[];
  readonly totalsRows: readonly StatRow[];
  readonly hasNumbers: boolean;
};

const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

/** The team's totals and, when its setting lets the public see them, its players' lines. */
export async function loadTeamStats(
  store: StandingsReadStore,
  settings: PublicStatsSettings,
  input: { readonly leagueId: string; readonly seasonId: string; readonly teamId: string },
): Promise<TeamStatsView | undefined> {
  const table = await readStatisticsTable(store, {
    seasonId: input.seasonId,
    viewing: {
      leagueId: input.leagueId,
      viewer: publicViewer(input.leagueId),
      audience: settings.audience,
      policy: settings.namePolicy,
    },
  });
  if (!table.ok) return undefined;
  const team = table.value.teams.find((entry) => entry.teamId === input.teamId);
  const statColumns: StatsColumn[] = table.value.statKeys.map((key) => ({
    key,
    label: statLabel(key).short,
    fullName: statLabel(key).full,
    numeric: true,
  }));
  const playerColumns: StatsColumn[] = [
    { key: 'player', label: t('stats.col.player') },
    {
      key: 'games',
      label: t('stats.col.games'),
      fullName: t('stats.col.gamesFull'),
      numeric: true,
    },
    ...statColumns,
  ];
  const playerLinesShown = team?.playerLinesShown ?? false;
  // Core takes a hidden team's players out before this; the flag is checked again here.
  const players = playerLinesShown
    ? table.value.players.filter((p) => p.teamIds.includes(input.teamId))
    : [];
  // An opaque row key: a person's id does not go into the page.
  const playerRows: StatRow[] = players.map((player, index) => ({
    id: `player-${index}`,
    cells: {
      player: player.name.text ?? t('stats.unnamedPlayer'),
      games: player.gamesPlayed,
      ...Object.fromEntries(
        table.value.statKeys.map((key) => {
          const entry = player.stats[key];
          return [key, entry === undefined ? null : whole.format(entry.total)];
        }),
      ),
    },
  }));
  const totalsColumns: StatsColumn[] = [
    { key: 'team', label: t('team.totalsRow') },
    ...statColumns,
  ];
  const totalsRows: StatRow[] =
    team === undefined
      ? []
      : [
          {
            id: team.teamId,
            cells: {
              team: team.name,
              ...Object.fromEntries(
                table.value.statKeys.map((key) => {
                  const entry = team.stats[key];
                  return [key, entry === undefined ? null : whole.format(entry.total)];
                }),
              ),
            },
          },
        ];
  const hasNumbers =
    playerRows.length > 0 ||
    totalsRows.some((row) =>
      Object.entries(row.cells).some(([key, value]) => key !== 'team' && value !== null),
    );
  return { playerLinesShown, playerColumns, playerRows, totalsColumns, totalsRows, hasNumbers };
}

export type TeamPageData = {
  readonly team: {
    readonly slug: string;
    readonly name: string;
    readonly color: string | null;
    readonly divisionName: string | null;
  };
  readonly teamId: string;
  readonly seedText: string;
  readonly recordText: string;
  /** The line under the team's name, whole: seed, record and, if it has one, division. */
  readonly headline: string;
  readonly statsShown: 'player_lines' | 'team_totals';
};

/** The team's top-of-page facts, or undefined when no such team is in the season. */
export async function loadTeamHead(
  store: StandingsReadStore,
  leagueId: string,
  seasonId: string,
  teamSlug: string,
): Promise<TeamPageData | undefined> {
  const records = await readTeamRecords(store, { seasonId });
  if (!records.ok) return undefined;
  const record = records.value.find((r) => r.team.slug === teamSlug);
  if (record === undefined) return undefined;
  const [rows, divisions] = await Promise.all([store.teams(seasonId), store.divisions(seasonId)]);
  const row = rows.find((r) => r.id === record.team.id);
  if (row === undefined) return undefined;
  const division = divisions.find((d) => d.id === row.divisionId);
  const shown = publicTeam(
    {
      leagueId,
      id: row.id,
      slug: row.slug,
      name: row.name,
      color: row.color,
      statsVisibility: row.statsVisibility,
      division:
        division === undefined
          ? null
          : { id: division.id, name: division.name, color: division.color },
    },
    publicViewer(leagueId),
  );
  const seedText =
    record.seed === null ? t('team.noSeed') : t('team.seedLine', { seed: record.seed });
  return {
    team: {
      slug: row.slug,
      name: row.name,
      color: row.color,
      divisionName: division?.name ?? null,
    },
    teamId: row.id,
    seedText,
    recordText: recordText(record),
    headline:
      division === undefined
        ? t('team.headline', { seed: seedText, record: recordText(record) })
        : t('team.headlineDivision', {
            seed: seedText,
            record: recordText(record),
            name: division.name,
          }),
    statsShown: shown.statsShown,
  };
}

export type RosterView = {
  readonly current: readonly RosterRowView[];
  readonly former: readonly RosterRowView[];
};

export function buildRoster(roster: PublicRoster): RosterView {
  const rows = roster.lines.map(rosterRow);
  return { current: rows.filter((r) => !r.former), former: rows.filter((r) => r.former) };
}
