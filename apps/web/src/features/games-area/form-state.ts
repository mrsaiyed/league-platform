// What the games area's forms are answered with in the response to the post itself
// (T-271, record 067): a refusal, with what was typed and which fields are wrong, or the
// question before a final score is saved. Drawn from the posted values; nothing typed is
// kept anywhere else, and none of it rides in the address. A save that works is answered
// by sending the browser to the screen again, with a one-time notice
// (server/saved-notice.ts), never with one of these.

/** What a form held: text only, by field name. */
export type TypedFields = Readonly<Record<string, string>>;

/** Refused: why (a command's error code), what was typed, and the fields that are wrong. */
export type Refused = {
  readonly kind: 'refused';
  readonly code: string;
  readonly typed: TypedFields;
  /** The names of the fields to mark, in the order they are on the screen. */
  readonly wrong: readonly string[];
  /** Why, as a sentence from the message files: said where no field's own sentence fits. */
  readonly said: string;
};

/** Nothing said yet. */
export type Untouched = { readonly kind: 'untouched' };

/** A final score's boxes on the games list (step 2.154: two steps before it is saved). */
export type FinalScoreState =
  | Untouched
  | Refused
  /** "No, change the score": the boxes open again with what was typed. */
  | { readonly kind: 'enter'; readonly typed: TypedFields }
  /** The question: the score typed, and the game's version as the boxes read it. */
  | {
      readonly kind: 'ask';
      readonly homeScore: string;
      readonly awayScore: string;
      readonly version: string;
    };

/** The box score grid: refused with the score the sheet came to, when it came to one. */
export type BoxScoreState =
  | Untouched
  | (Refused & { readonly scores?: { readonly home: number; readonly away: number } });

/** Any other form of the games area: refused, or nothing said yet. */
export type FormState = Untouched | Refused;

export const untouched: Untouched = { kind: 'untouched' };

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

/** The fields a form posted, text only, the framework's own `$ACTION…` fields left out. */
export function typedOf(form: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string' && !name.startsWith('$ACTION')) fields[name] = value;
  }
  return fields;
}
