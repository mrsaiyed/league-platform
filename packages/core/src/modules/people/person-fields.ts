// The limits on a person's fields, the same as the table (0008).
import { z } from 'zod';

export const personName = z.string().trim().min(1).max(100);
export const personPublicName = z.string().trim().min(1).max(100);
export const personEmail = z
  .string()
  .trim()
  .max(320)
  .regex(/^[^@\s]+@[^@\s]+$/);

/** A real date, from 1900 and never after today (T3 §3). */
export const personBirthDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
    return value >= '1900-01-01' && value <= new Date().toISOString().slice(0, 10);
  });
