// The limits on a division's fields, the same as the divisions table (0007).
import { z } from 'zod';

export const divisionName = z.string().trim().min(1).max(120);

/** Lower-case #rrggbb is what is stored; capitals are accepted and lowered. */
export const divisionColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((color) => color.toLowerCase());

export const divisionSort = z.number().int().min(0).max(100000);
