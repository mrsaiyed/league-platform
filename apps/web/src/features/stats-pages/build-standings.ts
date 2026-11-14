// Turns core's standings (step 2.40) into what the shared standings table shows (step
// 2.41): the columns, each row's words, and the footnotes: an adjustment with its reason
// (S-10) and why tied teams are ordered as they are (S-9). Every word comes from the
// message file (T-187). The ranking is core's; this only writes it down.
import type { Standings, StandingsLine, StandingsTable as CoreTable } from '@srleagues/core';
import type { StandingsColumn, StandingsFootnote, StandingsRow } from '@srleagues/ui';
import { locale, t } from '../../server/messages.ts';

export type StandingsTableView = {
  readonly key: string;
  readonly caption: string;
  readonly columns: readonly StandingsColumn[];
  readonly rows: readonly StandingsRow[];
  readonly footnotes: readonly StandingsFootnote[];
};

const percent = new Intl.NumberFormat(locale, {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const signed = new Intl.NumberFormat(locale, { signDisplay: 'exceptZero' });

const orderKeys = {
  'head-to-head': 'standings.order.head-to-head',
  'point-difference': 'standings.order.point-difference',
  'points-scored': 'standings.order.points-scored',
  'fewest-points-allowed': 'standings.order.fewest-points-allowed',
  'coin-flip': 'standings.order.coin-flip',
  'still-tied': 'standings.order.still-tied',
} as const;

type OrderKey = keyof typeof orderKeys;
const isOrderKey = (value: string): value is OrderKey => Object.hasOwn(orderKeys, value);

function columnsOf(table: CoreTable, rankBy: Standings['rankBy']): StandingsColumn[] {
  const anyTies = table.lines.some((line) => line.ties > 0);
  return [
    { key: 'played', label: t('standings.col.played') },
    { key: 'wins', label: t('standings.col.wins') },
    { key: 'losses', label: t('standings.col.losses') },
    ...(anyTies ? [{ key: 'ties', label: t('standings.col.ties') }] : []),
    { key: 'winPercentage', label: t('standings.col.winPercentage') },
    ...(rankBy === 'points' ? [{ key: 'points', label: t('standings.col.points') }] : []),
    { key: 'pointsFor', label: t('standings.col.pointsFor') },
    { key: 'pointsAgainst', label: t('standings.col.pointsAgainst') },
    { key: 'pointDifference', label: t('standings.col.pointDifference') },
    { key: 'streak', label: t('standings.col.streak') },
  ];
}

function cellsOf(line: StandingsLine): Record<string, string | number> {
  return {
    played: line.gamesPlayed,
    wins: line.wins,
    losses: line.losses,
    ties: line.ties,
    winPercentage: percent.format(line.winPercentage),
    points: line.points ?? '',
    pointsFor: line.pointsFor,
    pointsAgainst: line.pointsAgainst,
    pointDifference: signed.format(line.pointDifference),
    streak:
      line.streak === null
        ? ''
        : t(`standings.streak.${line.streak.result}`, { length: line.streak.length }),
  };
}

function adjustmentText(f: CoreTable['footnotes'][number], rankBy: Standings['rankBy']): string {
  const part = (key: 'win' | 'loss' | 'tie' | 'point', amount: number): string[] =>
    amount === 0
      ? []
      : [
          t.plural(`standings.adjust.${key}`, Math.abs(amount), {
            sign: amount > 0 ? '+' : '-',
          }),
        ];
  const changes = [
    ...part('win', f.wins),
    ...part('loss', f.losses),
    ...part('tie', f.ties),
    ...(rankBy === 'points' ? part('point', f.points) : []),
  ].join(t('standings.adjustmentJoin'));
  return t('standings.adjustment', { changes, reason: f.reason });
}

function tableView(
  table: CoreTable,
  index: number,
  rankBy: Standings['rankBy'],
): StandingsTableView {
  const footnotes: StandingsFootnote[] = table.footnotes.map((f) => ({
    id: `adjustment-${f.number}`,
    text: adjustmentText(f, rankBy),
  }));
  const orderNoteIds = new Set<string>();
  const rows = table.lines.map((line): StandingsRow => {
    const notes = line.footnotes.map((n) => `adjustment-${n}`);
    if (isOrderKey(line.orderedBy)) {
      const id = `order-${line.orderedBy}`;
      if (!orderNoteIds.has(id)) {
        orderNoteIds.add(id);
        footnotes.push({ id, text: t(orderKeys[line.orderedBy]) });
      }
      notes.push(id);
    }
    return {
      id: line.team.id,
      seed: line.seed,
      team: line.team.name,
      color: line.team.color,
      cells: cellsOf(line),
      notes,
    };
  });
  return {
    key: table.division?.id ?? `table-${index}`,
    caption: table.division?.name ?? t('standings.allTeams'),
    columns: columnsOf(table, rankBy),
    rows,
    footnotes,
  };
}

export function buildStandingsViews(standings: Standings): StandingsTableView[] {
  return standings.tables.map((table, index) => tableView(table, index, standings.rankBy));
}
