// The one function every public page and live message gets a person's name from
// (T-81). It applies the league's display policy (R-14, R-15, R-24), the person's own
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
 * this viewer, the person asked to be taken off public pages, the league shows children
 * by jersey number only (R-24, `hidden`), or no name was recorded. The page words a
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

/** The league's choice for children; a value it does not know shows the least. */
function formOf(children: string): Form {
  if (children === 'full_name') return 'full';
  if (children === 'first_name_last_initial') return 'first_last_initial';
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
  let form: Form;
  if (shownAsChild(person.isMinor, where.audience)) {
    // R-24: the league's choice; R-25: a request for initials always takes effect for a
    // child, but never shows more than the league's choice already does.
    const league = formOf(where.policy.children);
    form = asked ? lesser(league, 'initials') : league;
  } else {
    // R-15: an adult by full name, or as the initials they asked for.
    form = asked ? 'initials' : 'full';
  }
  switch (form) {
    case 'full':
      return { shown: true, text: [first, last].filter(Boolean).join(' ') };
    case 'first_last_initial': {
      const text = first === '' ? initial(last) : last === '' ? first : `${first} ${initial(last)}`;
      return { shown: true, text };
    }
    case 'initials':
      return { shown: true, text: [first, last].filter(Boolean).map(initial).join(' ') };
    case 'hidden':
      return { shown: false, why: 'hidden' };
  }
}
