// The limits on a person's fields, the same as the table (0008).
import { z } from 'zod';

export const personName = z.string().trim().min(1).max(100);
export const personPublicName = z.string().trim().min(1).max(100);
export const personEmail = z
  .string()
  .trim()
  .max(320)
  .regex(/^[^@\s]+@[^@\s]+$/);

/**
 * A real date, from 1900 (T3 §3). "Never after today" is on the league's own today, which
 * a command reads from its store and a screen is handed (birthDateAfter, R-28: the same
 * today the age is measured on), never the server's day in UTC.
 */
export const personBirthDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
    return value >= '1900-01-01';
  });

/** Whether a birth date is after the league's today (yyyy-mm-dd): it is then refused. */
export const birthDateAfter = (birthDate: string, leagueToday: string): boolean =>
  birthDate > leagueToday;

/** The boxes of a person's form that have their own limits. */
export const personFieldNames = ['firstName', 'lastName', 'contactEmail', 'birthDate'] as const;
export type PersonFieldName = (typeof personFieldNames)[number];

/**
 * Which of these values the people commands would refuse, by the same limits, in the
 * order of the form: so a screen can mark the box that is wrong (record 067) without a
 * second copy of the rules. A value left out, or an empty email or birth date (which
 * clears it), is not wrong; a name is never empty.
 */
export function wrongPersonFields(
  values: Partial<Readonly<Record<PersonFieldName, string>>>,
  leagueToday: string,
): readonly PersonFieldName[] {
  const checks: Readonly<Record<PersonFieldName, z.ZodType>> = {
    firstName: personName,
    lastName: personName,
    contactEmail: personEmail,
    birthDate: personBirthDate,
  };
  return personFieldNames.filter((name) => {
    const value = values[name];
    if (value === undefined) return false;
    if ((name === 'contactEmail' || name === 'birthDate') && value.trim() === '') return false;
    if (name === 'birthDate' && birthDateAfter(value.trim(), leagueToday)) return true;
    return !checks[name].safeParse(value).success;
  });
}
