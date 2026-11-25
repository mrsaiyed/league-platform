// What the games area's forms are answered with in the response to the post itself
// (T-271, record 067): a refusal, with what was typed and which fields are wrong, or the
// question before a final score is saved. Drawn from the posted values; nothing typed is
// kept anywhere else, and none of it rides in the address. A save that works is answered
// by sending the browser to the screen again, with a one-time notice
// (server/saved-notice.ts), never with one of these.

import type { Refused, TypedFields, Untouched } from '../list-forms/form-state.ts';

// The pieces every admin form shares are list-forms' own (step 2.155 part 5): this file
// keeps only what the games area adds to them.
export {
  typedOf,
  untouched,
  type FormState,
  type Refused,
  type TypedFields,
  type Untouched,
} from '../list-forms/form-state.ts';

/** A final score's boxes on the games list (step 2.154: two steps before it is saved). */
export type FinalScoreState =
  | Untouched
  | Refused
  /** "No, change the score": the boxes open again with what was typed. */
  | { readonly kind: 'enter'; readonly typed: TypedFields }
  /** The question: the score typed, and the game's version as the boxes read it. */
  | {
      readonly kind: 'ask';
      /** The score as numbers, as the question names it and "Yes" sends it. */
      readonly homeScore: string;
      readonly awayScore: string;
      readonly version: string;
      /** The boxes exactly as typed, which "No, change the score" gives back. */
      readonly typed: TypedFields;
    };

/** The box score grid: refused with the score the sheet came to, when it came to one. */
export type BoxScoreState =
  | Untouched
  | (Refused & { readonly scores?: { readonly home: number; readonly away: number } });

/** What "Forfeit, postpone or cancel" does to a game (step 2.158): each asks first. */
/** `restore`: a postponed game put back on its old date (S-75). */
export const callOffActs = ['forfeit', 'postpone', 'cancel', 'restore'] as const;
export type CallOffAct = (typeof callOffActs)[number];

/**
 * "Forfeit, postpone or cancel" (step 2.158; A-5): nothing changes on the first tap. Its
 * forms only ask; the question's own "Yes" changes the game. Refused says which form
 * (`typed.act`), so the sentence is beside that form.
 */
export type CallOffState =
  | Untouched
  | Refused
  /**
   * The question: which change, what was chosen (the team that forfeits, the reason), and
   * when the server first drew it and how much longer its "Yes" takes no tap
   * (call-off-step.ts: a "Yes" sent too soon only asks again, keeping that first time).
   */
  | {
      readonly kind: 'ask';
      readonly act: CallOffAct;
      readonly typed: TypedFields;
      readonly askedAt: number;
      readonly readyInMs: number;
    };

/** The box score grid's scores, where its refusal and its "Saved" are said. */
export const sheetScoresId = 'box-score-scores';

/** A sentence written for both teams' scores, with the scores put in ({awayScore}, {homeScore}). */
export function fillScores(
  template: string,
  scores: { readonly home: string | number; readonly away: string | number },
): string {
  return template
    .replaceAll('{awayScore}', String(scores.away))
    .replaceAll('{homeScore}', String(scores.home));
}
