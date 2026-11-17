// A team's statistics as words ready to draw (step 2.46): what TeamStatsDrawn draws, worked
// out on the server. The team page as everyone gets it draws the public viewer's; the
// signed-in request after it (T-95, T-287) sends a staff viewer's in the same shape, so both
// are drawn by the one component, every word from the message files on the server (T-187).
import type { Sort, StatRow, StatsColumn, StatsTableLabels } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { locale, t } from '../../server/messages.ts';
import type { TeamStatsView } from './build-team.ts';

/** How many statistics a team's totals may have and still stand beside the players' table. */
const besideLimit = 4;

export type TeamStatsDrawnView =
  | { readonly kind: 'none'; readonly text: string }
  | {
      readonly kind: 'numbers';
      readonly totalsLabel: string;
      readonly totals: readonly {
        readonly key: string;
        readonly label: string;
        readonly value: string;
      }[];
      /** Said under the totals of a team whose players this viewer does not see. */
      readonly totalsOnlyNote: string | null;
      readonly beside: boolean;
      readonly players: {
        readonly caption: string;
        readonly columns: readonly StatsColumn[];
        readonly rows: readonly StatRow[];
        readonly initialSort: Sort | null;
      } | null;
      readonly labels: StatsTableLabels;
      readonly locale: string;
    };

/**
 * The team's statistics as its setting allows this viewer: totals always, player lines
 * when shown. A team with nothing recorded says so, whoever may see its players.
 */
export function teamStatsView(stats: TeamStatsView): TeamStatsDrawnView {
  if (!stats.hasNumbers) return { kind: 'none', text: t('team.statsNone') };
  const first = stats.totalsRows[0];
  const totals =
    first === undefined
      ? []
      : stats.totalsColumns.slice(1).flatMap((column) => {
          const value = first.cells[column.key];
          return value === null || value === undefined
            ? []
            : [{ key: column.key, label: column.fullName ?? column.label, value: String(value) }];
        });
  // The players open sorted by points, biggest first, as on the statistics page; by the
  // first statistic where the sport has no points.
  const sortColumn =
    stats.playerColumns.find((column) => column.key === 'points') ??
    stats.playerColumns.find((column) => column.numeric === true && column.key !== 'games');
  const players =
    stats.playerLinesShown && stats.playerRows.length > 0
      ? {
          caption: t('team.statsPlayers'),
          columns: stats.playerColumns,
          rows: stats.playerRows,
          initialSort:
            sortColumn === undefined
              ? null
              : { key: sortColumn.key, direction: 'descending' as const },
        }
      : null;
  return {
    kind: 'numbers',
    totalsLabel: t('team.statsTotals'),
    totals,
    totalsOnlyNote: stats.playerLinesShown ? null : t('team.statsTotalsOnly'),
    beside: totals.length > 0 && stats.totalsColumns.length - 1 <= besideLimit,
    players,
    labels: displayLabels(t).stats,
    locale,
  };
}
