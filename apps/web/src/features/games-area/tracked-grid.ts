// The "edit box score" grid of a live-tracked game (step 2.65, T6 §8, T-122, T-405): its
// boxes' names, reading what was typed into the lines the grid wants, and the plays a save
// made, as plain sentences and as the short marks the one-time notice carries. Pure.
//
// The baskets may only go up (T-405): the engine cannot take back a basket other than its
// last play, so a lowered basket is refused here, beside its box, before anything is sent,
// and the screen says to use Undo on the scoring screen. The command refuses it too.
import type { GridPlay, TrackedBoxScore, TrackedGridRow, WantedLine } from '@srleagues/core';
import type { TypedFields } from './form-state.ts';

/** The counts the grid can change, in its column order; turnovers only when kept. */
export type TrackedGridCount = 'fg1' | 'fg2' | 'fg3' | 'fouls' | 'turnovers';

const baskets: readonly TrackedGridCount[] = ['fg1', 'fg2', 'fg3'];

/** The grid's columns for a game whose box score keeps these statistics. */
export function trackedGridColumns(statKeys: readonly string[]): readonly TrackedGridCount[] {
  return [
    'fg1',
    'fg2',
    'fg3',
    'fouls',
    ...(statKeys.includes('turnovers') ? ['turnovers' as const] : []),
  ];
}

/** The name of a player's box for one count. */
export function trackedGridField(personId: string, stat: TrackedGridCount): string {
  return `grid-${personId}-${stat}`;
}

export type TrackedGridRead =
  | { readonly ok: true; readonly lines: readonly WantedLine[] }
  | {
      readonly ok: false;
      readonly code: 'invalid-input' | 'basket-taken-back';
      /** The boxes to mark, in screen order. */
      readonly wrong: readonly string[];
    };

const countShape = /^\d{1,3}$/;

/**
 * What was typed, as the lines the grid wants: only the counts that differ from the read,
 * only the players with one; a box the form did not hold is left as it is. A box that is not a whole number from 0 to 999 is refused by
 * name; then a basket typed lower than the plays give.
 */
export function readTrackedGrid(
  read: Pick<TrackedBoxScore, 'lines'>,
  columns: readonly TrackedGridCount[],
  fields: TypedFields,
): TrackedGridRead {
  const notCounts: string[] = [];
  const lowered: string[] = [];
  const lines: WantedLine[] = [];
  for (const row of read.lines) {
    const changed: Partial<Record<TrackedGridCount, number>> = {};
    for (const stat of columns) {
      const field = trackedGridField(row.personId, stat);
      // A box the form did not hold (a column drawn before the season kept it) stays.
      const raw = fields[field];
      if (raw === undefined) continue;
      const text = raw.trim();
      if (!countShape.test(text)) {
        notCounts.push(field);
        continue;
      }
      const value = Number(text);
      if (value === row[stat]) continue;
      if (baskets.includes(stat) && value < row[stat]) lowered.push(field);
      changed[stat] = value;
    }
    if (Object.keys(changed).length > 0) {
      lines.push({ teamId: row.teamId, personId: row.personId, ...changed });
    }
  }
  if (notCounts.length > 0) return { ok: false, code: 'invalid-input', wrong: notCounts };
  if (lowered.length > 0) return { ok: false, code: 'basket-taken-back', wrong: lowered };
  return { ok: true, lines };
}

/** The read's lines as the plays give them, in the shape the plays are worked out from. */
export function replayedOf(rows: readonly TrackedGridRow[]) {
  return rows.map((row) => ({
    teamId: row.teamId,
    personId: row.personId,
    stats: {
      fg1: row.fg1,
      fg2: row.fg2,
      fg3: row.fg3,
      fouls: row.fouls,
      turnovers: row.turnovers,
    },
  }));
}

/** A play the grid made, as the notice carries it: "foul:{person}", "score2:{person}". */
export function playMark(play: GridPlay): string {
  return `${play.type === 'score' ? `score${play.points}` : play.type}:${play.playerId}`;
}

/** The message key of a play's sentence, by its mark's first part. */
const sentenceKeys = {
  foul: 'admin.boxScore.tracked.added.foul',
  turnover: 'admin.boxScore.tracked.added.turnover',
  score1: 'admin.boxScore.tracked.added.score1',
  score2: 'admin.boxScore.tracked.added.score2',
  score3: 'admin.boxScore.tracked.added.score3',
  unfoul: 'admin.boxScore.tracked.removed.foul',
  unturnover: 'admin.boxScore.tracked.removed.turnover',
} as const;

export type PlaySentenceKey = (typeof sentenceKeys)[keyof typeof sentenceKeys];

/** A notice's marks as sentence keys and the player each is about; an unknown mark is left out. */
export function playSentences(
  marks: readonly string[],
): readonly { readonly key: PlaySentenceKey; readonly personId: string }[] {
  return marks.flatMap((mark) => {
    const [kind = '', personId = ''] = mark.split(':');
    return Object.hasOwn(sentenceKeys, kind) && personId !== ''
      ? [{ key: sentenceKeys[kind as keyof typeof sentenceKeys], personId }]
      : [];
  });
}
