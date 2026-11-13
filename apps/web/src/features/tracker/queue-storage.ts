// T-114: where the tracker's queue lives on the device. The browser keeps it in its
// database storage (IndexedDB, indexeddb-queue-storage.ts); tests keep it in memory
// (memory-queue-storage.ts). Both behave the same, and the queue knows only this shape.
import type { RefusalCode, TrackerCommand } from '@srleagues/contracts';

/** Why the server would not apply a command (T-113), as its reply said. */
export type CommandRefusal = { readonly code: RefusalCode; readonly message: string };

/** One tap held on the device until the server has answered for it. */
export type QueuedCommand = {
  readonly gameId: string;
  /**
   * The protocol version the tracker spoke when the tap was made. It is sent with the
   * command, so a queue written before a release still goes out as it was made (T-127).
   */
  readonly protocolVersion: number;
  readonly command: TrackerCommand;
} & (
  | { readonly state: 'waiting' }
  /** Refused: kept so the scorekeeper can be told, never sent again. */
  | { readonly state: 'refused'; readonly refusal: CommandRefusal }
);

/** What one answer from the server changes, written together or not at all. */
export type QueueSettlement = {
  /** Commands to drop: the server has them (accepted or duplicate), or they are given up. */
  readonly remove?: readonly string[];
  readonly refuse?: readonly { readonly commandId: string; readonly refusal: CommandRefusal }[];
};

export interface QueueStorage {
  /**
   * Adds a tap at the end of its game's queue. Resolves only once it is safely stored:
   * the screen confirms the tap after this, never before (T-114). A command ID the
   * device already holds is left as it is.
   */
  add(
    gameId: string,
    entry: { readonly protocolVersion: number; readonly command: TrackerCommand },
  ): Promise<void>;
  /** The game's queue, oldest tap first. */
  list(gameId: string): Promise<readonly QueuedCommand[]>;
  /** Applies one answer in a single write. IDs the queue no longer holds are ignored. */
  settle(gameId: string, settlement: QueueSettlement): Promise<void>;
}
