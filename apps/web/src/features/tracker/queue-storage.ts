// T-114: where the tracker's queue lives on the device. The browser keeps it in its
// database storage (IndexedDB, indexeddb-queue-storage.ts); tests keep it in memory
// (memory-queue-storage.ts). Both behave the same, and the queue knows only this shape.
// A "tap" here is anything the queue sends: since protocol 2 (record 058) a change of
// players at the scorer's table too, kept and sent in order with the plays.
import type { BatchCommand, RefusalCode, TablePlayerProblem } from '@srleagues/contracts';

/**
 * Why the server would not apply a command (T-113), as its reply said. Since protocol
 * 2 (record 058) a play or a change of players also says why as a fixed code, with the
 * player it names, the refused change it follows, and for a number already worn who
 * wears it, so the tracker can word it (T-187). The wearer is kept by id and number
 * only: their name is never stored in the queue (record 054); the screen takes it from
 * the device's rosters.
 */
export type CommandRefusal = {
  readonly code: RefusalCode;
  readonly message: string;
  readonly problem?: TablePlayerProblem;
  readonly wornBy?: { readonly playerId: string; readonly jersey: string };
  readonly playerId?: string;
  readonly follows?: string;
};

/**
 * Where in the game a tap was made (finding I): the period and the game clock left in
 * it, as the device's game stood when the tap was made. Kept beside the tap, never sent,
 * so a screen can say "Q2 6:30, +2 #4" for a tap that was not saved, even after the game
 * shown has been rebuilt on the server's state, which no longer holds it.
 */
export type GameMoment = {
  /** 1 for the first period; past the regulation periods, overtime. */
  readonly period: number;
  /** The game clock left in the period, in milliseconds. */
  readonly clockMs: number;
};

/** A tap as the screens list it: the command, and where in the game it was made if known. */
export type KeptTap = {
  readonly command: BatchCommand;
  /** Null for a tap stored before this was kept. */
  readonly moment: GameMoment | null;
};

/** One tap held on the device until the server has answered for it. */
export type QueuedCommand = {
  readonly gameId: string;
  /**
   * The protocol version the tracker spoke when the tap was made. It is sent with the
   * command, so a queue written before a release still goes out as it was made (T-127).
   */
  readonly protocolVersion: number;
  readonly command: BatchCommand;
  /**
   * The scoring session the tap was made under (T-116), so it is never sent under
   * another one once that session lost the game (T6 §5, record 049). Absent on a tap
   * stored with no session, or before this was kept.
   */
  readonly sessionId?: string;
  /** Where in the game the tap was made (finding I). Absent on a tap stored before this was kept. */
  readonly moment?: GameMoment;
  /**
   * The league the game is in, so "Your games" lists the tap in its own league however
   * old the game is (step 2.38, T-317). Absent on a tap stored before this was kept.
   */
  readonly leagueId?: string;
  /**
   * The signed-in account that made the tap (T-321): only that account's tracker sends it
   * and only that account's "Your games" lists it. Absent on a tap stored before this was
   * kept, which is listed for whoever is signed in, as it was then.
   */
  readonly accountId?: string;
} & (
  | { readonly state: 'waiting' }
  /** Refused: kept so the scorekeeper can be told, never sent again. */
  | { readonly state: 'refused'; readonly refusal: CommandRefusal }
  /**
   * Not saved: made under a session that lost the game, so never sent (T6 §5). Kept
   * until the scorekeeper has seen the list, so a reload does not lose it.
   */
  | {
      readonly state: 'not-saved';
      /**
       * The sequence of the server's state the tap was made on, when the device knew it
       * as the game was lost (T-335, T-337): kept with the list, so "Send these plays" is
       * still offered after a reload, to the account that made the tap only (T-327).
       */
      readonly notSavedSince?: number;
    }
  /**
   * Taken: this device's own tap the server already has (an uploaded copy took it, or it
   * was answered while the device lost the game), kept beside a not-saved list only so
   * "Send these plays" still names it as the device's own after a reload (T-372). Never
   * sent by the queue, never listed, removed with the list.
   */
  | { readonly state: 'taken' }
);

/** A tap kept as taken (T-372): stored as it is if the device no longer holds it. */
export type TakenTap = {
  readonly protocolVersion: number;
  readonly command: BatchCommand;
  readonly sessionId?: string;
};

/** What one answer from the server changes, written together or not at all. */
export type QueueSettlement = {
  /** Commands to drop: the server has them (accepted or duplicate), or they are given up. */
  readonly remove?: readonly string[];
  readonly refuse?: readonly { readonly commandId: string; readonly refusal: CommandRefusal }[];
  /** Commands to keep as not saved: never sent again, kept until they are removed. */
  readonly notSaved?: readonly string[];
  /** The sequence the `notSaved` taps were made on, kept with each of them (T-337). */
  readonly notSavedSince?: number;
  /**
   * Waiting commands to send under another session of the same device and account
   * (step 2.38): its earlier one ended while it was away, and nobody else scored since.
   */
  readonly carryOn?: { readonly commandIds: readonly string[]; readonly sessionId: string };
  /**
   * The device's own taps the server already took, kept as `taken` (T-372): a held one
   * changes state in its place, one no longer held is stored at the end.
   */
  readonly taken?: readonly TakenTap[];
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

/** A stored tap as the screens list it. */
export const keptTap = (entry: QueuedCommand): KeptTap => ({
  command: entry.command,
  moment: entry.moment ?? null,
});

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
      readonly command: BatchCommand;
      readonly sessionId?: string;
      readonly moment?: GameMoment;
      readonly leagueId?: string;
      readonly accountId?: string;
    },
  ): Promise<AddResult>;
  /** The game's queue, oldest tap first. */
  list(gameId: string): Promise<readonly QueuedCommand[]>;
  /** Applies one answer in a single write. IDs the queue no longer holds are ignored. */
  settle(gameId: string, settlement: QueueSettlement): Promise<void>;
}

/**
 * The queue read across games, for "Your games" (step 2.38, T-317): every tap the device
 * holds that the server does not have, of any game however old, and letting go of a
 * game's taps when the scorekeeper dismisses them (S-88). Both storages give it.
 */
export interface HeldPlaysStorage {
  /** Every tap held on the device, of every game, oldest first. */
  listAll(): Promise<readonly QueuedCommand[]>;
  /**
   * Deletes every tap held for the game, in one write: they are never sent. Given an
   * account, only the taps `madeBy` it (T-321): another account's stay.
   */
  forget(gameId: string, accountId?: string | null): Promise<void>;
}

/** The queue's storage as the browser gives it: a game's queue and the reads across games. */
export type DeviceQueueStorage = QueueStorage & HeldPlaysStorage;

/**
 * Whether `entry` is the account's own (T-321, T-327): made by it. Another account's taps
 * are never sent, listed or dismissed under this one. A tap stored before the maker was
 * kept is nobody's: never sent, listed to nobody; it goes with the device's 14-day keep.
 */
export function madeBy(entry: Pick<QueuedCommand, 'accountId'>, accountId: string | null): boolean {
  return entry.accountId !== undefined && accountId !== null && entry.accountId === accountId;
}

/**
 * `storage` as the signed-in account's own: every tap it stores keeps `leagueId` (T-317)
 * and `accountId` (T-321), and a game's queue lists only the account's own taps.
 */
export function inLeague(storage: QueueStorage, leagueId: string, accountId: string): QueueStorage {
  return {
    add: (gameId, entry) => storage.add(gameId, { ...entry, leagueId, accountId }),
    list: async (gameId) =>
      (await storage.list(gameId)).filter((entry) => madeBy(entry, accountId)),
    settle: (gameId, settlement) => storage.settle(gameId, settlement),
  };
}
