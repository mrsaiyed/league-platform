// Stat leaders with the league's minimum-games rule (P7 §6). Players whose numbers this
// viewer may not see are taken out before ranking (S-22, T-87), so a rank never hints
// at them. Level players share a rank and the next is skipped (1, 2, 2, 4).
//
// Three rules make a board nobody can argue with (step 2.199). The minimum counts the
// games where the board's statistic was recorded, the games its average is over (S-63:
// one or two games should not put a player at the top). A player at 0 leads nothing and
// is not listed. A board cut to a number of places keeps everyone level with the last
// place it shows: two players level in fifth are both listed, never one chosen by an id.
import { z } from 'zod';
import { fail, ok, type Result } from '../../../command/index.ts';
import type { StandingsReadStore } from '../read-ports.ts';
import { statisticsSource, type PlayerName, type StatisticsViewing } from '../statistics-source.ts';

export const statLeadersInput = z.object({
  seasonId: z.uuid(),
  /** A stat key, or 'seconds' for time on court. */
  measure: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/),
  by: z.enum(['total', 'average']).default('total'),
  /** The league's minimum games, counted as the games where this statistic was recorded (S-63). */
  minimumGames: z.number().int().min(0).max(1000).default(0),
  /** How many places to show; everyone level with the last of them is shown too. */
  limit: z.number().int().min(1).max(500).optional(),
});

export type StatLeader = {
  readonly rank: number;
  readonly personId: string;
  readonly name: PlayerName;
  readonly teamIds: readonly string[];
  readonly value: number;
  readonly gamesPlayed: number;
  /** The games this statistic was recorded in: what the minimum counts and the average is over. */
  readonly gamesRecorded: number;
};

export type StatLeaders = {
  readonly seasonId: string;
  readonly measure: string;
  readonly by: 'total' | 'average';
  readonly leaders: readonly StatLeader[];
};

export type ReadStatLeadersError = { readonly code: 'season-not-found' };

export async function readStatLeaders(
  store: StandingsReadStore,
  input: z.input<typeof statLeadersInput>,
  viewing: StatisticsViewing,
): Promise<Result<StatLeaders, ReadStatLeadersError | { readonly code: 'invalid-input' }>> {
  const parsed = statLeadersInput.safeParse(input);
  if (!parsed.success) return fail({ code: 'invalid-input' });
  const { seasonId, measure, by, minimumGames, limit } = parsed.data;
  const source = await statisticsSource(store, seasonId, viewing);
  if (source === undefined) return fail({ code: 'season-not-found' });
  const rows = source.players.flatMap((player) => {
    const entry = measure === 'seconds' ? player.seconds : player.stats[measure];
    if (entry === undefined || entry.gamesRecorded === 0) return [];
    if (entry.gamesRecorded < minimumGames) return [];
    const value = by === 'total' ? entry.total : entry.average;
    // Nothing to their name in this statistic: no leader, and not listed below one.
    if (!(value > 0)) return [];
    return [{ player, value, entry }];
  });
  rows.sort((a, b) => b.value - a.value || a.player.personId.localeCompare(b.player.personId));
  const ranked: StatLeader[] = [];
  rows.forEach((row, index) => {
    const previous = ranked[index - 1];
    ranked.push({
      rank: previous !== undefined && previous.value === row.value ? previous.rank : index + 1,
      personId: row.player.personId,
      name: row.player.name,
      teamIds: row.player.teamIds,
      value: row.value,
      gamesPlayed: row.player.gamesPlayed,
      gamesRecorded: row.entry.gamesRecorded,
    });
  });
  // The last place shown, and everyone who shares it.
  const lastShown = limit === undefined ? undefined : ranked[limit - 1]?.rank;
  return ok({
    seasonId: source.seasonId,
    measure,
    by,
    leaders: lastShown === undefined ? ranked : ranked.filter((row) => row.rank <= lastShown),
  });
}
