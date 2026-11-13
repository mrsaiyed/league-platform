// The limits on a team's fields, the same as the teams table (0008).
import { z } from 'zod';

export const teamName = z.string().trim().min(1).max(120);

/**
 * The short name a team's address is built from (T-34): lower-case letters and digits
 * in groups joined by single hyphens, at most 60 characters. Capitals are lowered.
 */
export const teamSlug = z
  .string()
  .trim()
  .toLowerCase()
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** Lower-case #rrggbb is what is stored; capitals are accepted and lowered. */
export const teamColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((color) => color.toLowerCase());

/**
 * Who sees a team's players' numbers (S-22) that an admin can set today: everyone, or
 * the team's staff and the league's admins. The two levels between (the league's signed-in
 * members, the team's own players and parents) arrive with accounts in stage 4.
 */
export const statsVisibilityChoices = ['everyone', 'staff'] as const;
export const teamStatsVisibility = z.enum(statsVisibilityChoices);
export type TeamStatsVisibility = z.infer<typeof teamStatsVisibility>;
