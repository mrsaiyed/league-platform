// The home page's "Leading the way": the season's leaders in the sport's first statistic
// (points, in basketball), per game. It reads exactly what the statistics page reads, as
// the public viewer: a name comes from the one name function with the league's setting
// (a youth league shows a first name and an initial), and a player of a team whose
// numbers are staff only never reaches this file, because core takes them out first.
import { publicViewer, readStatLeaders, readStatisticsTable } from '@srleagues/core';
import type { StandingsReadStore } from '@srleagues/core';
import { t } from '../../server/messages.ts';
import type { PublicStatsPorts, PublicStatsSettings } from '../../server/public-stats.ts';
import { leaderValues, noLeaderCard, statLabel } from './build-stats.ts';

/**
 * How many places the home page asks for. Players level with the last of them come too
 * (S-63: a board cut to a number of places shows everyone level with the last place).
 */
export const homeLeaderLimit = 3;

/** How many leaders' cards the section across the page draws at most: two rows of three. */
export const homeAcrossRoom = 6;

export type HomeLeader = {
  readonly id: string;
  /** The leader's place on the statistics page's board: level players share one. */
  readonly rank: number;
  /** A tiny label: the leader's place and what is led, "01 / Points". */
  readonly label: string;
  /** The number, written for the reader: "17.0". */
  readonly value: string;
  /** What the number is: "per game". */
  readonly unit: string;
  /** The player, as the league's name setting shows them. */
  readonly name: string;
  /** The team and the games the number is over: "Owls · 6 games". */
  readonly detail: string;
  /** The player's team, for its shield; none for a player of several teams. */
  readonly team: { readonly name: string; readonly color: string | null } | undefined;
};

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
 * The same for a page that holds the league's statistics ports: the statistics and the
 * league's name settings are read together, as one snapshot (statisticsOf, T-81), and
 * neither read can take the page down.
 */
export async function homeLeadersOf(
  ports: Pick<PublicStatsPorts, 'statisticsOf'>,
  input: { readonly leagueId: string; readonly seasonId: string },
): Promise<readonly HomeLeader[]> {
  try {
    return await ports.statisticsOf(input.leagueId, ({ store, settings }) =>
      loadHomeLeaders(store, settings, input),
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
      .map((leader, index, shown) => {
        const theirs = leader.teamIds.flatMap((id) => teams.get(id) ?? []);
        const only = theirs.length === 1 ? theirs[0] : undefined;
        return {
          // A place on this page only: a person's id does not go into the page.
          id: `leader-${index}`,
          rank: leader.rank,
          // The leader's rank, as the statistics page gives it: players who are level
          // share a place (01, 01, 03), they are not numbered by where they happen to stand.
          label: t('home.leaders.label', { place: String(leader.rank).padStart(2, '0'), stat }),
          // Written as the statistics page writes them: two that would read the same but
          // are not level get the decimals that tell them apart (step 2.199).
          value: leaderValues(shown, 'average')[index] ?? '',
          unit: t('home.leaders.perGame'),
          name: leader.name.text ?? t('stats.unnamedPlayer'),
          detail: t('stats.leaderDetail', {
            team: theirs.map((team) => team.name).join(t('stats.teamsJoin')),
            // The games the statistic was recorded in: what the average is over (S-63).
            games: t.plural('stats.leaderGames', leader.gamesRecorded),
          }),
          team: only === undefined ? undefined : { name: only.name, color: only.color },
        };
      })
  );
}

/** The leaders a part of the home page draws, in the room it has. */
export type HomeLeadersShown = {
  readonly leaders: readonly HomeLeader[];
  /**
   * A shared place the room could not hold all of: none of its players is drawn, and one
   * line says how many are level there and leads to the statistics page.
   */
  readonly levelCut?: { readonly place: number; readonly count: number } | undefined;
};

/**
 * Fits the leaders into room for `room` cards, a whole place at a time: everyone level
 * with the last place drawn is drawn, and a place that does not fit whole is not drawn at
 * all, so a page never keeps one of two level players and drops the other.
 */
export function fitHomeLeaders(leaders: readonly HomeLeader[], room: number): HomeLeadersShown {
  const shown: HomeLeader[] = [];
  let index = 0;
  while (index < leaders.length) {
    const rank = leaders[index]?.rank;
    const place = leaders.filter((leader) => leader.rank === rank);
    if (shown.length + place.length > room) {
      if (place.length > 1 && shown.length < room && rank !== undefined) {
        return { leaders: shown, levelCut: { place: rank, count: place.length } };
      }
      break;
    }
    shown.push(...place);
    index += place.length;
  }
  return { leaders: shown };
}
