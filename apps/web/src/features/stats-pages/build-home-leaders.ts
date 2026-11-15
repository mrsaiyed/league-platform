// The home page's "Leading the way": the season's leaders in the sport's first statistic
// (points, in basketball), per game. It reads exactly what the statistics page reads, as
// the public viewer: a name comes from the one name function with the league's setting
// (a youth league shows a first name and an initial), and a player of a team whose
// numbers are staff only never reaches this file, because core takes them out first.
import { publicViewer, readStatLeaders, readStatisticsTable } from '@srleagues/core';
import type { StandingsReadStore } from '@srleagues/core';
import { locale, t } from '../../server/messages.ts';
import type { PublicStatsPorts, PublicStatsSettings } from '../../server/public-stats.ts';
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
 * The same store, with each of its reads made once however often it is asked for. The two
 * core reads below both start from the season's player totals: through this they share
 * one set of reads for one visit, and the store's own shape is untouched.
 */
function readOnce(store: StandingsReadStore): StandingsReadStore {
  const made = new Map<string, unknown>();
  return new Proxy(store, {
    get(target, name, receiver) {
      const read: unknown = Reflect.get(target, name, receiver);
      if (typeof read !== 'function') return read;
      return (...args: readonly unknown[]): unknown => {
        const key = `${String(name)}:${JSON.stringify(args)}`;
        if (!made.has(key)) made.set(key, Reflect.apply(read, target, args));
        return made.get(key);
      };
    },
  });
}

/**
 * The first few leaders of a season, or none: when the season has no statistics yet, when
 * the sport's statistics are all ones nobody is glad to lead, when the season is not
 * there (the page that asks has already answered that), or when the statistics cannot be
 * read just now. The home page is never taken down by its leaders: without them it leaves
 * the section out.
 */
export async function loadHomeLeaders(
  store: StandingsReadStore,
  settings: PublicStatsSettings,
  input: { readonly leagueId: string; readonly seasonId: string },
): Promise<readonly HomeLeader[]> {
  try {
    return await readHomeLeaders(readOnce(store), settings, input);
  } catch {
    return [];
  }
}

/**
 * The same for a page that holds the league's statistics ports: the league's settings are
 * read here too, so that neither read can take the page down.
 */
export async function homeLeadersOf(
  ports: Pick<PublicStatsPorts, 'readStoreOf' | 'settingsOf'>,
  input: { readonly leagueId: string; readonly seasonId: string },
): Promise<readonly HomeLeader[]> {
  try {
    return await loadHomeLeaders(
      ports.readStoreOf(input.leagueId),
      await ports.settingsOf(input.leagueId),
      input,
    );
  } catch {
    return [];
  }
}

async function readHomeLeaders(
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
      .map((leader) => {
        const theirs = leader.teamIds.flatMap((id) => teams.get(id) ?? []);
        const only = theirs.length === 1 ? theirs[0] : undefined;
        return {
          id: leader.personId,
          // The leader's rank, as the statistics page gives it: players who are level
          // share a place (01, 01, 03), they are not numbered by where they happen to stand.
          label: t('home.leaders.label', { place: String(leader.rank).padStart(2, '0'), stat }),
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
