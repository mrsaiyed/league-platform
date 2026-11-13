// Stat leaders with the league's minimum-games rule (P7 §6). Players whose numbers this
// viewer may not see are taken out before ranking (S-22, T-87), so a rank never hints
// at them. Level players share a rank and the next is skipped (1, 2, 2, 4).
import { z } from 'zod';
import { fail, ok, type Result } from '../../../command/index.ts';
import type { StandingsReadStore } from '../read-ports.ts';
import { statisticsSource, type PlayerName, type StatisticsViewing } from '../statistics-source.ts';

export const statLeadersInput = z.object({
  seasonId: z.uuid(),
  /** A stat key, or 'seconds' for time on court. */
  measure: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/),
  by: z.enum(['total', 'average']).default('total'),
  /** The league's minimum games, counted as games the player entered. */
  minimumGames: z.number().int().min(0).max(1000).default(0),
  limit: z.number().int().min(1).max(500).optional(),
});

export type StatLeader = {
  readonly rank: number;
  readonly personId: string;
  readonly name: PlayerName;
  readonly teamIds: readonly string[];
  readonly value: number;
  readonly gamesPlayed: number;
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
    if (player.gamesPlayed < minimumGames) return [];
    return [{ player, value: by === 'total' ? entry.total : entry.average, entry }];
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
  return ok({
    seasonId: source.seasonId,
    measure,
    by,
    leaders: limit === undefined ? ranked : ranked.slice(0, limit),
  });
}
