// What a part of Season settings is drawn with and answered with (step 2.47), shared by
// the server, which fills it with words from the message files (T-187), and the form in
// the browser, which only draws it. An answer travels in the response to the post itself,
// drawn from what was posted (T-271, record 067): never in the address.

import type { SavedNowWords } from '../list-forms/index.ts';

/** What a form held: text only, by field name. A tick that is not ticked is not there. */
export type TypedFields = Readonly<Record<string, string>>;

export type FieldOption = { readonly value: string; readonly label: string };

/** One field of a part's form, with its words. */
export type FormField =
  | {
      readonly kind: 'text';
      readonly name: string;
      readonly label: string;
      readonly help?: string;
      readonly maxLength: number;
    }
  | { readonly kind: 'date'; readonly name: string; readonly label: string; readonly help?: string }
  | {
      /** A number box: text with the phone's number keys; the server reads and checks it. */
      readonly kind: 'number';
      readonly name: string;
      readonly label: string;
      readonly help?: string;
      /** Minutes may be given in parts (7.5). */
      readonly parts?: boolean;
    }
  | {
      readonly kind: 'radios';
      readonly name: string;
      readonly label: string;
      readonly help?: string;
      readonly options: readonly FieldOption[];
    }
  | {
      readonly kind: 'select';
      readonly name: string;
      readonly label: string;
      readonly options: readonly FieldOption[];
    }
  | { readonly kind: 'tick'; readonly name: string; readonly label: string; readonly help?: string }
  | {
      /** Several ticks under one label, each a field of its own (`column-played`). */
      readonly kind: 'ticks';
      /** The group's name, which a refusal about the whole group marks. */
      readonly name: string;
      readonly label: string;
      readonly help?: string;
      readonly options: readonly { readonly name: string; readonly label: string }[];
    }
  /** A sentence among the fields: how something stands that is not a choice. */
  | { readonly kind: 'note'; readonly text: string };

/** Fields under one heading: a fieldset with its legend, or plain fields. */
export type FormGroup = { readonly legend?: string; readonly fields: readonly FormField[] };

export type PartFormTexts = {
  readonly save: string;
  readonly cancel: string;
  readonly ask: { readonly yes: string; readonly no: string };
  /** The presets offered above the game rules, if this part has them. */
  readonly presets?: {
    readonly title: string;
    readonly help: string;
    readonly now: string;
    readonly choices: readonly {
      readonly value: string;
      readonly label: string;
      readonly about: string;
    }[];
  };
};

/** A box that is wrong, and the sentence said beside it. */
export type WrongBox = { readonly field: string; readonly said: string };

export type PartState =
  | { readonly kind: 'untouched' }
  /** Refused: what was typed, the boxes that are wrong, and why, beside the buttons. */
  | {
      readonly kind: 'refused';
      readonly typed: TypedFields;
      readonly wrong: readonly WrongBox[];
      readonly said: string;
      /**
       * The season changed since the page was drawn (T-418, as T-399): the words that say,
       * beside each box whose saved value now differs from what was typed, what is saved
       * now. Left out for every other refusal.
       */
      readonly savedNow?: SavedNowWords;
    }
  /** The boxes again with these values: a preset chosen, or "No, change the rules". */
  | {
      readonly kind: 'enter';
      readonly typed: TypedFields;
      /** What was done to the boxes, said above Save: "Filled in from …". */
      readonly said?: string;
    }
  /** What saving would move in the standings, asked before anything is saved (S-1). */
  | {
      readonly kind: 'ask';
      readonly typed: TypedFields;
      readonly heading: string;
      readonly lines: readonly string[];
      readonly after: string;
    };

export const untouched: PartState = { kind: 'untouched' };

/** The hidden fields every post of a part carries, which `typed` never gives back. */
export const postFields = ['league', 'seasonId', 'part', 'version', 'step'] as const;

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

/** What was typed, without the post's own hidden fields. */
export function typedOnly(fields: TypedFields): TypedFields {
  return Object.fromEntries(
    Object.entries(fields).filter(([name]) => !(postFields as readonly string[]).includes(name)),
  );
}
