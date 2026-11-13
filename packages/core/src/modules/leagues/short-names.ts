// The rules for a league's short name, the {league} in its address (U-7). The same
// format the leagues table enforces (0003); the blocked list is checked here only.
import { z } from 'zod';
import { blockedShortNames } from './blocked-short-names.ts';

/** 3 to 40 lowercase letters, numbers and hyphens. */
export const shortNameSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{3,40}$/);

export function isBlockedShortName(slug: string): boolean {
  return blockedShortNames.has(slug.toLowerCase());
}
