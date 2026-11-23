// What must be put right before a league is published: P3 §3's "Must fix" list (step
// 2.240). One pure function, used twice: the League settings screen draws each check met
// or not, and setLeagueStatus refuses to publish while one is not met, so a posted form
// cannot skip them. Only the checks the product can know today are here: "sample data
// still present" comes with the step that brings sample data (O-2; decided for you at
// step 2.240).
import type { Audience } from '../league-values.ts';

/** The checks, in the order the screen lists them. */
export const publishCheckKeys = ['contactEmail', 'privacyChosen'] as const;
export type PublishCheckKey = (typeof publishCheckKeys)[number];

export type PublishFacts = {
  /** How people reach the league, or null when it was never given. */
  readonly contactEmail: string | null;
  readonly audience: Audience;
  /** Whether anyone in the league, not in the bin, is recorded as a child. */
  readonly hasRecordedChild: boolean;
  /** Whether the league's admin has saved "Names on public pages" themselves. */
  readonly namesChosen: boolean;
};

export type PublishCheck = { readonly key: PublishCheckKey; readonly met: boolean };

/**
 * A league has under-18s when it is a youth or mixed league, or anyone in it is recorded
 * as a child (record 065): then its privacy choices must be made before it is public.
 */
const hasUnder18s = (facts: PublishFacts): boolean =>
  facts.audience !== 'adult' || facts.hasRecordedChild;

/** The checks that apply to this league, each met or not. */
export function publishChecks(facts: PublishFacts): readonly PublishCheck[] {
  const checks: PublishCheck[] = [
    { key: 'contactEmail', met: (facts.contactEmail ?? '').trim() !== '' },
  ];
  if (hasUnder18s(facts)) checks.push({ key: 'privacyChosen', met: facts.namesChosen });
  return checks;
}

/** The first check not met, or undefined when the league may be published. */
export function firstUnmetCheck(checks: readonly PublishCheck[]): PublishCheckKey | undefined {
  return checks.find((check) => !check.met)?.key;
}
