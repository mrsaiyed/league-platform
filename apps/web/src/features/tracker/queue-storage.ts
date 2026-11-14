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
  /**
   * The scoring session the tap was made under (T-116), so it is never sent under
   * another one once that session lost the game (T6 §5, record 049). Absent on a tap
   * stored with no session, or before this was kept.
   */
  readonly sessionId?: string;
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

/**
 * Fixed codes for what went wrong, never sentences (T-187): the tracker picks the words.
 * The message of every error a storage or the queue throws is one of these.
 */
export const queueErrorCodes = [
  /** The tap's command ID is already held for a different game: a bug in the caller. */
  'command-id-in-other-game',
  /** The queue was stopped; nothing more is stored. */
  'queue-stopped',
  /** The browser gives no database storage here (some private windows). */
  'storage-unavailable',
  /** Another tab holds an older version of the database open and will not let go. */
  'storage-blocked',
  /** A newer build has upgraded the database; this older one cannot open it. */
  'storage-newer-version',
  'storage-write-failed',
  'storage-read-failed',
] as const;
export type QueueErrorCode = (typeof queueErrorCodes)[number];

export class QueueError extends Error {
  readonly code: QueueErrorCode;
  constructor(code: QueueErrorCode, options?: { cause?: unknown }) {
    super(code, options);
    this.name = 'QueueError';
    this.code = code;
  }
}

/** `added` when the tap is newly stored, `held` when the device already had it. */
export type AddResult = 'added' | 'held';

export interface QueueStorage {
  /**
   * Adds a tap at the end of its game's queue. Resolves only once it is safely stored:
   * the screen confirms the tap after this, never before (T-114). A command ID the
   * device already holds for the same game is left as it is (`held`); one held for
   * another game rejects with `command-id-in-other-game`.
   */
  add(
    gameId: string,
    entry: {
      readonly protocolVersion: number;
      readonly command: TrackerCommand;
      readonly sessionId?: string;
    },
  ): Promise<AddResult>;
  /** The game's queue, oldest tap first. */
  list(gameId: string): Promise<readonly QueuedCommand[]>;
  /** Applies one answer in a single write. IDs the queue no longer holds are ignored. */
  settle(gameId: string, settlement: QueueSettlement): Promise<void>;
}
