// The limits on a venue's and court's fields, the same as the tables (0007).
import { z } from 'zod';

export const venueName = z.string().trim().min(1).max(120);
export const venueAddress = z.string().trim().min(1).max(300);
/** A web address people open, never a script or a local file. */
export const venueMapLink = z
  .string()
  .max(2000)
  .regex(/^https:\/\/\S+$/);
export const courtSort = z.number().int().min(0).max(100000);
