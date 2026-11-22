// What a person's record says about their age, for the People screens (step 2.50).
//
// Who counts as a child is core's one rule, isMinorOn (R-28 as changed on 2026-11-17: a
// child if their date of birth says so OR the "minor" tick is on; a date that says adult
// unticks no one), always on the league's own today. This file never works that out
// itself: it only asks the rule, once with the date alone, to tell the admin when the
// date and the choice on the form disagree and which one wins.
//
// What is this screen's own: how old a date makes someone, for the question before an
// unlikely date of birth is saved (a question, never a refusal; the lead, 2026-11-17).
import { isMinorOn } from '@srleagues/core';

/** Whole years from `birthDate` to `today`, both `YYYY-MM-DD`; undefined for a date that is not one. */
export function yearsOld(birthDate: string, today: string): number | undefined {
  const shape = /^(\d{4})-(\d{2})-(\d{2})$/;
  const born = shape.exec(birthDate);
  const now = shape.exec(today);
  if (born === null || now === null) return undefined;
  const check = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== birthDate) {
    return undefined;
  }
  const years = Number(now[1]) - Number(born[1]);
  const hadBirthday = `${now[2]}-${now[3]}` >= `${born[2]}-${born[3]}`;
  return hadBirthday ? years : years - 1;
}

/**
 * When the date of birth and the child-or-adult choice disagree, which one wins (R-28):
 * - `tick-keeps-child`: marked as a child while the date says adult; the tick wins, so
 *   they are treated as a child until an admin changes the choice;
 * - `date-makes-child`: marked as an adult while the date says child; the date wins, so
 *   they are treated as a child until their 18th birthday.
 * Undefined when they do not disagree, or there is no date.
 */
export type ChildDisagreement = 'tick-keeps-child' | 'date-makes-child';

export function childDisagreement(
  details: { readonly birthDate: string; readonly child: '' | 'child' | 'adult' },
  /** The league's own today, yyyy-mm-dd. */
  today: string,
): ChildDisagreement | undefined {
  if (details.birthDate === '') return undefined;
  const byDate = isMinorOn({ birthDate: details.birthDate, isMinor: null }, today);
  if (details.child === 'child' && byDate === false) return 'tick-keeps-child';
  if (details.child === 'adult' && byDate === true) return 'date-makes-child';
  return undefined;
}

/** Younger than this, or this old and older, a date of birth is shown back before it is saved. */
export const unlikelyAge = { under: 5, from: 80 } as const;

/** How old a typed date makes a player, when that is unlikely enough to ask; else undefined. */
export function unlikelyYears(birthDate: string, today: string): number | undefined {
  const years = yearsOld(birthDate.trim(), today);
  if (years === undefined || years < 0) return undefined;
  return years < unlikelyAge.under || years >= unlikelyAge.from ? years : undefined;
}

/**
 * How the record says a person is treated, and because of what (R-28, R-15): by the date
 * of birth, by the choice, by both, or, where neither says, by who plays in the league (a
 * youth or mixed league shows someone whose age is not recorded as a child; an adult
 * league as an adult). Asked of core's isMinorOn alone, as everywhere.
 */
export type Treatment =
  | 'child-by-both'
  | 'child-by-date'
  | 'child-by-choice'
  | 'child-by-choice-over-date'
  | 'child-not-recorded'
  | 'adult-by-both'
  | 'adult-by-date'
  | 'adult-by-choice'
  | 'adult-not-recorded';

export function treatmentOf(
  details: { readonly birthDate: string; readonly child: '' | 'child' | 'adult' },
  /** The league's own today, yyyy-mm-dd. */
  today: string,
  audience: 'adult' | 'youth' | 'mixed',
): Treatment {
  const byDate =
    details.birthDate === ''
      ? null
      : isMinorOn({ birthDate: details.birthDate, isMinor: null }, today);
  const choice = details.child;
  if (byDate === true) return choice === 'child' ? 'child-by-both' : 'child-by-date';
  if (choice === 'child') return byDate === false ? 'child-by-choice-over-date' : 'child-by-choice';
  if (byDate === false) return choice === 'adult' ? 'adult-by-both' : 'adult-by-date';
  if (choice === 'adult') return 'adult-by-choice';
  return audience === 'adult' ? 'adult-not-recorded' : 'child-not-recorded';
}

/** Whether a treatment is a child's: what the public pages' name rule is given. */
export const treatedAsChild = (treatment: Treatment): boolean => treatment.startsWith('child-');
