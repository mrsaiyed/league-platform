// How a league shows its people's names on public pages (R-14, R-15, R-17, R-24, R-25,
// R-29). Product rules live here as data; `show-name.ts` applies them.
import type { Audience } from '../../leagues/index.ts';

/**
 * R-24, R-29: how the league shows its players, every one of them, from the most shown
 * to the least: full names, first name and last initial, or hidden (by jersey number
 * only). The admin chooses; an adult league starts on full names and a youth or mixed
 * league on first name and last initial (record 065).
 */
export const nameForms = ['full_name', 'first_name_last_initial', 'hidden'] as const;
export type NameForm = (typeof nameForms)[number];

/**
 * What a person has asked for themselves: nothing, to appear as initials (R-15 for an
 * adult, only where the league allows it; always for a child, R-25), or to be taken off
 * the league's public pages (R-17: their numbers stay, as a nameless entry).
 */
export const nameRequests = ['none', 'initials', 'removed'] as const;
export type NameRequest = (typeof nameRequests)[number];

/** The league's display policy (R-24, R-29): one choice, followed for every player. */
export interface NamePolicy {
  /** How every player is shown: the admin's choice, or the league's start. */
  readonly names: NameForm;
  /**
   * R-14: whether a child may be shown by full name. True only where the admin chose
   * full names and confirmed the league has the permission it needs; otherwise a child
   * is shown by first name and last initial at most, whatever `names` says. An adult
   * league's starting full names were never confirmed, so this is false there.
   */
  readonly childrenInFull: boolean;
  /** R-15: whether an adult may ask to appear as initials. A child always may (R-25). */
  readonly playersMayAskForInitials: boolean;
}

/**
 * The starting policy of a youth or mixed league, and of one whose audience is not
 * known: first name and last initial for everyone (R-14, R-29). An adult league starts
 * on full names instead (R-15; readNamePolicy). Asking for initials starts switched
 * off: the league decides whether to allow it (R-15).
 */
export const defaultNamePolicy: NamePolicy = Object.freeze({
  names: 'first_name_last_initial',
  childrenInFull: false,
  playersMayAskForInitials: false,
});

/**
 * The starting policy of an adult league (R-15, R-29, record 065): full names, never
 * confirmed for a child, so a child in it is shown by first name and last initial.
 * readNamePolicy gives the same from the declared setting (its test holds them equal).
 */
export const adultStartNamePolicy: NamePolicy = Object.freeze({
  names: 'full_name',
  childrenInFull: false,
  playersMayAskForInitials: false,
});

/**
 * Whether a person is shown under the children's rule (R-14: never in full without the
 * confirmation; R-25: their request for initials always taken). A league that never asks for a
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
