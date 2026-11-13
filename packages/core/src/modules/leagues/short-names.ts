// The rules for a league's short name, the {league} in its address (U-7). The same
// format the leagues table enforces (0003); the blocked list is checked here only.
import { z } from 'zod';
import { blockedShortNames, systemShortNames } from './blocked-short-names.ts';

/** 3 to 40 lowercase letters, numbers and hyphens. */
const shortNamePattern = /^[a-z0-9-]{3,40}$/;

/** What a person types as a short name: spaces around it are dropped first. */
export const shortNameSchema = z.string().trim().regex(shortNamePattern);

/** Whether `value`, exactly as it is, has the form of a short name (nothing trimmed). */
export function isShortNameFormat(value: string): boolean {
  return shortNamePattern.test(value);
}

/** Whether nobody may take `slug` as a short name: one of our words, or an offensive one. */
export function isBlockedShortName(slug: string): boolean {
  return blockedShortNames.has(slug.toLowerCase());
}

/**
 * Whether `word` is one of our own words (`account`, `signin`, `api`...), whatever its
 * capitals. This, not isBlockedShortName, is what says an address is one of our pages:
 * a word refused only for being offensive is not a page of ours.
 */
export function isSystemShortName(word: string): boolean {
  return systemShortNames.has(word.toLowerCase());
}
