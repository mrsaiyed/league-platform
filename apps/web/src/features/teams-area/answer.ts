// What a Teams screen's change answers with, and how that answer travels in the
// address (step 2.51). A form is answered by sending the browser back to the page with
// one of two fixed words in the address: `done` (what went well) or `problem` (the
// command's name and the code it refused with). The page turns the word into text from
// the message files; it never shows anything the person typed (T-187).
import { catalogs } from '@srleagues/site';
import type { TextKey } from '../../server/messages.ts';

/** What went well; each one said in the address has a message `adminTeams.done.<name>`. */
export const doneNames = [
  'updated',
  'statsSaved',
  'removed',
  'added',
  'entrySaved',
  'moved',
  'left',
  'putBack',
  'putBackNoNumber',
  'personRemoved',
  'teamLeft',
  'teamBack',
] as const;
export type DoneName = (typeof doneNames)[number];

/**
 * What a form that answers in the response to the post saved (step 2.155): said on the
 * page from the one-time notice, never in the address, so it has no `adminTeams.done.…`.
 */
const saidOnThePageOnly: readonly DoneName[] = ['statsSaved', 'entrySaved'];

/** The words an address's `done=` may carry. */
export const addressDoneNames = doneNames.filter((name) => !saidOnThePageOnly.includes(name));

/**
 * The roster line a change was about, so the page says what went well on that line,
 * naming the player (step 2.161); and the number a player put back lost (R-32).
 */
export type DoneAt = { readonly entry: string; readonly number?: string };

/**
 * A refused leaving date, said beside the roster line it was typed in, with what was
 * typed (step 2.161): the roster entry and the date. The date only ever goes back into
 * its own field, never shown as text (T-187).
 */
export type LeavingAt = { readonly entry: string; readonly leftOn: string };

export type Answer =
  | { readonly kind: 'done'; readonly done: DoneName; readonly at?: DoneAt }
  | {
      readonly kind: 'refused';
      readonly command: string;
      readonly code: string;
      readonly at?: LeavingAt;
    };

/** A refusal from a command, as the screen carries it: `teams.mark_left`, `already-left`. */
export function refused(command: string, code: string, at?: LeavingAt): Answer {
  return at === undefined
    ? { kind: 'refused', command, code }
    : { kind: 'refused', command, code, at };
}

export function done(name: DoneName, at?: DoneAt): Answer {
  return at === undefined ? { kind: 'done', done: name } : { kind: 'done', done: name, at };
}

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateShape = /^\d{4}-\d{2}-\d{2}$/;
/** A jersey number as the roster takes it (core's roster-fields.ts): 0 to 99, or 00. */
const numberShape = /^(0|00|[1-9][0-9]?)$/;

/** Where "Add a player" leads: the first form that adds one. */
export const addPlayerAnchor = 'add-player';
/** "Someone already in the league": where a search for a person leads back to (step 2.90). */
export const fromListAnchor = 'from-league-list';

/** The place on a team's page of its details form, where its "Saved" is said. */
export const teamDetailsAnchor = 'team-details';
/** Where "Who sees this team's numbers" is, so a save of it lands there (step 2.155). */
export const teamStatsAnchor = 'team-stats';

/** The anchor of a roster line, where a refusal of its leaving date is said. */
export const entryAnchor = (entryId: string): string => `entry-${entryId}`;

/** The command whose refusals the "Remove this team" panel says beside its button (A-17). */
export const removeTeamCommand = 'teams.remove_team';

/** The anchor of that panel, where the browser lands after a refusal of it. */
export const removeTeamAnchor = 'remove-team';

/** The code of a refusal of "Remove this team" in the address, or undefined if there is none. */
export function removeRefusalOf(query: Query): string | undefined {
  const word = only(query['problem']);
  const start = `${removeTeamCommand}.`;
  return word !== undefined && word.startsWith(start) ? word.slice(start.length) : undefined;
}

/**
 * The part of the address that carries an answer: `?done=updated` or `?problem=...`; a
 * refused leaving date adds its line and what was typed, and the line's anchor.
 */
export function answerQuery(answer: Answer): string {
  if (answer.kind === 'done') {
    const at = answer.at;
    if (at === undefined || !uuidShape.test(at.entry)) return `?done=${answer.done}`;
    const entry = at.entry.toLowerCase();
    const number =
      at.number !== undefined && numberShape.test(at.number) ? `&number=${at.number}` : '';
    return `?done=${answer.done}&entry=${entry}${number}#${entryAnchor(entry)}`;
  }
  const problem = `?problem=${encodeURIComponent(`${answer.command}.${answer.code}`)}`;
  // Said in the panel the button is in, where the phone is looking.
  if (answer.command === removeTeamCommand) return `${problem}#${removeTeamAnchor}`;
  const at = answer.at;
  if (at === undefined || !uuidShape.test(at.entry)) return problem;
  const leftOn = dateShape.test(at.leftOn) ? at.leftOn : '';
  return `${problem}&entry=${at.entry.toLowerCase()}&leftOn=${leftOn}#${entryAnchor(at.entry.toLowerCase())}`;
}

type Query = Readonly<Record<string, string | string[] | undefined>>;

const only = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** The roster line a refusal is said beside, with the date typed there, if the address names one. */
export function leavingAtOf(query: Query): LeavingAt | undefined {
  const entry = only(query['entry']);
  if (only(query['problem']) === undefined || entry === undefined || !uuidShape.test(entry)) {
    return undefined;
  }
  const leftOn = only(query['leftOn']) ?? '';
  return { entry: entry.toLowerCase(), leftOn: dateShape.test(leftOn) ? leftOn : '' };
}

/** What went well on one roster line, from the address, if it names one we know. */
export function doneAtOf(
  query: Query,
): { readonly done: DoneName; readonly at: DoneAt } | undefined {
  const word = only(query['done']);
  const found = doneNames.find((name) => name === word);
  const entry = only(query['entry']);
  if (found === undefined || entry === undefined || !uuidShape.test(entry)) return undefined;
  const number = only(query['number']);
  return {
    done: found,
    at: {
      entry: entry.toLowerCase(),
      ...(number !== undefined && numberShape.test(number) ? { number } : {}),
    },
  };
}

/** The text of what went well, from the address; undefined when nothing did or the word is not ours. */
export function doneKey(query: Query): TextKey | undefined {
  const word = only(query['done']);
  const found = addressDoneNames.find((name) => name === word);
  return found === undefined ? undefined : (`adminTeams.done.${found}` as TextKey);
}

/**
 * The text of a refusal, from the address: the command's own message when the message
 * file has one, else the message for the code alone, else "that could not be done".
 */
export function problemKey(query: Query): TextKey | undefined {
  const word = only(query['problem']);
  if (word === undefined || word === '' || word.length > 120) return undefined;
  const english = catalogs['en'] ?? {};
  const code = word.slice(word.lastIndexOf('.') + 1);
  for (const key of [`error.${word}`, `error.${code}`]) {
    if (Object.hasOwn(english, key)) return key as TextKey;
  }
  return 'error.unknown';
}
