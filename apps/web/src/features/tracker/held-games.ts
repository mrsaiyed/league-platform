// "Your games" and the plays kept on this device (step 2.38; S-88, T-317). The server's
// list covers today and the week ahead only, so a game scored with no signal on
// Saturday would be gone from it on Sunday with its plays still on the device. The
// device therefore lists, from its own queue, every game it holds plays for that the
// server does not have, however old the game, until they are sent or dismissed.
// No drawing here: held-games-panel.tsx draws it.
import type { Translate } from '@srleagues/site';
import type { OpenedGame } from './opened-game-storage.ts';
import { madeBy, type QueuedCommand } from './queue-storage.ts';

/** One game this device holds plays for. */
export type HeldGame = {
  readonly gameId: string;
  /** Plays waiting to be sent: opening the game sends them. */
  readonly waiting: number;
  /** Plays the league refused, or made under a session that lost the game: never sent. */
  readonly notSaved: number;
  /** When the last of them was tapped (device time, ms). */
  readonly lastTapAt: number;
  /** The two teams' names, while the device still keeps the game's rosters; else null. */
  readonly teams: { readonly home: string; readonly away: string } | null;
  /**
   * Present when nothing on the device says which league the plays were made in (plays
   * kept before the league was, with no rosters left): the game is listed in every league
   * and its line says it may belong to another league of this device.
   */
  readonly leagueUnknown?: true;
};

/**
 * The games of league `leagueId` this device holds plays for, the most recently tapped
 * first. A play keeps the league it was made in (T-317); for one stored before that was
 * kept, the game's kept rosters say the league, and a game the device knows nothing more
 * of is listed in every league, since its plays are better shown than lost.
 */
export function heldGames(
  queue: readonly QueuedCommand[],
  owner: { readonly leagueId: string; readonly accountId: string | null },
  kept: (gameId: string) => Pick<OpenedGame, 'leagueId' | 'rosters' | 'accountId'> | undefined,
): readonly HeldGame[] {
  const { leagueId, accountId } = owner;
  const byGame = new Map<string, QueuedCommand[]>();
  for (const entry of queue) {
    // Only the signed-in account's own plays (T-321): another's stay on the device, for it.
    if (!madeBy(entry, accountId)) continue;
    const rows = byGame.get(entry.gameId);
    if (rows === undefined) byGame.set(entry.gameId, [entry]);
    else rows.push(entry);
  }
  const held: HeldGame[] = [];
  for (const [gameId, rows] of byGame) {
    const keptGame = kept(gameId);
    const game = keptGame?.accountId === accountId ? keptGame : undefined;
    const madeIn = rows.find((row) => row.leagueId !== undefined)?.leagueId ?? game?.leagueId;
    if (madeIn !== undefined && madeIn !== leagueId) continue;
    const waiting = rows.filter((row) => row.state === 'waiting').length;
    held.push({
      gameId,
      waiting,
      notSaved: rows.length - waiting,
      lastTapAt: Math.max(...rows.map((row) => row.command.at)),
      teams:
        game === undefined || game.leagueId !== leagueId
          ? null
          : { home: game.rosters.home.name, away: game.rosters.away.name },
      ...(madeIn === undefined ? { leagueUnknown: true as const } : {}),
    });
  }
  return held.sort((a, b) => b.lastTapAt - a.lastTapAt);
}

/** The words a held game's panel needs: only the tracker's `tracker.held.` messages (T-187). */
export const heldGamesPrefix = 'tracker.held.';

/**
 * Where "Open to send" goes for a game. The page hands the device the tracker's address
 * built by the one address helper (T-34) for `heldGameMark`, and the device puts the
 * game's id in its place: no address is written by hand.
 */
export const heldGameMark = 'held-game-mark';

export function heldGameHref(template: string, gameId: string): string {
  return template.replace(heldGameMark, encodeURIComponent(gameId));
}

/** How a held game is said: which game, and what of it the device still holds. */
export function heldGameWords(
  game: HeldGame,
  t: Translate,
): { readonly name: string; readonly counts: readonly string[] } {
  const counts = [
    ...(game.waiting > 0 ? [t.plural('tracker.held.waiting', game.waiting)] : []),
    ...(game.notSaved > 0 ? [t.plural('tracker.held.notSaved', game.notSaved)] : []),
  ];
  const name =
    game.teams !== null
      ? t('tracker.held.game', game.teams)
      : game.leagueUnknown === true
        ? t('tracker.held.someGameAnyLeague')
        : t('tracker.held.someGame');
  return { name, counts };
}

/**
 * The question Dismiss asks first (S-88): it says what is lost. Plays waiting to be sent
 * are deleted from the device and never reach the league; the ones not saved are only
 * the list of what to enter again.
 */
export function dismissQuestion(game: HeldGame, t: Translate): string {
  return game.waiting > 0
    ? t.plural('tracker.held.dismissWaiting', game.waiting)
    : t.plural('tracker.held.dismissNotSaved', game.notSaved);
}
