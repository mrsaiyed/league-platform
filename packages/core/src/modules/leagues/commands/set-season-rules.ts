// Sets a season's rules document (step 2.5, P7 §1, S-1). The whole document is
// checked against the written contract, so a rule that makes no sense (a double bonus
// before the bonus, a coin flip that is not last) is refused. The save names the
// version it started from and is refused if another admin saved since (A-8, T-46).
// The unique-jersey switch is part of the document (record 022): the database
// refuses turning it on while a team already has a number worn twice.
//
// Before the first game is decided a change simply saves. After it, a change that would
// move anything in the standings (a tiebreaker that reorders them, a forfeit score
// that alters a point difference) is refused with the teams it would move until the
// admin saves again with `confirmed: true`; nothing is saved without it (S-1). A saved
// change works the season's standings out again, in the same transaction. Game rules
// (clock, fouls, periods) change nothing in the standings, so they save at once.
//
// S-1: game rules reach only games not yet started. A game's own `format` is written
// when it goes live on the tracker (step 2.29, apply-tracker-commands.ts) or is decided
// (decide-game.ts), and the database refuses to change it from then on
// (games_format_fixed_once_started). So a game still to play, including one with only
// its line-ups in, follows the season's rules as they are now; a live or decided game
// keeps the rules it started under.
import { SeasonRules } from '@srleagues/contracts';
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import {
  previewRulesChange,
  rebuildSeason,
  type StandingsTx,
  type TeamMove,
} from '../../standings/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayEditLeague, seasonScope } from '../policy.ts';
import type { LeaguesTx } from '../ports.ts';
import { readSeasonRules } from './season-view.ts';

export type SetSeasonRulesError =
  | { readonly code: 'season-not-found' | 'changed-since-read' | 'unique-jerseys-clash' }
  | { readonly code: 'confirmation-needed'; readonly moves: readonly TeamMove[] };

/** The parts of the document that differ, by name, for the activity log. */
function changedParts(before: SeasonRules, after: SeasonRules): string[] {
  return (Object.keys(after) as (keyof SeasonRules)[]).filter(
    (part) => JSON.stringify(before[part]) !== JSON.stringify(after[part]),
  );
}

export const setSeasonRules = defineCommand({
  name: 'leagues.set_season_rules',
  permission: 'season.settings',
  input: z.object({
    seasonId: z.uuid(),
    version: z.number().int().positive(),
    rules: SeasonRules,
    /** The admin has seen what the change moves and agrees (S-1). */
    confirmed: z.boolean().default(false),
  }),
  allowed: async (context, input, tx: LeaguesTx & StandingsTx) =>
    mayEditLeague(context, tx, 'season.settings', await seasonScope(tx, input.seasonId)),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ version: number }, SetSeasonRulesError>> => {
    const season = await tx.leagues.findSeason(input.seasonId);
    if (season === undefined) return fail({ code: 'season-not-found' });
    if (season.version !== input.version) return fail({ code: 'changed-since-read' });
    const before = readSeasonRules(season.rules);
    const changed = changedParts(before.rules, input.rules);
    if (before.saved && changed.length === 0) return ok({ version: season.version });
    // Hold the season's standings first, so the preview is worked out one after the
    // other with any result being saved at the same time, and not from a stale table.
    await tx.standings.lockSeason(season.id);
    // What the change would move, once a game has been decided.
    const preview = await previewRulesChange(tx, season.id, input.rules);
    const moves = preview?.gamesDecided === true ? preview.moves : [];
    if (moves.length > 0 && !input.confirmed) return fail({ code: 'confirmation-needed', moves });
    const updated = await tx.leagues.updateSeason(season.id, { rules: input.rules }, input.version);
    if (updated === 'unique-jerseys-clash') return fail({ code: 'unique-jerseys-clash' });
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await rebuildSeason(tx, season.id);
    await recordActivity(tx, context, {
      action: 'leagues.set_season_rules',
      target: { type: 'season', id: season.id },
      details: {
        changed: before.saved ? changed.join(',') : 'all',
        ...(moves.length > 0 ? { confirmed: 'yes', teamsMoved: moves.length } : {}),
      },
    });
    return ok({ version: updated });
  },
});
