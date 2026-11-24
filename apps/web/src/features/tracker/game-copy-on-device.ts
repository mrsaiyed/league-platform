// "Save a copy" on the scoring device (S-5, T-129, step 2.70): the game's commands that
// the server does not have yet, written as a copy of the game (contracts' game-copy.ts)
// for the upload page to send from any phone or computer through the same door.
//
// What goes in (T-363): this account's own taps of this game still waiting to be sent,
// each with its ID and the protocol version it was made under, in the queue's order.
// Taps the server has already answered for are on it, so they are left out; taps it
// refused stay refused; taps listed as not saved, made after another device took the
// game, have their own way back ("Send these plays" or "Enter again", T-335) and are left
// out, so a copy never puts them on top of another scorekeeper's plays.
import { writeGameCopy } from '@srleagues/contracts';
import { madeBy, type QueuedCommand } from './queue-storage.ts';
import type { TrackerControllerStatus } from './tracker-controller.ts';

export type GameCopyFile = {
  readonly text: string;
  readonly fileName: string;
  /** How many commands it holds: none when everything is on the server. */
  readonly count: number;
};

/** The copy of a game from what the device keeps of it. */
export function gameCopyFile(input: {
  readonly leagueId: string;
  readonly gameId: string;
  readonly accountId: string;
  readonly entries: readonly QueuedCommand[];
  readonly savedAt: number;
}): GameCopyFile {
  const commands = input.entries
    .filter(
      (entry) =>
        entry.gameId === input.gameId &&
        entry.state === 'waiting' &&
        madeBy(entry, input.accountId),
    )
    .map((entry) => ({ protocolVersion: entry.protocolVersion, command: entry.command }));
  return {
    text: writeGameCopy({
      leagueId: input.leagueId,
      gameId: input.gameId,
      savedAt: input.savedAt,
      commands,
    }),
    fileName: copyFileName(input.gameId, input.savedAt),
    count: commands.length,
  };
}

const two = (n: number) => n.toString().padStart(2, '0');

/**
 * The file's name: the end of the game's ID and when, on the device's own clock, so two
 * copies of one game sort by time. No team or person is named in it.
 */
export function copyFileName(gameId: string, savedAt: number): string {
  const at = new Date(savedAt);
  const day = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
  const time = `${two(at.getHours())}${two(at.getMinutes())}`;
  return `game-copy-${gameId.slice(-8)}-${day}-${time}.json`;
}

/**
 * Whether the screen suggests saving a copy (T6 §4, T-129): plays have waited with no
 * answer for the controller's `offlineLongMs` (five minutes, T-364), and some still wait.
 */
export function suggestsCopy(
  status: Pick<TrackerControllerStatus, 'offlineLong' | 'queue'>,
): boolean {
  return status.offlineLong && status.queue.waiting > 0;
}
