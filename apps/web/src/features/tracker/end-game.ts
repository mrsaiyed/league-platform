// Ending a game on the scoring screen (step 2.37; checklist J1 to J5, D12; S-36, S-40,
// S-65, S-72, S-73), worked out with no drawing: what the End game question says or why
// the game cannot be ended, what the final panel says about reopening, what the Mark not
// started question says, and each refusal in the tracker's words. play-log.ts holds where
// a game stands once End was tapped (`endState`, `finalScore`, `endOffered`); the words
// are in the message files; the server stays the judge of every one of these.
import type {
  NotStartedReason,
  NotStartedRefusal,
  ReopenNotOffered,
  ReopenOffer,
} from '@srleagues/contracts';
import type { Translate } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import { periodText, refusalText } from './engine-words.ts';
import type { ClockReading } from './game-clock.ts';
import { finalScore, recordedPlays } from './play-log.ts';
import type {
  DoorProblem,
  MarkNotStartedResult,
  ReopenResult,
  TakeBackEndResult,
} from './tracker-controller.ts';

type Names = { readonly home: string; readonly away: string };

/** "Hawks 52, Bears 48": home first, as on the scoreboard. */
export const scoreText = (game: basketball.GameState, names: Names, t: Translate): string => {
  const score = finalScore(game);
  return t('tracker.final.score', {
    home: names.home,
    homeScore: score.home,
    away: names.away,
    awayScore: score.away,
  });
};

/**
 * What End game does when it is tapped, in More or in the pad (J1 to J3):
 *
 * - `nothing`: the engine itself refuses (nothing is recorded yet): its sentence is said.
 * - `level`: the score is level and the rules the game is played under allow no ties
 *   (S-73): refused on the device at once, with or without a signal, in words that say
 *   to play overtime. Nothing is asked.
 * - `ask`: the question. It says the score and what ending does; at a level score in a
 *   season with ties, that the game ends as one; and, when the game is ended early, that
 *   time is still on the clock and in which period, or that a period is still to play.
 */
export type EndQuestion =
  | { readonly kind: 'nothing'; readonly text: string }
  | { readonly kind: 'level'; readonly score: string }
  | {
      readonly kind: 'ask';
      readonly score: string;
      readonly tie: boolean;
      /** "H2 still has 12:34 on the clock.", or null when the last period has run out. */
      readonly early: EarlyEnd | null;
    };

/**
 * What the question says of a game ended early, in three parts, so the screen can let
 * the clock in it tick with the game clock while the question stands (the clock is never
 * stopped by asking): the words before the time, the time, and the words after it.
 * `clock` is null where the sentence names no time (a period still to play).
 */
export type EarlyEnd = {
  readonly before: string;
  readonly clock: string | null;
  readonly after: string;
};

/** Stands where the time goes while the sentence is put into words; never shown. */
const clockPlace = '';

export function endQuestion(
  game: basketball.GameState,
  names: Names,
  allowTies: boolean,
  clock: Pick<ClockReading, 'over' | 'text'>,
  t: Translate,
): EndQuestion {
  // The engine's own answer, asked of the engine: its rule is never copied here.
  try {
    basketball.apply(game, { type: 'end' }, { id: 'end-question', now: 0 });
  } catch (thrown) {
    if (!(thrown instanceof basketball.TrackerError)) throw thrown;
    return { kind: 'nothing', text: refusalText(thrown.message, t) };
  }
  const score = scoreText(game, names, t);
  const tie = finalScore(game).ahead === null;
  if (tie && !allowTies) return { kind: 'level', score };
  const { periods } = game.rules;
  const { period } = basketball.derive(game);
  const now = periodText(period, periods, t);
  if (!clock.over) {
    const [before = '', after = ''] = t('tracker.end.ask.timeLeft', {
      period: now,
      clock: clockPlace,
    }).split(clockPlace);
    return { kind: 'ask', score, tie, early: { before, clock: clock.text, after } };
  }
  const early =
    period < periods
      ? {
          before: t('tracker.end.ask.notLast', {
            period: now,
            next: periodText(period + 1, periods, t),
          }),
          clock: null,
          after: '',
        }
      : null;
  return { kind: 'ask', score, tie, early };
}

/** A game ended early, as one sentence: what a test or a screen reader's line reads. */
export const earlyText = (early: EarlyEnd): string =>
  `${early.before}${early.clock ?? ''}${early.after}`;

/**
 * What the pad says when it offers End game by itself (S-65): the period that ran out
 * and who leads, the higher score first.
 */
export function endOfferText(game: basketball.GameState, names: Names, t: Translate): string {
  const score = finalScore(game);
  const ahead = score.ahead ?? 'home';
  return t('tracker.end.offer', {
    period: periodText(basketball.derive(game).period, game.rules.periods, t),
    team: names[ahead],
    high: Math.max(score.home, score.away),
    low: Math.min(score.home, score.away),
  });
}

/**
 * The result as the final panel says it, large: who won in words and the score, the
 * winner's first ("Hawks won, 52–48"), or that it was a tie. One line for most names,
 * under a scoreboard that still shows each team's score under its name.
 */
export function wonText(game: basketball.GameState, names: Names, t: Translate): string {
  const score = finalScore(game);
  const [high, low] = [Math.max(score.home, score.away), Math.min(score.home, score.away)];
  return score.ahead === null
    ? t('tracker.final.tied', { high, low })
    : t('tracker.final.won', { team: names[score.ahead], high, low });
}

/**
 * What the league said when it did not take an End tap this device made (an older page,
 * a rule changed mid-game): a level score in the league's own words about overtime,
 * anything else in the tracker's words for the engine's sentence.
 */
export function endRefusedText(
  game: basketball.GameState,
  message: string,
  t: Translate,
): { readonly level: boolean; readonly text: string } {
  const level = finalScore(game).ahead === null;
  return {
    level,
    text: level
      ? t('tracker.end.refusedLevel')
      : t('tracker.end.refused', { why: refusalText(message, t) }),
  };
}

/** What taking an End back said when it did not: the league has it, or the device failed. */
export const takeBackProblemText = (
  result: Extract<TakeBackEndResult, { ok: false }>,
  t: Translate,
): string =>
  t(result.reason === 'storage' ? 'tracker.end.takeBackFailed' : 'tracker.end.savedMeanwhile');

/**
 * What the final panel says about reopening (S-36; the review of the two doors, point
 * 4): shown with the time left, and after it that a league admin can, so nobody types a
 * reason and is then refused for time.
 */
export type ReopenLine =
  /** The league has not answered yet: the button is offered, and asks again when tapped. */
  | { readonly kind: 'checking' }
  /** The account may correct games: at any time. */
  | { readonly kind: 'always' }
  /** It ended the game: for this many more minutes, at least one. */
  | { readonly kind: 'left'; readonly minutes: number }
  | { readonly kind: 'no'; readonly code: ReopenNotOffered; readonly endedBy: string | null };

/** `now` is the SERVER's time (`status.now()`), as `until` is: never the device's clock. */
export function reopenLine(offer: ReopenOffer | null, now: number): ReopenLine {
  if (offer === null) return { kind: 'checking' };
  const endedBy = offer.endedBy?.displayName ?? null;
  const { reopen } = offer;
  if (reopen.when === 'always') return { kind: 'always' };
  if (reopen.when === 'no') return { kind: 'no', code: reopen.code, endedBy };
  const left = reopen.until - now;
  return left <= 0
    ? { kind: 'no', code: 'reopen-time-over', endedBy }
    : { kind: 'left', minutes: Math.max(1, Math.ceil(left / 60_000)) };
}

/** Whether "Reopen game" is on the panel: not once the league has said no. */
export const reopenOffered = (line: ReopenLine): boolean => line.kind !== 'no';

/** A refusal of the reopen door by its code, naming who ended the game when that is why. */
const reopenRefusedText = (
  code: Extract<ReopenResult, { reason: 'refused' }>['code'],
  endedBy: string | null,
  t: Translate,
): string =>
  code === 'not-ended-by-you' && endedBy !== null && endedBy !== ''
    ? t('tracker.reopen.refused.not-ended-by-youNamed', { name: endedBy })
    : t(`tracker.reopen.refused.${code}`);

export function reopenLineText(line: ReopenLine, t: Translate): string {
  switch (line.kind) {
    case 'checking':
      return t('tracker.final.checking');
    case 'always':
      return t('tracker.final.reopenAlways');
    case 'left':
      return t.plural('tracker.final.reopenLeft', line.minutes);
    case 'no':
      return reopenRefusedText(line.code, line.endedBy, t);
  }
}

const doorProblemText = (reason: DoorProblem, t: Translate): string =>
  t(`tracker.reopen.problem.${reason}`);

/** Why the game was not reopened, in a sentence. */
export const reopenProblemText = (
  result: Extract<ReopenResult, { ok: false }>,
  t: Translate,
): string =>
  result.reason === 'refused'
    ? reopenRefusedText(result.code, result.endedBy, t)
    : doorProblemText(result.reason, t);

/**
 * Whether a reopen that failed can simply be asked again from the question (no
 * connection, plays still going out, signed out), or the league has answered for good
 * and the panel says so in the question's place.
 */
export const reopenMayRetry = (result: Extract<ReopenResult, { ok: false }>): boolean =>
  result.reason === 'unanswered' ||
  result.reason === 'plays-waiting' ||
  result.reason === 'signed-out' ||
  (result.reason === 'refused' && result.code === 'reason-needed');

/**
 * What the Mark not started question says (S-40; the review of the two doors, point 6).
 * A play undone is nothing recorded, so with none standing anyone who scores the game
 * may clear it and is simply asked. With plays standing, a scorekeeper is told to undo
 * them first and is offered no "yes"; someone who may correct games is told how many
 * plays and what score will be cleared, and picks a reason from the fixed list.
 * `mayCorrect` is a hint for the wording only: the league decides.
 */
export type NotStartedQuestion =
  | { readonly kind: 'clear'; readonly text: string }
  | { readonly kind: 'undo-first'; readonly text: string }
  | { readonly kind: 'clears'; readonly text: string };

export function notStartedQuestion(
  game: basketball.GameState,
  names: Names,
  mayCorrect: boolean,
  t: Translate,
): NotStartedQuestion {
  const count = recordedPlays(game);
  if (count === 0) return { kind: 'clear', text: t('tracker.notStarted.questionDetail') };
  if (!mayCorrect) {
    return { kind: 'undo-first', text: t.plural('tracker.notStarted.askUndoFirst', count) };
  }
  const score = finalScore(game);
  return {
    kind: 'clears',
    text: t.plural('tracker.notStarted.askClears', count, {
      home: names.home,
      homeScore: score.home,
      away: names.away,
      awayScore: score.away,
    }),
  };
}

/** The reason chosen already when one is asked for: the commonest. */
export const notStartedReasonReady: NotStartedReason = 'startedByMistake';

/** Why the game was not marked not started, in a sentence. */
export const notStartedProblemText = (
  result: Extract<MarkNotStartedResult, { ok: false }>,
  t: Translate,
): string =>
  result.reason === 'refused'
    ? t(`tracker.notStarted.refused.${result.code satisfies NotStartedRefusal}`)
    : doorProblemText(result.reason, t);
