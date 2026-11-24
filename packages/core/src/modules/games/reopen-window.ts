// Whether, and until when, an account may reopen a game from its tracker (step 2.120;
// S-36; record 060, T-263). One rule for the read that tells the device before the tap
// (games.read_reopen_offer) and for the reopen itself (games.reopen_tracked_game), so
// the button is never offered and then refused for a reason the read did not give.
//
// Its caller has already checked that the account may score this game now (mayScoreGame,
// read fresh). Then:
//
// - only a game its tracker ended: final, with a saved state the engine ended;
// - an account that may also correct games at the game's program reopens it at any time;
// - otherwise only the account that sent the game's latest end, and only while the game
//   ended no longer ago than the league's games.scorekeeperReopenMinutes (0: never).
//   How long ago is measured inside the database (`statement_timestamp() -
//   finalized_at`, so a wait for the game's lock counts too), so the two
//   ends are one clock; the device's clock never counts. Exactly the setting's minutes
//   still counts.
//
// O-12 (an archived season changes only by a correction from someone who may correct
// games, step 2.130, T-381): in an archived season the answer is "no" (`season-archived`)
// for a scorekeeper; someone who may correct games still reopens it, with a reason, which
// is that correction (the reopen writes it), so the season's game can be put right.
import type { CommandContext } from '../../command/index.ts';
import { lookupSetting, scorekeeperReopenMinutes } from '../leagues/index.ts';
import { isDecided } from './game-fields.ts';
import { readState } from './live-game.ts';
import { gameScope, mayChangeGames } from './policy.ts';
import type { GameRecord, SavedGameState, TrackerTx } from './ports.ts';

/** Why Reopen is not offered to this account now. */
export type ReopenNotOffered =
  | 'game-not-decided'
  | 'not-ended-by-tracker'
  | 'scorekeepers-may-not-reopen'
  | 'not-ended-by-you'
  | 'reopen-time-over'
  /** It could be reopened, but an overturn rules on its result (S-85). */
  | 'result-overturned'
  /** Its season is archived (O-12): only someone who may correct games reopens it. */
  | 'season-archived';

export type ReopenWhen =
  | { readonly when: 'always' }
  /** Until this time by the server's clock (`tx.clock`), in milliseconds. */
  | { readonly when: 'until'; readonly until: number }
  | { readonly when: 'no'; readonly code: ReopenNotOffered };

export type ReopenOffer = {
  readonly reopen: ReopenWhen;
  /** The account that sent the game's latest end; null when there is none or it had no account. */
  readonly endedBy: string | null;
};

const minuteMs = 60_000;

export async function reopenOffer(
  context: CommandContext,
  tx: TrackerTx,
  game: GameRecord,
  saved: SavedGameState | undefined,
): Promise<ReopenOffer> {
  const no = (code: ReopenNotOffered, endedBy: string | null = null): ReopenOffer => ({
    reopen: { when: 'no', code },
    endedBy,
  });
  if (!isDecided(game.status)) return no('game-not-decided');
  if (game.status !== 'final' || saved === undefined) return no('not-ended-by-tracker');
  if (readState(saved.state).status !== 'final') return no('not-ended-by-tracker');
  const endedBy = (await tx.liveGames.findLastEnd(game.id))?.accountId ?? null;
  if (await mayChangeGames(context, tx, 'games.correct', await gameScope(tx, game.id))) {
    if (game.overturned === true) return no('result-overturned', endedBy);
    return { reopen: { when: 'always' }, endedBy };
  }
  if (await tx.games.seasonArchived(game.seasonId)) return no('season-archived', endedBy);
  const rows = await tx.games.leagueSettingRows(scorekeeperReopenMinutes.key);
  const minutes = lookupSetting(scorekeeperReopenMinutes, rows).value;
  if (minutes === 0) return no('scorekeepers-may-not-reopen', endedBy);
  if (endedBy === null || endedBy !== context.accountId) return no('not-ended-by-you', endedBy);
  const ago = await tx.liveGames.endedAgo(game.id);
  const left = minutes * minuteMs - (ago ?? Number.POSITIVE_INFINITY);
  if (left < 0) return no('reopen-time-over', endedBy);
  if (game.overturned === true) return no('result-overturned', endedBy);
  return { reopen: { when: 'until', until: tx.clock.now() + left }, endedBy };
}
