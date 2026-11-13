// The full statistics table (P7 §6, §8): every visible player's totals and averages,
// and every team's totals. A team whose player numbers are hidden from this viewer
// (S-22, T-87) shows its totals and no player lines.
import { fail, ok, type Result } from '../../../command/index.ts';
import type { StandingsReadStore } from '../read-ports.ts';
import {
  statisticsSource,
  type StatisticsViewing,
  type TeamTotals,
  type VisiblePlayer,
} from '../statistics-source.ts';

export type StatisticsTable = {
  readonly seasonId: string;
  /** The statistics the season keeps, in its order. */
  readonly statKeys: readonly string[];
  readonly players: readonly VisiblePlayer[];
  readonly teams: readonly TeamTotals[];
};

export type ReadStatisticsTableError = { readonly code: 'season-not-found' };

export async function readStatisticsTable(
  store: StandingsReadStore,
  input: { readonly seasonId: string; readonly viewing: StatisticsViewing },
): Promise<Result<StatisticsTable, ReadStatisticsTableError>> {
  const source = await statisticsSource(store, input.seasonId, input.viewing);
  if (source === undefined) return fail({ code: 'season-not-found' });
  const players = [...source.players].sort(
    (a, b) =>
      (a.name.text ?? '￿').localeCompare(b.name.text ?? '￿') ||
      a.personId.localeCompare(b.personId),
  );
  return ok({
    seasonId: source.seasonId,
    statKeys: source.statKeys,
    players,
    teams: [...source.teams].sort(
      (a, b) => a.name.localeCompare(b.name) || a.teamId.localeCompare(b.teamId),
    ),
  });
}
