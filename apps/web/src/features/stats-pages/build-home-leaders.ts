// The home page's "Leading the way": the season's leaders in the sport's first statistic
// (points, in basketball), per game. It reads exactly what the statistics page reads, as
// the public viewer: a name comes from the one name function with the league's setting
// (a youth league shows a first name and an initial), and a player of a team whose
// numbers are staff only never reaches this file, because core takes them out first.
import { publicViewer, readStatLeaders, readStatisticsTable } from '@srleagues/core';
import type { StandingsReadStore } from '@srleagues/core';
import { locale, t } from '../../server/messages.ts';
import type { PublicStatsSettings } from '../../server/public-stats.ts';
import { statLabel } from './build-stats.ts';

/**
 * Statistics nobody is glad to lead: they stay in the tables and get no leader card
 * (decision S-48, in any league, until a league's setting says otherwise).
 */
const noLeaderCard: ReadonlySet<string> = new Set(['fouls', 'turnovers']);

/** How many leaders the home page can show at most. */
export const homeLeaderLimit = 3;

export type HomeLeader = {
  readonly id: string;
  /** A tiny label: the leader's place and what is led, "01 / Points". */
  readonly label: string;
  /** The number, written for the reader: "17.0". */
  readonly value: string;
  /** What the number is: "per game". */
  readonly unit: string;
  /** The player, as the league's name setting shows them. */
  readonly name: string;
  /** The team and the games played: "Owls · 6 games". */
  readonly detail: string;
  /** The player's team, for its shield; none for a player of several teams. */
  readonly team: { readonly name: string; readonly color: string | null } | undefined;
};

const perGame = new Intl.NumberFormat(locale, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * The first few leaders of a season, or none: when the season has no statistics yet, when
 * the sport's statistics are all ones nobody is glad to lead, or when the season is not
 * there (the page that asks has already answered that).
 */
export async function loadHomeLeaders(
  store: StandingsReadStore,
  settings: PublicStatsSettings,
  input: { readonly leagueId: string; readonly seasonId: string },
): Promise<readonly HomeLeader[]> {
  const viewing = {
    leagueId: input.leagueId,
    viewer: publicViewer(input.leagueId),
    audience: settings.audience,
    policy: settings.namePolicy,
  };
  const table = await readStatisticsTable(store, { seasonId: input.seasonId, viewing });
  if (!table.ok) return [];
  const measure = table.value.statKeys.find((key) => !noLeaderCard.has(key));
  if (measure === undefined) return [];
  const result = await readStatLeaders(
    store,
    {
      seasonId: input.seasonId,
      measure,
      by: 'average',
      minimumGames: settings.minimumGames,
      limit: homeLeaderLimit,
    },
    viewing,
  );
  if (!result.ok) return [];
  const teams = new Map(table.value.teams.map((team) => [team.teamId, team]));
  const stat = statLabel(measure).full;
  return (
    result.value.leaders
      // A leader with nothing to their name yet is no leader.
      .filter((leader) => leader.value > 0)
      .slice(0, homeLeaderLimit)
      .map((leader, index) => {
        const theirs = leader.teamIds.flatMap((id) => teams.get(id) ?? []);
        const only = theirs.length === 1 ? theirs[0] : undefined;
        return {
          id: leader.personId,
          label: t('home.leaders.label', { place: String(index + 1).padStart(2, '0'), stat }),
          value: perGame.format(leader.value),
          unit: t('home.leaders.perGame'),
          name: leader.name.text ?? t('stats.unnamedPlayer'),
          detail: t('stats.leaderDetail', {
            team: theirs.map((team) => team.name).join(t('stats.teamsJoin')),
            games: t.plural('stats.leaderGames', leader.gamesPlayed),
          }),
          team: only === undefined ? undefined : { name: only.name, color: only.color },
        };
      })
  );
}
