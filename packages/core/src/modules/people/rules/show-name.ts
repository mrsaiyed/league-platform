// The one function every public page and live message gets a person's name from
// (T-81). It applies the league's display policy (R-14, R-15), the person's own
// request (R-15, R-17) and, where the name stands beside a team's numbers, who may see
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
 * this viewer, the person asked to be taken off public pages, or no name was recorded.
 * The page words a missing name from its message file (T-187).
 */
export type ShownName =
  | { readonly shown: true; readonly text: string }
  | { readonly shown: false; readonly why: 'restricted' | 'removed' | 'no_name' };

function tidy(part: string): string {
  return part.trim().replace(/\s+/g, ' ');
}

function initial(part: string): string {
  const first = Array.from(part)[0] ?? '';
  return `${first.toUpperCase()}.`;
}

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

  if (person.nameRequest === 'initials' && where.policy.playersMayAskForInitials) {
    return { shown: true, text: [first, last].filter(Boolean).map(initial).join(' ') };
  }
  if (shownAsChild(person.isMinor, where.audience) && where.policy.children !== 'full_name') {
    const text = first === '' ? initial(last) : last === '' ? first : `${first} ${initial(last)}`;
    return { shown: true, text };
  }
  return { shown: true, text: [first, last].filter(Boolean).join(' ') };
}
