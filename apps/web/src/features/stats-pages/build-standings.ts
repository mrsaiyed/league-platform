// Turns core's standings (step 2.40) into what the shared standings table shows (step
// 2.41): the columns, each row's words, and the footnotes: an adjustment with its reason
// (S-10), and one note for each group of level teams saying what they are level on and
// what orders them (S-9; step 2.195). A note is marked beside every team of its group, so
// each of its words must be true of each of them: it never says one team was "placed
// above". For three or more it says exactly what placed each of them, from the engine's
// own steps (step 2.198, S-74). Every word comes from the message file (T-187). The
// ranking is core's; this only writes it down.
import type {
  LevelGroup,
  Standings,
  StandingsLine,
  StandingsTable as CoreTable,
} from '@srleagues/core';
import type { TiebreakStep } from '@srleagues/sports';
import type { StandingsColumn, StandingsFootnote, StandingsRow } from '@srleagues/ui';
import { locale, t } from '../../server/messages.ts';

export type StandingsTableView = {
  readonly key: string;
  readonly caption: string;
  readonly columns: readonly StandingsColumn[];
  readonly rows: readonly StandingsRow[];
  readonly footnotes: readonly StandingsFootnote[];
  /**
   * The same notes for the home page's small table (step 2.198, the lead's answer (a)): a
   * level-teams note keeps only its first sentence, who is level and on what, which is true
   * beside each of them; the reasons are on the standings page. Every other note is whole.
   */
  readonly briefFootnotes: readonly StandingsFootnote[];
};

/** A note, and its first sentence when the home page shows less of it. */
type Note = { readonly id: string; readonly text: string; readonly brief?: string };

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
/** Each team with its figure, side by side: "Lions 1–0, Tigers 1–1, Bears 0–1". */
const entries = new Intl.ListFormat(locale, { style: 'short', type: 'unit' });

const tiebreakerNames = {
  'head-to-head': 'standings.tiebreaker.head-to-head',
  'point-difference': 'standings.tiebreaker.point-difference',
  'points-scored': 'standings.tiebreaker.points-scored',
  'fewest-points-allowed': 'standings.tiebreaker.fewest-points-allowed',
  'coin-flip': 'standings.tiebreaker.coin-flip',
} as const;

type Tiebreaker = keyof typeof tiebreakerNames;
const isTiebreaker = (value: string): value is Tiebreaker => Object.hasOwn(tiebreakerNames, value);

/** The note of a team no longer in the league, kept in the table for its results (A-17). */
const removedNote = 'removed-team';

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

/** What a tiebreaker that put one team ahead of one other says, with both figures. */
const aheadOf = {
  'point-difference': 'standings.level.ahead.point-difference',
  'points-scored': 'standings.level.ahead.points-scored',
  'fewest-points-allowed': 'standings.level.ahead.fewest-points-allowed',
} as const;

/** What a tiebreaker that left them all level says, with the figure they share. */
const alsoLevelOn = {
  'point-difference': 'standings.level.alsoLevel.point-difference',
  'points-scored': 'standings.level.alsoLevel.points-scored',
  'fewest-points-allowed': 'standings.level.alsoLevel.fewest-points-allowed',
} as const;

/** What a tiebreaker that ordered three or more says, each team with its figure. */
const orderedBy = {
  'point-difference': 'standings.level.order.point-difference',
  'points-scored': 'standings.level.order.points-scored',
  'fewest-points-allowed': 'standings.level.order.fewest-points-allowed',
  'coin-flip': 'standings.level.order.coin-flip',
} as const;

/** "these three", "these four": a word up to ten, then the number. */
const numberWords = {
  3: 'standings.level.number.3',
  4: 'standings.level.number.4',
  5: 'standings.level.number.5',
  6: 'standings.level.number.6',
  7: 'standings.level.number.7',
  8: 'standings.level.number.8',
  9: 'standings.level.number.9',
  10: 'standings.level.number.10',
} as const;

const isNumberWord = (n: number): n is keyof typeof numberWords => Object.hasOwn(numberWords, n);
const countText = (n: number): string => (isNumberWord(n) ? t(numberWords[n]) : whole.format(n));

type Figured = Exclude<Tiebreaker, 'head-to-head' | 'coin-flip'>;

/** A figure as the table writes it: a difference signed, the others whole numbers. */
const figureText = (by: Figured, value: number | null): string =>
  by === 'point-difference' ? signed.format(value ?? 0) : whole.format(value ?? 0);

/**
 * The note's sentences after "level on…", from the engine's steps (step 2.198, S-74), so
 * that what placed each team is said, with its numbers:
 * - head-to-head on all of them: each team's record in the games among them, or, when it
 *   could not apply, who has played none of the others; on some of them, their records
 *   only when it put one ahead (when it left them level, the teams' records among all of
 *   them already showed it, and the next sentence says what did separate them);
 * - another tiebreaker: what it put ahead of what, with the figures, or the figure they
 *   are all level on, so it is plain why the next one was needed;
 * - last, the teams nothing separated.
 * Every team is named in the table's order, which no step contradicts.
 */
function stepSentences(
  steps: readonly TiebreakStep[],
  members: readonly StandingsLine[],
): string[] {
  const nameOf = new Map(members.map((line) => [line.team.id, line.team.name]));
  const position = new Map(members.map((line, n) => [line.team.id, n]));
  const inTableOrder = <T extends { readonly teamId: string }>(items: readonly T[]): T[] =>
    [...items].sort((a, b) => (position.get(a.teamId) ?? 0) - (position.get(b.teamId) ?? 0));
  const named = (items: readonly { readonly teamId: string }[]) =>
    names.format(inTableOrder(items).map((item) => nameOf.get(item.teamId) ?? ''));
  const sentences: string[] = [];
  for (const step of steps) {
    const teams = inTableOrder(step.teams);
    const onAll = teams.length === members.length;
    const apart = teams.some((team) => team.place !== 1);
    const by = step.tiebreaker;
    if (by === 'head-to-head') {
      if (!step.applied) {
        if (!onAll) continue;
        const none = teams.filter(
          (team) =>
            (team.record?.wins ?? 0) + (team.record?.losses ?? 0) + (team.record?.ties ?? 0) === 0,
        );
        sentences.push(
          none.length === teams.length
            ? t('standings.level.metNoneOfThem')
            : t.plural('standings.level.metNone', none.length, { teams: named(none) }),
        );
        continue;
      }
      if (!onAll && !apart) continue;
      const withTies = teams.some((team) => (team.record?.ties ?? 0) > 0);
      const records = entries.format(
        teams.map((team) =>
          t('standings.level.entry', {
            team: nameOf.get(team.teamId) ?? '',
            figure: t(withTies ? 'standings.level.recordTies' : 'standings.level.record', {
              wins: whole.format(team.record?.wins ?? 0),
              losses: whole.format(team.record?.losses ?? 0),
              ties: whole.format(team.record?.ties ?? 0),
            }),
          }),
        ),
      );
      if (onAll) {
        sentences.push(
          t('standings.level.amongThese', { count: countText(teams.length), records }),
        );
      } else {
        sentences.push(
          t(teams.length === 2 ? 'standings.level.between' : 'standings.level.among', {
            teams: named(teams),
            records,
          }),
        );
      }
      continue;
    }
    // A coin flip none recorded covers: the last sentence says they are still level.
    if (!step.applied) continue;
    if (by === 'coin-flip') {
      const [first, second] = teams;
      if (teams.length === 2 && first !== undefined && second !== undefined) {
        sentences.push(
          t('standings.level.ahead.coin-flip', {
            team: nameOf.get(first.teamId) ?? '',
            other: nameOf.get(second.teamId) ?? '',
          }),
        );
      } else {
        const values = entries.format(teams.map((team) => nameOf.get(team.teamId) ?? ''));
        sentences.push(t(orderedBy['coin-flip'], { values }));
      }
      continue;
    }
    // A figure is the team's own, the same in every step: once given, it is not given again
    // when the teams it left level start the list again among themselves.
    const told = steps
      .slice(0, steps.indexOf(step))
      .some(
        (earlier) =>
          earlier.tiebreaker === by &&
          earlier.applied &&
          teams.every((team) => earlier.teams.some((e) => e.teamId === team.teamId)),
      );
    if (told) continue;
    if (!apart) {
      // Teams it leaves level for good are told so once, last.
      const lines = teams.map((team) => members.find((l) => l.team.id === team.teamId));
      const forGood = lines.every(
        (l) => l?.orderedBy === 'still-tied' && l.rank === lines[0]?.rank,
      );
      if (forGood) continue;
      sentences.push(
        t(alsoLevelOn[by], { teams: named(teams), value: figureText(by, teams[0]?.value ?? 0) }),
      );
      continue;
    }
    const [first, second] = teams;
    if (teams.length === 2 && first !== undefined && second !== undefined) {
      sentences.push(
        t(aheadOf[by], {
          team: nameOf.get(first.teamId) ?? '',
          other: nameOf.get(second.teamId) ?? '',
          ahead: figureText(by, first.value),
          behind: figureText(by, second.value),
        }),
      );
      continue;
    }
    const values = entries.format(
      teams.map((team) =>
        t('standings.level.entry', {
          team: nameOf.get(team.teamId) ?? '',
          figure: figureText(by, team.value),
        }),
      ),
    );
    sentences.push(t(orderedBy[by], { values }));
  }
  // Teams that share a place: nothing in the tiebreakers separates them.
  const ranks = [
    ...new Set(members.filter((l) => l.orderedBy === 'still-tied').map((l) => l.rank)),
  ];
  for (const rank of ranks) {
    const part = members.filter((l) => l.orderedBy === 'still-tied' && l.rank === rank);
    if (part.length < 2) continue;
    sentences.push(
      t('standings.level.unbroken', { teams: names.format(part.map((l) => l.team.name)) }),
    );
  }
  return sentences;
}

/** The shared note for teams nothing in the rules separates: true of each, however many. */
const stillTiedNote = () => ({ id: stillTiedId, text: t('standings.order.still-tied') });

/**
 * The note of the teams of one level group that have played, or the shared "nothing
 * separates them" note when nothing does and they share one place. Written only from the
 * stored rows: what they are level on, with its number, then for two teams what put the
 * first ahead; for three or more, the steps the engine kept (step 2.198), and where they
 * are not known, the season's tiebreakers only.
 */
function levelNote(
  group: LevelGroup,
  members: readonly StandingsLine[],
  tiebreakers: readonly string[],
): { readonly id: string | null; readonly text: string; readonly brief?: string } {
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
  // not in the table) is not what put one ahead: the general sentence. A team in the bin
  // kept for its results is in the table, marked, and named here like any other row.
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
      brief: level,
    };
  }
  // Three or more who have all played, with the engine's own steps: exactly what placed each.
  if (group.steps !== null && members.length >= 3 && members.length === group.teamIds.length) {
    return {
      id: null,
      text: [level, ...stepSentences(group.steps, members)].join(join),
      brief: level,
    };
  }
  // Otherwise (rows saved before step 2.198, a team in the bin or one that has not played,
  // two whose stored reasons disagree): never which tiebreaker placed whom.
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
  return { id: null, text: sentences.join(join), brief: level };
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
    winPercentage: winPercentText(line.winPercentage),
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
  // The first sentence of each level-teams note that has more, by the note's id.
  const briefs = new Map<string, string>();
  const mark = (lines: readonly StandingsLine[], note: Note) => {
    if (lines.length === 0) return;
    if (!footnotes.some((f) => f.id === note.id)) {
      footnotes.push({ id: note.id, text: note.text });
      if (note.brief !== undefined) briefs.set(note.id, note.brief);
    }
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
      mark(played, {
        id: note.id ?? `level-${n + 1}`,
        text: note.text,
        ...(note.brief === undefined ? {} : { brief: note.brief }),
      });
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
    // A team in the bin kept for its results (A-17): its row stays, with a quiet note. It is
    // shown, so it is counted and named in its level group's note like any other row.
    if (line.team.removed && !footnotes.some((f) => f.id === removedNote)) {
      footnotes.push({ id: removedNote, text: t('standings.removedTeam') });
    }
    return {
      id: line.team.id,
      seed: line.seed,
      team: line.team.name,
      color: line.team.color,
      cells: cellsOf(line),
      notes: [
        ...line.footnotes.map((n) => `adjustment-${n}`),
        ...(line.team.removed ? [removedNote] : []),
        ...(level ? [level] : []),
      ],
    };
  });
  return {
    key: table.division?.id ?? `table-${index}`,
    caption: table.division?.name ?? t('standings.allTeams'),
    columns: columnsOf(table, standings.rankBy),
    rows,
    footnotes,
    briefFootnotes: footnotes.map((f) => ({ id: f.id, text: briefs.get(f.id) ?? f.text })),
  };
}

export function buildStandingsViews(standings: Standings): StandingsTableView[] {
  return standings.tables.map((table, index) => tableView(table, index, standings));
}
