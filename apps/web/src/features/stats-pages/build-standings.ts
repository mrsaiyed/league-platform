// Turns core's standings (step 2.40) into what the shared standings table shows (step
// 2.41): the columns, each row's words, and the footnotes: an adjustment with its reason
// (S-10), and one note for each group of level teams saying what they are level on and
// what orders them (S-9; step 2.195). A note is marked beside every team of its group, so
// each of its words must be true of each of them: it never says one team was "placed
// above". Every word comes from the message file (T-187). The ranking is core's; this only
// writes it down.
import type {
  LevelGroup,
  Standings,
  StandingsLine,
  StandingsTable as CoreTable,
} from '@srleagues/core';
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
const whole = new Intl.NumberFormat(locale);

/**
 * A win percentage the way a basketball table writes it: .500, .667, 1.000 and .000, never
 * 0.500 (the numbers audit's L3). One way everywhere, the PCT column and the notes alike.
 */
const winPercentText = (value: number): string =>
  percent
    .formatToParts(value)
    .filter((part, n) => !(n === 0 && part.type === 'integer' && part.value === '0'))
    .map((part) => part.value)
    .join('');
const names = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' });

const tiebreakerNames = {
  'head-to-head': 'standings.tiebreaker.head-to-head',
  'point-difference': 'standings.tiebreaker.point-difference',
  'points-scored': 'standings.tiebreaker.points-scored',
  'fewest-points-allowed': 'standings.tiebreaker.fewest-points-allowed',
  'coin-flip': 'standings.tiebreaker.coin-flip',
} as const;

type Tiebreaker = keyof typeof tiebreakerNames;
const isTiebreaker = (value: string): value is Tiebreaker => Object.hasOwn(tiebreakerNames, value);

/** The note shared by every group that nothing in the rules separates. */
const stillTiedId = 'order-still-tied';

/** The season's tiebreakers by name, in its order: "head-to-head, then point difference". */
function tiebreakerList(tiebreakers: readonly string[]): string {
  return tiebreakers
    .filter(isTiebreaker)
    .map((key) => t(tiebreakerNames[key]))
    .join(t('standings.level.tiebreakerJoin'));
}

/** What two level teams' places come down to: the first team, and its number and the second's. */
function twoTeamReason(
  by: Tiebreaker,
  [first, second]: readonly [StandingsLine, StandingsLine],
  gamesBetween: number | null,
): string {
  const team = first.team.name;
  switch (by) {
    case 'point-difference':
      return t('standings.level.by.point-difference', {
        team,
        ahead: signed.format(first.pointDifference),
        behind: signed.format(second.pointDifference),
      });
    case 'points-scored':
      return t('standings.level.by.points-scored', {
        team,
        ahead: whole.format(first.pointsFor),
        behind: whole.format(second.pointsFor),
      });
    case 'fewest-points-allowed':
      return t('standings.level.by.fewest-points-allowed', {
        team,
        ahead: whole.format(first.pointsAgainst),
        behind: whole.format(second.pointsAgainst),
      });
    case 'coin-flip':
      return t('standings.level.by.coin-flip', { team });
    case 'head-to-head':
      // Only for two teams that met (levelNote): "the game" once, "the games" more often.
      return t.plural('standings.level.by.head-to-head', gamesBetween === 1 ? 1 : 2, { team });
  }
}

/** The shared note for teams nothing in the rules separates: true of each, however many. */
const stillTiedNote = () => ({ id: stillTiedId, text: t('standings.order.still-tied') });

/**
 * The note of the teams of one level group that have played, or the shared "nothing
 * separates them" note when nothing does and they share one place. Written only from the
 * stored rows: what they are level on, with its number, then for two teams what put the
 * first ahead, and otherwise the season's tiebreakers (which one placed which team is not
 * stored; step 2.198).
 */
function levelNote(
  group: LevelGroup,
  members: readonly StandingsLine[],
  tiebreakers: readonly string[],
): { readonly id: string | null; readonly text: string } {
  const stillTied = members.every((line) => line.orderedBy === 'still-tied');
  if (stillTied && new Set(members.map((line) => line.rank)).size === 1) return stillTiedNote();
  const [first, second] = members;
  const teams = names.format(members.map((line) => line.team.name));
  const level =
    group.on === 'points'
      ? t('standings.level.points', { teams, value: whole.format(first?.points ?? 0) })
      : t('standings.level.winPercentage', {
          teams,
          value: winPercentText(first?.winPercentage ?? 0),
        });
  const join = t('standings.level.sentenceJoin');
  const by = first?.orderedBy ?? '';
  // Head-to-head between two teams that never met (the team they were compared through is
  // in the bin, so its row is not shown) is not what put one ahead: the general sentence.
  const met = by !== 'head-to-head' || (group.gamesBetween ?? 0) > 0;
  if (
    first !== undefined &&
    second !== undefined &&
    members.length === 2 &&
    second.orderedBy === by &&
    isTiebreaker(by) &&
    met
  ) {
    return {
      id: null,
      text: [level, twoTeamReason(by, [first, second], group.gamesBetween)].join(join),
    };
  }
  // Three or more (or two whose stored reasons disagree): never which tiebreaker placed whom.
  const list = tiebreakerList(tiebreakers);
  const stillLevel = [
    ...new Set(members.filter((l) => l.orderedBy === 'still-tied').map((l) => l.rank)),
  ]
    .map((rank) => members.filter((l) => l.orderedBy === 'still-tied' && l.rank === rank))
    .filter((part) => part.length > 1);
  const sentences = [level];
  const partly = stillLevel.length > 0;
  if (list !== '') {
    sentences.push(
      t(partly ? 'standings.level.tiebreakersPartly' : 'standings.level.tiebreakers', {
        tiebreakers: list,
      }),
    );
  }
  for (const part of stillLevel) {
    sentences.push(
      t('standings.level.stillLevel', { teams: names.format(part.map((l) => l.team.name)) }),
    );
  }
  return { id: null, text: sentences.join(join) };
}

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

function tableView(table: CoreTable, index: number, standings: Standings): StandingsTableView {
  const footnotes: StandingsFootnote[] = table.footnotes.map((f) => ({
    id: `adjustment-${f.number}`,
    text: adjustmentText(f, standings.rankBy),
  }));
  // Each group's notes, in the table's order, and the note each team carries.
  const levelNotes = new Map<string, string>();
  const mark = (lines: readonly StandingsLine[], note: { id: string; text: string }) => {
    if (lines.length === 0) return;
    if (!footnotes.some((f) => f.id === note.id)) footnotes.push(note);
    for (const line of lines) levelNotes.set(line.team.id, note.id);
  };
  table.levelGroups.forEach((group, n) => {
    const members = group.teamIds.flatMap((id) => table.lines.filter((l) => l.team.id === id));
    // A team that has not played is level only because none counts as 0: it is told so,
    // and is in no note about the teams that have played.
    const idle = members.filter((line) => group.notPlayed.includes(line.team.id));
    const played = members.filter((line) => !group.notPlayed.includes(line.team.id));
    if (idle.length > 0) {
      mark(idle, {
        id: `not-played-${n + 1}`,
        text: t('standings.level.notPlayed', { teams: names.format(idle.map((l) => l.team.name)) }),
      });
    }
    if (played.length >= 2) {
      const note = levelNote(group, played, standings.tiebreakers);
      mark(played, { id: note.id ?? `level-${n + 1}`, text: note.text });
    } else {
      // One team that has played, level with idle ones only: nothing to compare it with,
      // unless nothing in the rules separated it from them.
      mark(
        played.filter((line) => line.orderedBy === 'still-tied'),
        stillTiedNote(),
      );
    }
  });
  const rows = table.lines.map((line): StandingsRow => {
    const level = levelNotes.get(line.team.id);
    return {
      id: line.team.id,
      seed: line.seed,
      team: line.team.name,
      color: line.team.color,
      cells: cellsOf(line),
      notes: [...line.footnotes.map((n) => `adjustment-${n}`), ...(level ? [level] : [])],
    };
  });
  return {
    key: table.division?.id ?? `table-${index}`,
    caption: table.division?.name ?? t('standings.allTeams'),
    columns: columnsOf(table, standings.rankBy),
    rows,
    footnotes,
  };
}

export function buildStandingsViews(standings: Standings): StandingsTableView[] {
  return standings.tables.map((table, index) => tableView(table, index, standings));
}
