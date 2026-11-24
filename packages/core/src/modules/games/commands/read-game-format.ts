// What the format screens need of one game (step 2.119; P7 §5.1, S-35, S-39): the format
// it was given, its season's, the one that applies (fixed at its start once it is under
// way, else the given one, else the season's), every rule of that one for the start
// confirmation (the clock mode included), whether this person may change it now and if
// not why (the same rule the commands follow, game-format.ts), and the form's presets
// (checklist B2). Asked by an admin from the games area or by whoever scores the game. It
// changes nothing, but runs in the same shape as a command (record 014).
import {
  formatFacts,
  formatOfRules,
  gameFormatPresets,
  parseGameFormat,
  type FormatFact,
  type GameFormatPresetChoice,
  type GameFormatRules,
} from '@srleagues/contracts';
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { formatChangeOf, mayAskAboutFormat, type FormatChange } from '../game-format.ts';
import type { TrackerTx } from '../ports.ts';
import { effectiveRulesOf, seasonRulesOf } from '../season-rules-of.ts';
import { lowerId } from '../scoring-session.ts';

export type GameFormatView = {
  /** The game's version, for the change to send back. */
  readonly version: number;
  /** The format the game was given; null while it follows its season's. */
  readonly given: GameFormatRules | null;
  readonly season: GameFormatRules;
  /** The format the game is played under, or would start under now. */
  readonly applies: GameFormatRules;
  /** Where `applies` comes from: fixed at its start, given, or the season's. */
  readonly source: 'fixed' | 'given' | 'season';
  /** Every rule of `applies`, in the confirmation's order (S-39). */
  readonly facts: readonly FormatFact[];
  readonly change: FormatChange;
  readonly presets: readonly GameFormatPresetChoice[];
};

export type ReadGameFormatError = { readonly code: 'game-not-found' };

export const readGameFormat = defineCommand({
  name: 'games.read_game_format',
  permission: 'games.score',
  input: z.object({ gameId: lowerId }),
  allowed: (context, input, tx: TrackerTx) => mayAskAboutFormat(context, tx, input.gameId),
  run: async ({ context, input, tx }): Promise<Result<GameFormatView, ReadGameFormatError>> => {
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    const seasonRules = await seasonRulesOf(tx, game.seasonId);
    const given = parseGameFormat(await tx.games.givenFormat(game.id));
    const applies = formatOfRules(await effectiveRulesOf(tx, game));
    const fixed = game.format !== null && game.format !== undefined;
    return ok({
      version: game.version,
      given,
      season: formatOfRules(seasonRules),
      applies,
      source: fixed ? 'fixed' : given === null ? 'season' : 'given',
      facts: formatFacts(applies),
      change: await formatChangeOf(context, tx, game),
      presets: gameFormatPresets(seasonRules),
    });
  },
});
