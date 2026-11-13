// What every QueueStorage must do, written once so each implementation is held to the
// same promises. The in-memory storage runs it in memory-queue-storage.test.ts, the
// IndexedDB one in indexeddb-queue-storage.test.ts on a stand-in database (record 024).
import type { TrackerCommand } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import type { QueueStorage } from './queue-storage.ts';

const game = '00000000-0000-4000-8000-0000000000a1';
const other = '00000000-0000-4000-8000-0000000000a2';
const player = '00000000-0000-4000-8000-0000000000b1';

export const commandId = (n: number): string =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export const tap = (n: number): TrackerCommand => ({
  commandId: commandId(n),
  at: 1_000 + n,
  input: { type: 'score', side: 'home', playerId: player, points: 2 },
});

const ids = (list: readonly { command: TrackerCommand }[]) =>
  list.map((entry) => entry.command.commandId);

export function queueStorageContract(name: string, make: () => Promise<QueueStorage>): void {
  describe(`${name} (queue storage contract)`, () => {
    it('keeps taps in the order they were added, per game', async () => {
      const storage = await make();
      await storage.add(game, { protocolVersion: 1, command: tap(3) });
      await storage.add(other, { protocolVersion: 1, command: tap(9) });
      await storage.add(game, { protocolVersion: 1, command: tap(1) });
      await storage.add(game, { protocolVersion: 2, command: tap(2) });
      const list = await storage.list(game);
      expect(ids(list)).toEqual([commandId(3), commandId(1), commandId(2)]);
      expect(list.map((e) => [e.gameId, e.protocolVersion, e.state])).toEqual([
        [game, 1, 'waiting'],
        [game, 1, 'waiting'],
        [game, 2, 'waiting'],
      ]);
      expect(list[0]?.command).toEqual(tap(3));
      expect(ids(await storage.list(other))).toEqual([commandId(9)]);
    });

    it('ignores a command ID it already holds for the game, and says so', async () => {
      const storage = await make();
      expect(await storage.add(game, { protocolVersion: 1, command: tap(1) })).toBe('added');
      expect(await storage.add(game, { protocolVersion: 1, command: { ...tap(1), at: 99 } })).toBe(
        'held',
      );
      const list = await storage.list(game);
      expect(list).toHaveLength(1);
      expect(list[0]?.command.at).toBe(tap(1).at);
    });

    it('rejects a command ID it holds for another game, changing nothing', async () => {
      const storage = await make();
      await storage.add(other, { protocolVersion: 1, command: tap(1) });
      await expect(storage.add(game, { protocolVersion: 1, command: tap(1) })).rejects.toThrow(
        'command-id-in-other-game',
      );
      expect(await storage.list(game)).toEqual([]);
      expect(ids(await storage.list(other))).toEqual([commandId(1)]);
      expect(await storage.add(game, { protocolVersion: 1, command: tap(2) })).toBe('added');
    });

    it('removes and refuses in one settlement, keeping the order of the rest', async () => {
      const storage = await make();
      for (const n of [1, 2, 3, 4])
        await storage.add(game, { protocolVersion: 1, command: tap(n) });
      await storage.add(other, { protocolVersion: 1, command: tap(2_000) });
      const refusal = { code: 'rule', message: 'Player is not on the court.' } as const;
      await storage.settle(game, {
        remove: [commandId(1), commandId(3), commandId(77)],
        refuse: [{ commandId: commandId(2), refusal }],
      });
      const list = await storage.list(game);
      expect(ids(list)).toEqual([commandId(2), commandId(4)]);
      expect(list[0]).toMatchObject({ state: 'refused', refusal });
      expect(list[1]).toMatchObject({ state: 'waiting' });
      expect(ids(await storage.list(other))).toEqual([commandId(2_000)]);
    });

    it('settles only the game it is told', async () => {
      const storage = await make();
      await storage.add(other, { protocolVersion: 1, command: tap(5) });
      await storage.settle(game, { remove: [commandId(5)] });
      expect(ids(await storage.list(other))).toEqual([commandId(5)]);
    });

    it('hands out copies, not what it holds', async () => {
      const storage = await make();
      await storage.add(game, { protocolVersion: 1, command: tap(1) });
      const [first] = await storage.list(game);
      if (first === undefined) throw new Error('expected one command');
      (first.command as { at: number }).at = 5;
      expect((await storage.list(game))[0]?.command.at).toBe(tap(1).at);
    });
  });
}
