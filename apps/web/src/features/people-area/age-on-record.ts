// What a person's record says about their age, for the People screens only (step 2.50;
// R-28 as the lead changed it on 2026-11-17: a person counts as a child if their birth
// date says so OR the "minor" tick is on; a date that says adult does not untick anyone).
//
// TO BE REPLACED at the merge of the build branch once step 2.93 part 5 has landed: the
// product's one rule is then `isMinorOn` (packages/core, people/rules/minor-by-age.ts), and
// this file keeps only what the screen asks that the rule does not answer (how old a date
// makes someone, for the check before an unlikely date is saved). Nothing else on the
// page, and no query, works out whether someone is a child.

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
 * The tick says a child while the birth date says an adult (R-28): the tick wins, so the
 * person is treated as a child until an admin takes it off, and the screen says so.
 */
export function tickKeepsAChild(
  details: { readonly birthDate: string; readonly child: '' | 'child' | 'adult' },
  today: string,
): boolean {
  if (details.child !== 'child') return false;
  const years = yearsOld(details.birthDate, today);
  return years !== undefined && years >= 18;
}

/** Younger than this, or this old and older, a date of birth is shown back before it is saved. */
export const unlikelyAge = { under: 5, from: 80 } as const;

/** How old a typed date makes a player, when that is unlikely enough to ask; else undefined. */
export function unlikelyYears(birthDate: string, today: string): number | undefined {
  const years = yearsOld(birthDate.trim(), today);
  if (years === undefined || years < 0) return undefined;
  return years < unlikelyAge.under || years >= unlikelyAge.from ? years : undefined;
}
