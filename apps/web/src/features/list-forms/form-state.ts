// What a form of the divisions and venues screens (step 2.49) is answered with in the
// response to the post itself (T-271, record 067): a refusal, with what was typed and which
// fields are wrong, or nothing. A save that works is answered by drawing the screen again
// with a one-time notice (server/saved-notice.ts), never with one of these. As the games
// area's form-state.ts, which a client component of another feature cannot import.

/** What a form held: text only, by field name. */
export type TypedFields = Readonly<Record<string, string>>;

export type FormState =
  | { readonly kind: 'untouched' }
  | {
      readonly kind: 'refused';
      /** The command's error code. */
      readonly code: string;
      readonly typed: TypedFields;
      /** The names of the fields to mark, in the order they are on the screen. */
      readonly wrong: readonly string[];
      /** Why, as a sentence from the message files. */
      readonly said: string;
      /**
       * Someone else changed the thing since the page was drawn (T-399): the words that
       * say, beside each box whose saved value now differs from what was typed, what is
       * saved now. Left out for every other refusal.
       */
      readonly savedNow?: SavedNowWords;
    };

/** "Saved now:", and what it says when nothing is saved in that box. */
export type SavedNowWords = {
  readonly label: string;
  readonly nothing: string;
  /** Beside a tick: what is saved now when it is ticked, and when it is not (step 2.155). */
  readonly ticked?: string;
  readonly unticked?: string;
};

export const untouched: FormState = { kind: 'untouched' };

/** The fields a form posted, text only, the framework's own `$ACTION…` fields left out. */
export function typedOf(form: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string' && !name.startsWith('$ACTION') && !Object.hasOwn(fields, name)) {
      fields[name] = value;
    }
  }
  return fields;
}

/**
 * The round button drawn chosen after a refusal: what was typed when it is one of the
 * choices, else (a hand-made post with a choice that does not exist) the stored one, so a
 * choice is always shown chosen while the refusal beside the group says why.
 */
export function chosenOf(
  options: readonly { readonly value: string }[],
  typed: string | undefined,
  stored: string,
): string {
  return typed !== undefined && options.some((option) => option.value === typed) ? typed : stored;
}
