// What every OpenedGameStorage must do, written once so each implementation is held to
// the same promises. The in-memory storage runs it in memory-opened-game-storage.test.ts,
// the IndexedDB one in indexeddb-opened-game-storage.test.ts on a stand-in database.
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { formatOf, type DeviceRosters, type OpenedGameStorage } from './opened-game-storage.ts';

const game = '00000000-0000-4000-8000-0000000000a1';
const other = '00000000-0000-4000-8000-0000000000a2';
const league = '00000000-0000-4000-8000-0000000000c1';
const otherLeague = '00000000-0000-4000-8000-0000000000c2';
const account = '00000000-0000-4000-8000-0000000000f1';
const otherAccount = '00000000-0000-4000-8000-0000000000f2';
const owner = { gameId: game, leagueId: league, accountId: account };
const day = 24 * 60 * 60 * 1000;

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
const finalState = {
  sequence: 9,
  state: { ...basketball.newGame(basketball.HALVES, 0), status: 'final' as const },
};

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
      await storage.saveRosters(owner, madeUpRosters, 10);
      expect(await storage.find(game)).toEqual({
        gameId: game,
        leagueId: league,
        accountId: account,
        rosters: madeUpRosters,
        rostersSavedAt: 10,
        state: null,
        confirmedFormat: null,
      });
      await storage.saveState(game, state);
      const format = formatOf(basketball.HALVES);
      await storage.confirmFormat(game, format);
      // Opening again stores the rosters anew and keeps the rest.
      await storage.saveRosters(owner, madeUpRosters, 20);
      expect(await storage.find(game)).toEqual({
        gameId: game,
        leagueId: league,
        accountId: account,
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
      await storage.saveRosters(owner, madeUpRosters, 10);
      const first = await storage.find(game);
      if (first === undefined) throw new Error('not stored');
      (first.rosters.home as { name: string }).name = 'Changed';
      expect((await storage.find(game))?.rosters.home.name).toBe('Made-up Home');
    });

    it('on opening, lets go of every game but the signed-in account’s recent ones in this league', async () => {
      const storage = await make();
      const id = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
      const now = 100 * day;
      const keepFrom = now - 14 * day;
      const kept = { ...owner, gameId: id(1) };
      await storage.saveRosters(owner, madeUpRosters, now);
      await storage.saveRosters(kept, madeUpRosters, keepFrom);
      await storage.saveRosters({ ...owner, gameId: id(2) }, madeUpRosters, keepFrom - 1);
      await storage.saveRosters({ ...owner, gameId: id(3) }, madeUpRosters, now);
      await storage.saveState(id(3), finalState);
      await storage.saveRosters(
        { ...owner, gameId: id(4), accountId: otherAccount },
        madeUpRosters,
        now,
      );
      await storage.saveRosters(
        { ...owner, gameId: id(5), leagueId: otherLeague },
        madeUpRosters,
        now,
      );
      await storage.saveRosters({ ...owner, gameId: other }, madeUpRosters, now);
      await storage.saveState(other, state);
      const device = await storage.deviceId(() => 'device-a');

      await storage.forgetOthers(owner, keepFrom);

      expect((await storage.find(game))?.rosters).toEqual(madeUpRosters);
      expect((await storage.find(id(1)))?.rostersSavedAt).toBe(keepFrom);
      expect((await storage.find(other))?.state).toEqual(state);
      // Too old, final, another account's, another league's.
      for (const gone of [id(2), id(3), id(4), id(5)]) {
        expect(await storage.find(gone)).toBeUndefined();
      }
      expect(await storage.deviceId(() => 'device-b')).toBe(device);
    });

    it('keeps the game being opened even if it is old or final, but never another account’s', async () => {
      const storage = await make();
      await storage.saveRosters(owner, madeUpRosters, 0);
      await storage.saveState(game, finalState);
      await storage.forgetOthers(owner, 10 * day);
      expect((await storage.find(game))?.state).toEqual(finalState);
      await storage.forgetOthers({ ...owner, accountId: otherAccount }, 0);
      expect(await storage.find(game)).toBeUndefined();
    });

    it('on signing out, clears every game and keeps the device id', async () => {
      const storage = await make();
      await storage.saveRosters(owner, madeUpRosters, 10);
      await storage.saveRosters(
        { ...owner, gameId: other, accountId: otherAccount },
        madeUpRosters,
        10,
      );
      const device = await storage.deviceId(() => 'device-a');
      await storage.forgetAll();
      expect(await storage.find(game)).toBeUndefined();
      expect(await storage.find(other)).toBeUndefined();
      expect(await storage.deviceId(() => 'device-b')).toBe(device);
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
