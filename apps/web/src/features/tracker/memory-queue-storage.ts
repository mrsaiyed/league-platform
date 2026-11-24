// The queue's storage kept in memory, for tests and for a page that has no database
// storage. It copies what goes in and what comes out, as the browser's storage does,
// so a test cannot pass by changing an object the queue still holds.
import {
  madeBy,
  QueueError,
  type DeviceQueueStorage,
  type QueueSettlement,
  type QueuedCommand,
} from './queue-storage.ts';

export type MemoryQueueStorage = DeviceQueueStorage & {
  /** Every held command of every game, oldest first: for tests to look at. */
  readonly all: () => readonly QueuedCommand[];
};

export function createMemoryQueueStorage(): MemoryQueueStorage {
  let held: QueuedCommand[] = [];

  return {
    async add(gameId, { protocolVersion, command, sessionId, moment, leagueId, accountId }) {
      const known = held.find((entry) => entry.command.commandId === command.commandId);
      if (known !== undefined) {
        if (known.gameId !== gameId) throw new QueueError('command-id-in-other-game');
        return 'held';
      }
      const madeUnder = sessionId === undefined ? {} : { sessionId };
      const madeAt = moment === undefined ? {} : { moment };
      const madeIn = leagueId === undefined ? {} : { leagueId };
      const madeByOf = accountId === undefined ? {} : { accountId };
      held.push(
        structuredClone({
          gameId,
          protocolVersion,
          command,
          ...madeUnder,
          ...madeAt,
          ...madeIn,
          ...madeByOf,
          state: 'waiting',
        }),
      );
      return 'added';
    },
    async list(gameId) {
      return structuredClone(held.filter((entry) => entry.gameId === gameId));
    },
    async settle(gameId, { remove = [], refuse = [], notSaved = [], notSavedSince, carryOn }: QueueSettlement) {
      const carried = new Set(carryOn?.commandIds ?? []);
      const dropped = new Set(remove);
      const refusals = new Map(refuse.map((r) => [r.commandId, r.refusal]));
      const setAside = new Set(notSaved);
      held = held.flatMap((entry): QueuedCommand[] => {
        if (entry.gameId !== gameId) return [entry];
        const id = entry.command.commandId;
        if (dropped.has(id)) return [];
        const { gameId: game, protocolVersion, command } = entry;
        const madeUnder = entry.sessionId === undefined ? {} : { sessionId: entry.sessionId };
        const madeAt = entry.moment === undefined ? {} : { moment: entry.moment };
        const madeIn = entry.leagueId === undefined ? {} : { leagueId: entry.leagueId };
        const maker = entry.accountId === undefined ? {} : { accountId: entry.accountId };
        const kept = {
          gameId: game,
          protocolVersion,
          command,
          ...madeUnder,
          ...madeAt,
          ...madeIn,
          ...maker,
        };
        const refusal = refusals.get(id);
        if (refusal !== undefined) return [structuredClone({ ...kept, state: 'refused', refusal })];
        if (setAside.has(id)) {
          const since = notSavedSince === undefined ? {} : { notSavedSince };
          return [structuredClone({ ...kept, state: 'not-saved', ...since })];
        }
        if (carryOn !== undefined && carried.has(id) && entry.state === 'waiting') {
          return [structuredClone({ ...entry, sessionId: carryOn.sessionId })];
        }
        return [entry];
      });
    },
    async listAll() {
      return structuredClone(held);
    },
    async forget(gameId, accountId) {
      held = held.filter(
        (entry) =>
          entry.gameId !== gameId || (accountId !== undefined && !madeBy(entry, accountId)),
      );
    },
    all: () => structuredClone(held),
  };
}
