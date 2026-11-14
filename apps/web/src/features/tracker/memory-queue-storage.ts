// The queue's storage kept in memory, for tests and for a page that has no database
// storage. It copies what goes in and what comes out, as the browser's storage does,
// so a test cannot pass by changing an object the queue still holds.
import {
  QueueError,
  type QueueSettlement,
  type QueueStorage,
  type QueuedCommand,
} from './queue-storage.ts';

export type MemoryQueueStorage = QueueStorage & {
  /** Every held command of every game, oldest first: for tests to look at. */
  readonly all: () => readonly QueuedCommand[];
};

export function createMemoryQueueStorage(): MemoryQueueStorage {
  let held: QueuedCommand[] = [];

  return {
    async add(gameId, { protocolVersion, command, sessionId }) {
      const known = held.find((entry) => entry.command.commandId === command.commandId);
      if (known !== undefined) {
        if (known.gameId !== gameId) throw new QueueError('command-id-in-other-game');
        return 'held';
      }
      const madeUnder = sessionId === undefined ? {} : { sessionId };
      held.push(
        structuredClone({ gameId, protocolVersion, command, ...madeUnder, state: 'waiting' }),
      );
      return 'added';
    },
    async list(gameId) {
      return structuredClone(held.filter((entry) => entry.gameId === gameId));
    },
    async settle(gameId, { remove = [], refuse = [] }: QueueSettlement) {
      const dropped = new Set(remove);
      const refusals = new Map(refuse.map((r) => [r.commandId, r.refusal]));
      held = held.flatMap((entry): QueuedCommand[] => {
        if (entry.gameId !== gameId) return [entry];
        if (dropped.has(entry.command.commandId)) return [];
        const refusal = refusals.get(entry.command.commandId);
        if (refusal === undefined) return [entry];
        const { state: _state, ...kept } = entry;
        return [structuredClone({ ...kept, state: 'refused', refusal })];
      });
    },
    all: () => structuredClone(held),
  };
}
