// A season's rules as the games commands read them: the stored document in the
// current format, or the starting set while the season has none saved (as the leagues
// module reads them, step 2.5).
import { defaultSeasonRules, upgradeSeasonRules, type SeasonRules } from '@srleagues/contracts';
import type { GamesTx } from './ports.ts';

export async function seasonRulesOf(tx: GamesTx, seasonId: string): Promise<SeasonRules> {
  const season = await tx.games.findSeason(seasonId);
  const upgraded = season === undefined ? undefined : upgradeSeasonRules(season.rules);
  return upgraded?.ok === true ? upgraded.rules : defaultSeasonRules();
}
