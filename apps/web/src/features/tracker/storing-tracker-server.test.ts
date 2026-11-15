import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { createMemoryOpenedGameStorage } from './memory-opened-game-storage.ts';
import { madeUpRosters } from './opened-game-storage-contract.test-helper.ts';
import type { OpenedGameStorage } from './opened-game-storage.ts';
import { QueueError } from './queue-storage.ts';
import { createStoringTrackerServer } from './storing-tracker-server.ts';
import type { ServerOutcome, ServerState, TrackerServer } from './tracker-server.ts';

const game = '00000000-0000-4000-8000-0000000000a1';
const owner = {
  gameId: game,
  leagueId: '00000000-0000-4000-8000-0000000000c1',
  accountId: '00000000-0000-4000-8000-0000000000f1',
};
const state: ServerState = { sequence: 2, state: basketball.newGame(basketball.QUARTERS, 0) };

function serverAnswering(outcome: ServerOutcome<ServerState>): TrackerServer & { asked: number } {
  const server = {
    asked: 0,
    session: async () => ({ kind: 'unanswered' }) as const,
    loadState: async () => {
      server.asked += 1;
      return outcome;
    },
  };
  return server;
}

const signal = new AbortController().signal;

describe('the state stored on the device as the server gives it (T-115)', () => {
  it('stores each state loaded and hands it on unchanged', async () => {
    const storage = createMemoryOpenedGameStorage();
    await storage.saveRosters(owner, madeUpRosters, 1);
    const server = serverAnswering({ kind: 'answer', value: state });
    const storing = createStoringTrackerServer({ gameId: game, server, storage });
    expect(await storing.loadState(signal)).toEqual({ kind: 'answer', value: state });
    expect(server.asked).toBe(1);
    expect((await storage.find(game))?.state).toEqual(state);
  });

  it('stores nothing when the server gave no state', async () => {
    const storage = createMemoryOpenedGameStorage();
    await storage.saveRosters(owner, madeUpRosters, 1);
    for (const outcome of [
      { kind: 'unanswered' } as const,
      { kind: 'rejected', httpStatus: 403 } as const,
    ]) {
      const storing = createStoringTrackerServer({
        gameId: game,
        server: serverAnswering(outcome),
        storage,
      });
      expect(await storing.loadState(signal)).toEqual(outcome);
    }
    expect((await storage.find(game))?.state).toBeNull();
  });

  it('still gives the state when the device cannot store it, and says so', async () => {
    const failing: OpenedGameStorage = {
      ...createMemoryOpenedGameStorage(),
      saveState: async () => {
        throw new QueueError('storage-write-failed');
      },
    };
    const failed: string[] = [];
    const storing = createStoringTrackerServer({
      gameId: game,
      server: serverAnswering({ kind: 'answer', value: state }),
      storage: failing,
      onStoreFailed: (code) => failed.push(code),
    });
    expect(await storing.loadState(signal)).toEqual({ kind: 'answer', value: state });
    expect(failed).toEqual(['storage-write-failed']);
  });

  it('passes the session through as it is', async () => {
    const storage = createMemoryOpenedGameStorage();
    const storing = createStoringTrackerServer({
      gameId: game,
      server: serverAnswering({ kind: 'unanswered' }),
      storage,
    });
    expect(await storing.session({ type: 'open', deviceId: 'd' }, signal)).toEqual({
      kind: 'unanswered',
    });
  });
});
