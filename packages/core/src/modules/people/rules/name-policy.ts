// How a league shows its people's names on public pages (R-14, R-15, R-17, R-24, R-25).
// Product rules live here as data; `show-name.ts` applies them.
import type { Audience } from '../../leagues/index.ts';

/**
 * R-24: how children appear (and, in a youth or mixed league, people whose age is not
 * known), from the most shown to the least: full names, first name and last initial
 * (the start in every league), or hidden (by jersey number only). The admin chooses.
 */
export const childNameForms = ['full_name', 'first_name_last_initial', 'hidden'] as const;
export type ChildNameForm = (typeof childNameForms)[number];

/**
 * What a person has asked for themselves: nothing, to appear as initials (R-15 for an
 * adult, only where the league allows it; always for a child, R-25), or to be taken off
 * the league's public pages (R-17: their numbers stay, as a nameless entry).
 */
export const nameRequests = ['none', 'initials', 'removed'] as const;
export type NameRequest = (typeof nameRequests)[number];

/** The league's display policy. Adults are shown by full name unless they ask (R-15). */
export interface NamePolicy {
  readonly children: ChildNameForm;
  /** R-15: whether an adult may ask to appear as initials. A child always may (R-25). */
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
 * the person as a child and an adult league as an adult. Any value other than true or
 * false counts as not known.
 */
export function shownAsChild(isMinor: boolean | null, audience: Audience): boolean {
  if (isMinor === true) return true;
  if (isMinor === false) return false;
  return audience !== 'adult';
}

/**
 * R-25: whether a NEW request may be recorded. "Removed" and "as the league shows
 * everyone" always may (R-17). "Initials" always may for a child (shown under the
 * children's rule): a guardian asking for less of their child to be public is never
 * overruled by a league setting. For an adult only while the league lets players ask
 * for initials (R-15); otherwise the command refuses it, so none is saved to do nothing.
 *
 * R-27: this decides recording only. A request once recorded keeps taking effect
 * (`showName` honours it) until that person's own "Show as" is changed, whatever
 * happens later to the switch or to the person's age: a name never comes back onto a
 * public page as a side effect of another change.
 */
export function mayRecordNameRequest(
  request: NameRequest,
  person: { readonly isMinor: boolean | null },
  audience: Audience,
  policy: NamePolicy,
): boolean {
  if (request !== 'initials') return true;
  return shownAsChild(person.isMinor, audience) || policy.playersMayAskForInitials;
}

/** How much of a name shows, from the most to the least (R-26 compares two requests). */
const requestOrder: readonly NameRequest[] = ['none', 'initials', 'removed'];

/** Whether `to` shows less of a person than `from` (R-26: allowed in a read-only league). */
export function requestShowsLess(from: string, to: NameRequest): boolean {
  const before = requestOrder.indexOf(from as NameRequest);
  // A stored value we do not know counts as removed already (showName), so nothing is less.
  return before >= 0 && requestOrder.indexOf(to) > before;
}
