// Who may give one game its own format, and when (step 2.119; P7 §5.1, S-21, S-35; T-341).
// An admin (`games.manage` at the game's program: an admin or a scheduler) may at any time
// before the game is under way, from the games area. Whoever may score the game may too,
// at the table before the first play, while the league's setting "Scorekeepers may change
// a game's format before it starts" is on (it is to begin with). Once the game is under
// way both are refused: its rules are then fixed (S-1); a game that is over (a final
// score or a box score, or ended at the table) is refused as finished, not as under way.
// Everything is read in the command's own transaction (T-75).
import type { CommandContext } from '../../command/index.ts';
import { hasPermissionAnywhere } from '../access/index.ts';
import { lookupSetting, scorekeepersMayChangeFormat } from '../leagues/index.ts';
import { isDecided } from './game-fields.ts';
import { readState } from './live-game.ts';
import {
  mayChangeGames,
  mayScoreGame,
  mayViewChanges,
  mayViewScoring,
  readOnlyStateOf,
  seasonScope,
} from './policy.ts';
import type { GameRecord, GamesTx, TrackerTx } from './ports.ts';

/** Why this person may not change the game's format now. */
export type FormatRefusal =
  | 'no-permission'
  | 'setting-off'
  | 'under-way'
  | 'finished'
  /** Its season is archived (O-12, step 2.130): the commands are refused there too. */
  | 'season-archived'
  /** The league is archived or suspended (U-9, T-519): the format is shown, never changed. */
  | 'league-read-only';

/** Whether this person may change the game's format now, and as whom; else why not. */
export type FormatChange =
  | { readonly may: true; readonly as: 'admin' | 'scorekeeper' }
  | { readonly may: false; readonly reason: FormatRefusal };

/** The league's choice, or the starting value (on) when it has made none. */
export async function scorekeepersMayChangeFormatOf(tx: GamesTx): Promise<boolean> {
  const rows = await tx.games.leagueSettingRows(scorekeepersMayChangeFormat.key);
  return lookupSetting(scorekeepersMayChangeFormat, rows).value;
}

/**
 * Whether the game is still before its first play: scheduled or postponed, with no rules
 * fixed, and on the tracker (if it has been opened there) nothing but line-ups and colors:
 * no play, and a clock that has never run. That is exactly when the rules still reach the
 * tracker's state (withCurrentRules, live-game.ts); the first play or clock tap ends it.
 */
export function beforeFirstPlay(
  game: GameRecord,
  saved: { readonly state: unknown } | undefined,
): boolean {
  if (game.status !== 'scheduled' && game.status !== 'postponed') return false;
  if (game.format !== null && game.format !== undefined) return false;
  if (saved === undefined) return true;
  const state = readState(saved.state);
  return state.status === 'scheduled' && !state.clock.running && state.clock.elapsedMs === 0;
}

/** Whether `context` may reach a game's format at all: an admin of its games, or its scorer. */
export async function mayReachFormat(
  context: CommandContext,
  tx: GamesTx,
  game: GameRecord,
): Promise<'admin' | 'scorekeeper' | undefined> {
  const scope = await seasonScope(tx, game.seasonId);
  if (await mayChangeGames(context, tx, 'games.manage', scope)) return 'admin';
  if (await mayScoreGame(context, tx, game.id)) return 'scorekeeper';
  return undefined;
}

/**
 * Whether `context` may see a game's format (T-519): whoever mayAskAboutFormat lets in a
 * working league, an archived league's games too (U-9); a suspended league's only for its
 * owner and admins (T-520). The changes still ask mayAskAboutFormat.
 */
export async function mayViewFormat(
  context: CommandContext,
  tx: GamesTx,
  gameId: string,
): Promise<boolean> {
  const game = await tx.games.find(gameId);
  if (game === undefined) return mayAskAboutFormat(context, tx, gameId);
  const scope = await seasonScope(tx, game.seasonId);
  return (
    (await mayViewChanges(context, tx, 'games.manage', scope)) ||
    (await mayViewScoring(context, tx, game.id))
  );
}

/** The one rule the commands and the read follow, so a form is never offered and then refused. */
export async function formatChangeOf(
  context: CommandContext,
  tx: TrackerTx,
  game: GameRecord,
): Promise<FormatChange> {
  const as = await mayReachFormat(context, tx, game);
  if (as === undefined) {
    // Reached only by someone the read let in (mayViewFormat): in a read-only league. A
    // decided game is over there as anywhere, and says so (T-519).
    if ((await readOnlyStateOf(tx)) === null) return { may: false, reason: 'no-permission' };
    return { may: false, reason: isDecided(game.status) ? 'finished' : 'league-read-only' };
  }
  if (isDecided(game.status)) return { may: false, reason: 'finished' };
  if (await tx.games.seasonArchived(game.seasonId)) {
    return { may: false, reason: 'season-archived' };
  }
  if (as === 'scorekeeper' && !(await scorekeepersMayChangeFormatOf(tx))) {
    return { may: false, reason: 'setting-off' };
  }
  if (!beforeFirstPlay(game, await tx.liveGames.findState(game.id))) {
    return { may: false, reason: 'under-way' };
  }
  return { may: true, as };
}

/**
 * Whether `context` may ask about or change this game's format; for a game that is not
 * there, whether they may manage or score games anywhere, so only they learn it is missing.
 */
export async function mayAskAboutFormat(
  context: CommandContext,
  tx: GamesTx,
  gameId: string,
): Promise<boolean> {
  const game = await tx.games.find(gameId);
  if (game !== undefined) return (await mayReachFormat(context, tx, game)) !== undefined;
  return (
    (await hasPermissionAnywhere(context, tx, 'games.manage')) ||
    (await hasPermissionAnywhere(context, tx, 'games.score'))
  );
}
