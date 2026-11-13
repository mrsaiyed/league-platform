// What a season command returns: the season as an admin edits it. In a league with one
// program nothing here names the program (U-3, U-12); a league with several gets it.
import { defaultSeasonRules, upgradeSeasonRules, type SeasonRules } from '@srleagues/contracts';
import type { SeasonStatus } from '../league-values.ts';
import type { LeaguesTx, SeasonRecord } from '../ports.ts';

export type SeasonView = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly status: SeasonStatus;
  readonly isCurrent: boolean;
  /** The rules in the current format; the starting rules while none are saved yet. */
  readonly rules: SeasonRules;
  /** False while the season has no rules of its own saved: `rules` is the starting set. */
  readonly rulesSaved: boolean;
  /** Anything dropped on the way to the current format (S-1 shows the admin). */
  readonly rulesWarnings: readonly string[];
  readonly version: number;
  /** Only in a league with more than one program (U-3). */
  readonly programId?: string;
};

/** The stored rules in the current format, or the starting set when nothing valid is saved. */
export function readSeasonRules(stored: unknown): {
  rules: SeasonRules;
  saved: boolean;
  warnings: readonly string[];
} {
  const upgraded = upgradeSeasonRules(stored);
  return upgraded.ok
    ? { rules: upgraded.rules, saved: true, warnings: upgraded.warnings }
    : { rules: defaultSeasonRules(), saved: false, warnings: [] };
}

export async function seasonView(tx: LeaguesTx, season: SeasonRecord): Promise<SeasonView> {
  const { rules, saved, warnings } = readSeasonRules(season.rules);
  const several = (await tx.leagues.programCount()) > 1;
  return {
    id: season.id,
    slug: season.slug,
    name: season.name,
    startsOn: season.startsOn,
    endsOn: season.endsOn,
    status: season.status,
    isCurrent: season.isCurrent,
    rules,
    rulesSaved: saved,
    rulesWarnings: warnings,
    version: season.version,
    ...(several ? { programId: season.programId } : {}),
  };
}
