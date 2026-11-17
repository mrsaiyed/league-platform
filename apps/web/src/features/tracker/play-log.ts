// What the scoring screen says about the plays (step 2.37; checklist I1 to I5, J1 to J4),
// worked out from the engine's state with no drawing: the play log's rows, what Undo and
// Redo will act on and what the screen says once they have, and where a game stands once
// End game is tapped. Every word comes from the one table of plays (engine-words.ts) and
// the message files; the engine's own numbers are never copied (`basketball.derive`).
import type { Translate } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import {
  findPlayer,
  periodText,
  playShortText,
  playText,
  playerLabel,
  playerShortLabel,
} from './engine-words.ts';
import type { DeviceRosters } from './opened-game-storage.ts';
import type { KeptTap } from './queue-storage.ts';
import type { TrackerControllerStatus } from './tracker-controller.ts';

/** One line of the play log. */
export type PlayRow = {
  /** The play's id: the id of the tap that made it. */
  readonly id: string;
  /** "#4 Jordan Ellis +2", in the tracker's words. */
  readonly text: string;
  /** "Q2 7:41": the period and the game clock it was made at. */
  readonly when: string;
  /** After a basket, the score it made: "12–10", home first as on the scoreboard. */
  readonly score: string | null;
  /**
   * The league does not have this play yet: drawn dimmed, and it says so in words (a
   * color never carries a meaning alone; DESIGN.md section 7, line 3).
   */
  readonly unsent: boolean;
};

export type PlayLog = {
  /** The plays that stand, newest first (checklist I4): all of them, or the newest asked for. */
  readonly rows: readonly PlayRow[];
  /** How many plays stand in all, whatever `rows` holds. */
  readonly count: number;
  /** How many of them all the league does not have yet. */
  readonly unsent: number;
};

/** The ids of the taps the league does not have yet. */
const unsentIds = (waiting: readonly KeptTap[]): ReadonlySet<string> =>
  new Set(waiting.map((tap) => tap.command.commandId.toLowerCase()));

/**
 * The play log. A play is "not sent yet" while its own tap is waiting. A play brought
 * back by Redo keeps the id of the tap that first made it, so it reads as sent once that
 * one was, while the Redo itself may still be waiting: the banner counts that tap.
 *
 * `newest` asks for only that many rows, the newest: what the screen shows while the
 * whole log is not open, so a tap in a game of five hundred plays does not wait for five
 * hundred lines to be worded (finding M6). The count, the unsent and each row's running
 * score are of the whole game either way.
 */
export function playLog(
  game: basketball.GameState,
  rosters: DeviceRosters,
  waiting: readonly KeptTap[],
  t: Translate,
  newest: number = Number.POSITIVE_INFINITY,
): PlayLog {
  const waitingIds = unsentIds(waiting);
  const from = Math.max(0, game.plays.length - newest);
  const score = { home: 0, away: 0 };
  const rows: PlayRow[] = [];
  let unsent = 0;
  game.plays.forEach((play, place) => {
    if (play.type === 'score') score[play.side] += play.points;
    const notSent = waitingIds.has(play.id.toLowerCase());
    if (notSent) unsent += 1;
    if (place < from) return;
    rows.push({
      id: play.id,
      text: playText(play, rosters, game.rules.periods, t),
      when: t('tracker.log.row', {
        period: periodText(play.period, game.rules.periods, t),
        clock: basketball.formatClock(play.clockMs),
      }),
      score:
        play.type === 'score'
          ? t('tracker.log.score', { home: score.home, away: score.away })
          : null,
      unsent: notSent,
    });
  });
  rows.reverse();
  return { rows, count: game.plays.length, unsent };
}

/** What Undo or Redo will act on, as its button says it. */
export type NamedPlay = {
  /** The tracker's words: "#4 Jordan Ellis +2". */
  readonly text: string;
  /** Said shortest, for a button with room for a few words: "+2 #4 Jordan". */
  readonly short: string;
};

const named = (
  play: basketball.LoggedPlay | undefined,
  game: basketball.GameState,
  rosters: DeviceRosters,
  t: Translate,
): NamedPlay | null =>
  play === undefined
    ? null
    : {
        text: playText(play, rosters, game.rules.periods, t),
        short: playShortText(play, rosters, game.rules.periods, t),
      };

/** The play Undo takes back: the latest one. Null when there is none, or the game is final. */
export const undoTarget = (
  game: basketball.GameState,
  rosters: DeviceRosters,
  t: Translate,
): NamedPlay | null =>
  game.status === 'final' ? null : named(game.plays.at(-1), game, rosters, t);

/** The play Redo brings back. Null when there is none, or the game is final. */
export const redoTarget = (
  game: basketball.GameState,
  rosters: DeviceRosters,
  t: Translate,
): NamedPlay | null => (game.status === 'final' ? null : named(game.redo.at(-1), game, rosters, t));

/**
 * What the screen says: a sentence, or one with a short form of one line that a phone
 * short of room shows in its place (court-view.tsx, step 2.189). The full text is always
 * what a screen reader is given.
 */
export type Said = string | { readonly text: string; readonly short: string };

/**
 * What the screen says once Undo has taken a play back (checklist I2): the play in the
 * tracker's words, and what the scorekeeper would not see by itself. A period change
 * undone puts the clock back; a foul or a timeout that had stopped the clock leaves it
 * stopped (Undo never touches the clock); a substitution is said by who is where now.
 * `before` is the game as it was, `after` as the engine left it.
 */
export function undoneText(
  before: basketball.GameState,
  after: basketball.GameState,
  rosters: DeviceRosters,
  t: Translate,
): Said {
  const play = before.plays.at(-1);
  if (play === undefined) return t('tracker.refusal.nothingToUndo');
  const text = playText(play, rosters, before.rules.periods, t);
  if (play.type === 'period') {
    return t('tracker.undo.doneClock', {
      play: text,
      clock: basketball.formatClock(after.clock.remainingMs),
    });
  }
  // The two long ones have a short form for a phone short of room: the players by number
  // and first name, the play in the words Undo's own button used.
  if (play.type === 'sub') {
    const player = (id: string) => playerLabel(findPlayer(rosters, id), t);
    const short = (id: string) => playerShortLabel(findPlayer(rosters, id), t);
    return {
      text: t('tracker.undo.doneSub', { in: player(play.inId), out: player(play.outId) }),
      short: t('tracker.undo.doneSubShort', { in: short(play.inId), out: short(play.outId) }),
    };
  }
  if (play.stoppedClock === true && !after.clock.running) {
    return {
      text: t('tracker.undo.doneStopped', { play: text }),
      short: t('tracker.undo.doneStoppedShort', {
        play: playShortText(play, rosters, before.rules.periods, t),
      }),
    };
  }
  return t('tracker.undo.done', { play: text });
}

/** What the screen says once Redo has brought a play back. */
export function redoneText(before: basketball.GameState, rosters: DeviceRosters, t: Translate) {
  const play = before.redo.at(-1);
  return play === undefined
    ? t('tracker.refusal.nothingToRedo')
    : t('tracker.redo.done', { play: playText(play, rosters, before.rules.periods, t) });
}

/** Whether a kept tap is the End game tap. */
const isEnd = (tap: Pick<KeptTap, 'command'>): boolean =>
  'input' in tap.command && tap.command.input.type === 'end';

/**
 * Where a game stands once End game was tapped (checklist J4; the review of the two
 * doors, point 2): `live` until then; `not-sent` while this device's End tap has not
 * reached the league, when it can still be taken back on the device alone; `saved` once
 * the league has it, when Reopen is the way back.
 */
export type EndState = 'live' | 'not-sent' | 'saved';

export function endState(status: Pick<TrackerControllerStatus, 'game' | 'waiting'>): EndState {
  if (status.game?.status !== 'final') return 'live';
  return status.waiting.some(isEnd) ? 'not-sent' : 'saved';
}

/**
 * The End game tap the league refused, if one is listed (a level score in a season with
 * no ties): the screen says so in words and drops it from the list by its id.
 */
export function refusedEnd(
  status: Pick<TrackerControllerStatus, 'notApplied'>,
): { readonly commandId: string; readonly message: string } | null {
  const refused = status.notApplied.find(isEnd);
  return refused === undefined
    ? null
    : { commandId: refused.command.commandId, message: refused.refusal.message };
}

/** The score, home first, and who is ahead: null when it is level. */
export function finalScore(game: basketball.GameState): {
  readonly home: number;
  readonly away: number;
  readonly ahead: basketball.Side | null;
} {
  const { home, away } = basketball.derive(game).teams;
  return {
    home: home.score,
    away: away.score,
    ahead: home.score === away.score ? null : home.score > away.score ? 'home' : 'away',
  };
}

/**
 * Whether the pad offers End game by itself (S-65: offered and marked, never done): the
 * clock of the last period, or of an overtime, has run out with a team ahead. At a
 * level score the pad offers the next period instead, as at any other 0:00.
 */
export function endOffered(game: basketball.GameState, clockOver: boolean): boolean {
  if (game.status !== 'live' || !clockOver) return false;
  if (basketball.derive(game).period < game.rules.periods) return false;
  return finalScore(game).ahead !== null;
}

/**
 * How many baskets, fouls and turnovers stand: what a scorekeeper undoes before the game
 * can be marked not started (S-40; the league's own line is drawn in core, and decides).
 */
export function recordedPlays(game: basketball.GameState): number {
  const derived = basketball.derive(game);
  let count = 0;
  for (const line of Object.values(derived.players)) {
    count += line.fg1 + line.fg2 + line.fg3 + line.fouls + line.turnovers;
  }
  return count + derived.teams.home.teamTurnovers + derived.teams.away.teamTurnovers;
}
