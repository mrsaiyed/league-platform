// How a league shows its people's names on public pages (R-14, R-15, R-17).
// Product rules live here as data; `show-name.ts` applies them.
import type { Audience } from '../../leagues/index.ts';

/** R-14: how children appear. The league's admin may switch to full names. */
export const childNameForms = ['first_name_last_initial', 'full_name'] as const;
export type ChildNameForm = (typeof childNameForms)[number];

/**
 * What a person has asked for themselves: nothing, to appear as initials (R-15, only
 * where the league allows it), or to be taken off the league's public pages (R-17:
 * their numbers stay, as a nameless entry).
 */
export const nameRequests = ['none', 'initials', 'removed'] as const;
export type NameRequest = (typeof nameRequests)[number];

/** The league's display policy. Adults are always shown by full name unless they ask (R-15). */
export interface NamePolicy {
  readonly children: ChildNameForm;
  /** R-15: the league decides whether a player may ask to appear as initials. */
  readonly playersMayAskForInitials: boolean;
}

/**
 * The starting policy of a new league. R-14's starting setting (first name and last
 * initial) applies in every league, so a child who turns up in an adult league is
 * still shown with care. Asking for initials starts switched off: the league decides
 * whether to allow it (R-15).
 */
export const defaultNamePolicy: NamePolicy = Object.freeze({
  children: 'first_name_last_initial',
  playersMayAskForInitials: false,
});

/**
 * Whether a person is shown under the children's rule. A league that never asks for a
 * date of birth may not know (`isMinor` is null): then a youth or mixed league treats
 * the person as a child and an adult league as an adult.
 */
export function shownAsChild(isMinor: boolean | null, audience: Audience): boolean {
  if (isMinor !== null) return isMinor;
  return audience !== 'adult';
}
