// The statistics page's leaders and tables as words ready to draw (step 2.46): what
// StatsTablesDrawn draws, worked out on the server from the page's data. The page as
// everyone gets it draws the public viewer's; the signed-in request after it (T-95, T-287)
// sends a staff viewer's in the same shape, so both are drawn by the one component and
// the words of both come from the message files on the server (T-187).
import type {
  LeaderEntry,
  LeaderSpotProps,
  Sort,
  StatRow,
  StatsColumn,
  StatsTableLabels,
} from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { locale, t } from '../../server/messages.ts';
import type { LeaderBoard, StatsPageData } from './build-stats.ts';

/** How many statistics open with a number card: three, as many as stand across a laptop. */
const cardLimit = 3;

/** One statistic's column: its number card, if it has one, and the rest of its list. */
export type LeaderColumnView = {
  readonly key: string;
  readonly title: string;
  readonly card: LeaderSpotProps | null;
  readonly entries: readonly LeaderEntry[];
};

/** One of the two tables under the leaders. */
export type StatsTableView = {
  readonly title: string;
  readonly note: string | null;
  readonly columns: readonly StatsColumn[];
  readonly rows: readonly StatRow[];
  readonly initialSort: Sort | null;
};

export type StatsTablesView =
  | {
      readonly kind: 'empty';
      readonly text: string;
      readonly action: { readonly href: string; readonly label: string } | null;
    }
  | {
      readonly kind: 'tables';
      readonly leaders: {
        readonly title: string;
        readonly note: string | null;
        readonly columns: readonly LeaderColumnView[];
        readonly noneText: string;
      };
      readonly tableNote: string;
      /** Few statistics: the players' table and the teams' sit side by side on a laptop. */
      readonly sideBySide: boolean;
      readonly players: StatsTableView;
      readonly teams: StatsTableView;
      readonly labels: StatsTableLabels;
      readonly locale: string;
    };

/** One leader board as the card draws it: each leader's place and name, team and games, and number. */
function leaderEntries(board: LeaderBoard): readonly LeaderEntry[] {
  return board.rows.map((row) => {
    const games = row.cells['games'];
    return {
      id: row.id,
      name: String(row.cells['player'] ?? ''),
      detail: t('stats.leaderDetail', {
        team: String(row.cells['team'] ?? ''),
        games: t.plural('stats.leaderGames', typeof games === 'number' ? games : 0),
      }),
      value: String(row.cells['value'] ?? ''),
    };
  });
}

/** The leaders, the full table of players and the teams' totals, in words. */
export function statsTablesView(
  data: StatsPageData,
  /** Where "See the full schedule" goes while no numbers have been recorded. */
  scheduleHref?: string,
): StatsTablesView {
  const labels = displayLabels(t);
  const boards = data.leaders.filter((board) => board.rows.length > 0);
  const hasNumbers =
    data.playerRows.length > 0 ||
    data.teamRows.some((row) =>
      Object.entries(row.cells).some(([key, value]) => key !== 'team' && value !== null),
    );
  if (!hasNumbers) {
    return {
      kind: 'empty',
      text: t('stats.empty'),
      action:
        scheduleHref === undefined ? null : { href: scheduleHref, label: t('home.fullSchedule') },
    };
  }
  // Each statistic is a column of its own. The first three that one player leads alone
  // open with a number card (one very large number, the first on the league's main color),
  // and the rest of that statistic's list stands right under its own card, going on from
  // second place: the leader is not said twice. A statistic whose first place is shared
  // names no one leader: it has no card, and its list shows the players level at 1. So
  // does a statistic after the third card: a plain list from first place.
  const alone = boards.filter((board) => board.first !== undefined && !board.first.tied);
  const carded = new Set(alone.slice(0, cardLimit).map((board) => board.key));
  const firstCard = boards.find((board) => carded.has(board.key))?.key;
  const columns: LeaderColumnView[] = boards.map((board) => {
    const entries = leaderEntries(board);
    const first = carded.has(board.key) ? board.first : undefined;
    return {
      key: board.key,
      title: board.title,
      card:
        first === undefined
          ? null
          : {
              label: t('stats.leaderOf', { stat: board.title }),
              value: first.value,
              unit: t(data.by === 'average' ? 'home.leaders.perGame' : 'stats.inAll'),
              name: first.name,
              detail: t('stats.leaderDetail', {
                team: first.teams,
                games: t.plural('stats.leaderGames', first.games),
              }),
              team: first.team,
              first: board.key === firstCard,
            },
      entries: first === undefined ? entries : entries.slice(1),
    };
  });
  return {
    kind: 'tables',
    leaders: {
      title: t('stats.leaders'),
      note: data.minimumGames > 0 ? t.plural('stats.minimumGames', data.minimumGames) : null,
      columns,
      noneText: t('stats.leadersNone'),
    },
    // What both tables' numbers count, said once above them (build-stats.ts, tableNotes).
    tableNote: data.tableNotes.join(t('stats.noteJoin')),
    sideBySide: data.playerColumns.length <= 7,
    players: {
      title: t('stats.allPlayers'),
      // Said where the eye is: the table lists everyone and opens sorted by points, so its
      // first row may be a player with too few games to lead a card above. A player can also
      // have played enough games and a statistic recorded in fewer: then that column's top
      // may be on no board, and the table says why.
      note:
        [
          data.playerRows.some((row) => row.quiet !== undefined)
            ? t.plural('stats.listedNotRanked', data.minimumGames)
            : undefined,
          data.recordedInFewer ? t.plural('stats.recordedNotRanked', data.minimumGames) : undefined,
        ]
          .filter((sentence) => sentence !== undefined)
          .join(t('stats.noteJoin')) || null,
      columns: data.playerColumns,
      rows: data.playerRows,
      initialSort: data.openingSort,
    },
    teams: {
      title: t('stats.teams'),
      note:
        data.totalsNoteTeams.length > 0
          ? t('stats.teamsTotalsOnly', { teams: data.totalsNoteTeams.join(t('stats.teamsJoin')) })
          : null,
      columns: data.teamColumns,
      rows: data.teamRows,
      initialSort: data.openingSort,
    },
    labels: labels.stats,
    locale,
  };
}
