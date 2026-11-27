// The one function every public page and live message gets a person's name from
// (T-81). It applies the league's display policy to every player (R-24, R-29), keeps a
// child from full names until the admin confirmed them (R-14), the person's own
// request (R-15, R-17, R-25, R-27) and, where the name stands beside a team's numbers, who may see
// that team's player statistics (S-22, T-87).
import type { Audience } from '../../leagues/index.ts';
import { shownAsChild, type NamePolicy, type NameRequest } from './name-policy.ts';
import { statsShown, type TeamStatsSetting } from './stats-shown.ts';
import type { Viewer } from './viewer.ts';

/** What the function needs to know about a person. Nothing it is given leaves it raw. */
export interface PersonForDisplay {
  readonly firstName: string;
  readonly lastName: string;
  /** Null when the league does not know (it never asked for a date of birth). */
  readonly isMinor: boolean | null;
  readonly nameRequest: NameRequest;
  /**
   * Present, and true, only for a player added at a scorer's table with no age
   * (walkUpOfUnknownAgeOn, S-136): shown as a child whatever the league's confirmation
   * says, and by an initial alone where only one name was typed. An admin marking them
   * (adult, child or a date) ends it, so the caller no longer gives it.
   */
  readonly walkUp?: true;
}

export interface WhereShown {
  readonly audience: Audience;
  readonly policy: NamePolicy;
  readonly viewer: Viewer;
  /**
   * The team whose numbers the name stands beside: a box score line, a season total,
   * a stat leader or a play. Null only where no statistics are shown, as on a roster:
   * every caller says which.
   */
  readonly statsOf: TeamStatsSetting | null;
}

/**
 * The name to show, or why there is none: the team's player statistics are hidden from
 * this viewer, the person asked to be taken off public pages, the league shows its
 * players by jersey number only (R-24, `hidden`), or no name was recorded. The page words a
 * missing name from its message file (T-187).
 */
export type ShownName =
  | { readonly shown: true; readonly text: string }
  | { readonly shown: false; readonly why: 'restricted' | 'removed' | 'hidden' | 'no_name' };

function tidy(part: string): string {
  return part.trim().replace(/\s+/g, ' ');
}

function initial(part: string): string {
  const first = Array.from(part)[0] ?? '';
  return `${first.toUpperCase()}.`;
}

/** The forms a name can take, from the most shown to the least. */
const forms = ['full', 'first_last_initial', 'initials', 'hidden'] as const;
type Form = (typeof forms)[number];

/** The league's choice; a value it does not know shows the least. */
function formOf(names: string): Form {
  if (names === 'full_name') return 'full';
  if (names === 'first_name_last_initial') return 'first_last_initial';
  return 'hidden';
}

const lesser = (a: Form, b: Form): Form => (forms.indexOf(a) >= forms.indexOf(b) ? a : b);

export function showName(person: PersonForDisplay, where: WhereShown): ShownName {
  if (where.statsOf !== null && statsShown(where.statsOf, where.viewer) !== 'player_lines') {
    return { shown: false, why: 'restricted' };
  }
  // Anything but a known request counts as a request to be taken off (R-17).
  if (person.nameRequest !== 'none' && person.nameRequest !== 'initials') {
    return { shown: false, why: 'removed' };
  }

  const first = tidy(person.firstName);
  const last = tidy(person.lastName);
  if (first === '' && last === '') return { shown: false, why: 'no_name' };

  // R-27: a request once recorded keeps taking effect, whatever the league's initials
  // switch or the person's age now say; only whether a new one may be recorded depends
  // on them (mayRecordNameRequest, asked by the command).
  const asked = person.nameRequest === 'initials';
  // R-24, R-29: the league's choice, followed for every player.
  let form = formOf(where.policy.names);
  // R-14: a child in full only once the admin has confirmed it; anything but a plain
  // true counts as not confirmed. S-136: the parents' confirmation never covers a
  // walk-up of unknown age (nobody knows whose parents agreed), so they are shown as a
  // child whatever it says, until an admin marks them.
  const walkUp = person.walkUp === true;
  if (
    walkUp ||
    (shownAsChild(person.isMinor, where.audience) && where.policy.childrenInFull !== true)
  ) {
    form = lesser(form, 'first_last_initial');
  }
  // R-15, R-25: a recorded request for initials takes effect, but never shows more
  // than the league's choice already does.
  if (asked) form = lesser(form, 'initials');
  switch (form) {
    case 'full':
      return { shown: true, text: [first, last].filter(Boolean).join(' ') };
    case 'first_last_initial': {
      // S-136: a walk-up typed as one word ("Walkington") may be a surname alone, so it is
      // shown by its initial only; a name typed in two parts keeps its first name.
      const text =
        first === ''
          ? initial(last)
          : last === ''
            ? walkUp
              ? initial(first)
              : first
            : `${first} ${initial(last)}`;
      return { shown: true, text };
    }
    case 'initials':
      return { shown: true, text: [first, last].filter(Boolean).map(initial).join(' ') };
    case 'hidden':
      return { shown: false, why: 'hidden' };
  }
}

/**
 * The jersey number a line shows in place of the name `showName` withheld, as "#12" with
 * the team (R-24, S-34): only for a name the league hides or one never recorded. A person
 * who asked to be taken off (R-17) stays a nameless line, and a team whose numbers this
 * viewer may not see shows nothing at all. Null when there is no number to show.
 */
export function numberInPlace(
  shown: ShownName,
  jerseyNumber: string | null | undefined,
): string | null {
  if (shown.shown || (shown.why !== 'hidden' && shown.why !== 'no_name')) return null;
  const number = (jerseyNumber ?? '').trim();
  return number === '' ? null : number;
}
