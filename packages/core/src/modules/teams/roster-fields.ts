// The limits on a roster entry's fields, the same as the roster_entries table (0008).
import { z } from 'zod';

/** 0 to 99, or 00 (a different jersey from 0), as the tracker takes them. */
export const jerseyNumber = z.string().regex(/^(0|00|[1-9][0-9]?)$/);

/** A label only: giving a coach a sign-in role is an invitation (step 1.12). */
export const rosterRoles = ['player', 'captain', 'coach'] as const;
export const rosterRole = z.enum(rosterRoles);

/** A calendar day as yyyy-mm-dd. */
export const rosterDate = z.iso.date();
