// The rules the games commands judge a game by. A game that has rules of its own
// (`format`, S-1, S-21) is judged by them, so a tie or a forfeit score follows the rules
// it is played under; otherwise by its season's: the stored document in the current
// format, or the starting set while the season has none saved (as the leagues module
// reads them, step 2.5). A format that cannot be read in the current version falls back
// to the season's rules.
import {
  defaultSeasonRules,
  parseGameFormat,
  rulesWithFormat,
  upgradeSeasonRules,
  type SeasonRules,
} from '@srleagues/contracts';
import type { GameRecord, GamesStore, GamesTx } from './ports.ts';

/** A season's rules as stored, read in the current format; the starting set if unreadable or none. */
const readSeasonRules = (stored: unknown): SeasonRules => {
  const upgraded = stored === undefined ? undefined : upgradeSeasonRules(stored);
  return upgraded?.ok === true ? upgraded.rules : defaultSeasonRules();
};

/**
 * The rules a game is played under, from what is stored: the game's own `format` if it
 * has one that reads, else its season's stored rules (undefined when the season has
 * none or is not found). The same answer as effectiveRulesOf, for a caller that has
 * already read both (the Al-Hadi transfer, step 2.58).
 */
export function rulesOfGame(format: unknown, seasonRules: unknown): SeasonRules {
  if (format !== null && format !== undefined) {
    const own = upgradeSeasonRules(format);
    if (own.ok) return own.rules;
  }
  return readSeasonRules(seasonRules);
}

export async function seasonRulesOf(
  tx: { readonly games: Pick<GamesStore, 'findSeason'> },
  seasonId: string,
): Promise<SeasonRules> {
  const season = await tx.games.findSeason(seasonId);
  return readSeasonRules(season?.rules);
}

/**
 * The rules a game would start under now (step 2.119): its season's as they stand, with the
 * format it was GIVEN in place of the season's, if it was given one that reads. What marking
 * it not started returns it to, whatever rules were fixed when it started.
 */
export async function rulesBeforeStartOf(
  tx: { readonly games: Pick<GamesStore, 'findSeason' | 'givenFormat'> },
  game: Pick<GameRecord, 'id' | 'seasonId'>,
): Promise<SeasonRules> {
  const season = await seasonRulesOf(tx, game.seasonId);
  const given = parseGameFormat(await tx.games.givenFormat(game.id));
  return given === null ? season : rulesWithFormat(season, given);
}

/**
 * The rules this game is played under: those fixed at its start if it has them, else the
 * rules it would start under now (rulesBeforeStartOf).
 */
export async function effectiveRulesOf(tx: GamesTx, game: GameRecord): Promise<SeasonRules> {
  if (game.format !== null && game.format !== undefined) {
    const own = upgradeSeasonRules(game.format);
    if (own.ok) return own.rules;
  }
  return rulesBeforeStartOf(tx, game);
}
