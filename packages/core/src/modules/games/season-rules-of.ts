// The rules the games commands judge a game by. A game that has rules of its own
// (`format`, S-1, S-21) is judged by them, so a tie or a forfeit score follows the rules
// it is played under; otherwise by its season's: the stored document in the current
// format, or the starting set while the season has none saved (as the leagues module
// reads them, step 2.5). A format that cannot be read in the current version falls back
// to the season's rules.
import { defaultSeasonRules, upgradeSeasonRules, type SeasonRules } from '@srleagues/contracts';
import type { GameRecord, GamesStore, GamesTx } from './ports.ts';

export async function seasonRulesOf(
  tx: { readonly games: Pick<GamesStore, 'findSeason'> },
  seasonId: string,
): Promise<SeasonRules> {
  const season = await tx.games.findSeason(seasonId);
  const upgraded = season === undefined ? undefined : upgradeSeasonRules(season.rules);
  return upgraded?.ok === true ? upgraded.rules : defaultSeasonRules();
}

/** The rules this game is played under: its own if it has them, else its season's. */
export async function effectiveRulesOf(tx: GamesTx, game: GameRecord): Promise<SeasonRules> {
  if (game.format !== null && game.format !== undefined) {
    const own = upgradeSeasonRules(game.format);
    if (own.ok) return own.rules;
  }
  return seasonRulesOf(tx, game.seasonId);
}
