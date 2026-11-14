// What every OpenedGameStorage must do, written once so each implementation is held to
// the same promises. The in-memory storage runs it in memory-opened-game-storage.test.ts,
// the IndexedDB one in indexeddb-opened-game-storage.test.ts on a stand-in database.
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { formatOf, type DeviceRosters, type OpenedGameStorage } from './opened-game-storage.ts';

const game = '00000000-0000-4000-8000-0000000000a1';
const other = '00000000-0000-4000-8000-0000000000a2';
const league = '00000000-0000-4000-8000-0000000000c1';

export const madeUpRosters: DeviceRosters = {
  home: {
    teamId: '00000000-0000-4000-8000-0000000000d1',
    name: 'Made-up Home',
    players: [
      {
        personId: '00000000-0000-4000-8000-0000000000e1',
        firstName: 'Ada',
        lastName: 'Example',
        jerseyNumber: '4',
        left: false,
      },
    ],
  },
  away: {
    teamId: '00000000-0000-4000-8000-0000000000d2',
    name: 'Made-up Away',
    players: [],
  },
};

const state = { sequence: 3, state: basketball.newGame(basketball.HALVES, 0) };

export function openedGameStorageContract(
  name: string,
  make: () => Promise<OpenedGameStorage>,
): void {
  describe(`${name} (opened game storage contract)`, () => {
    it('keeps nothing of a game never opened on the device', async () => {
      const storage = await make();
      expect(await storage.find(game)).toBeUndefined();
    });

    it('keeps the rosters, then the state and the format, each without losing the others', async () => {
      const storage = await make();
      await storage.saveRosters(game, league, madeUpRosters, 10);
      expect(await storage.find(game)).toEqual({
        gameId: game,
        leagueId: league,
        rosters: madeUpRosters,
        rostersSavedAt: 10,
        state: null,
        confirmedFormat: null,
      });
      await storage.saveState(game, state);
      const format = formatOf(basketball.HALVES);
      await storage.confirmFormat(game, format);
      // Opening again stores the rosters anew and keeps the rest.
      await storage.saveRosters(game, league, madeUpRosters, 20);
      expect(await storage.find(game)).toEqual({
        gameId: game,
        leagueId: league,
        rosters: madeUpRosters,
        rostersSavedAt: 20,
        state,
        confirmedFormat: format,
      });
      expect(await storage.find(other)).toBeUndefined();
    });

    it('stores no state or format for a game whose rosters it does not hold', async () => {
      const storage = await make();
      await storage.saveState(other, state);
      await storage.confirmFormat(other, formatOf(basketball.QUARTERS));
      expect(await storage.find(other)).toBeUndefined();
    });

    it('gives what it holds as a copy', async () => {
      const storage = await make();
      await storage.saveRosters(game, league, madeUpRosters, 10);
      const first = await storage.find(game);
      if (first === undefined) throw new Error('not stored');
      (first.rosters.home as { name: string }).name = 'Changed';
      expect((await storage.find(game))?.rosters.home.name).toBe('Made-up Home');
    });

    it('makes the device id once and keeps it', async () => {
      const storage = await make();
      let made = 0;
      const make1 = () => `device-${(made += 1)}`;
      expect(await storage.deviceId(make1)).toBe('device-1');
      expect(await storage.deviceId(make1)).toBe('device-1');
      expect(made).toBe(1);
    });
  });
}
