// Signing out with a game open (step 2.127): the session is released first, the person
// is asked when plays are waiting, and the game is kept on the device while they wait.
import { afterEach, describe, expect, it } from 'vitest';
import {
  beforeSignOut,
  holdSignOut,
  trackerSignOutHold,
  waitingOnDevice,
  type TrackerSignOutHold,
} from './tracker-sign-out.ts';

describe('waitingOnDevice (step 2.38)', () => {
  const kept = (...states: ('waiting' | 'not-saved')[]) =>
    Promise.resolve(states.map((state) => ({ state })));

  it("counts the plays the device's queue keeps before the game has loaded them", async () => {
    expect(await waitingOnDevice(0, () => kept('waiting', 'not-saved', 'waiting'))).toBe(2);
  });

  it("keeps the controller's count when it is more, or the queue cannot be read", async () => {
    expect(await waitingOnDevice(3, () => kept('waiting'))).toBe(3);
    expect(await waitingOnDevice(1, () => Promise.reject(new Error('no storage')))).toBe(1);
  });

  it('asks before signing out when the plays are counted only from the queue', async () => {
    const asked: number[] = [];
    const hold: TrackerSignOutHold = {
      waitingPlays: () => waitingOnDevice(0, () => kept('waiting')),
      leave: async () => {},
    };
    expect(await beforeSignOut(hold, (n) => (asked.push(n), true))).toEqual({
      go: true,
      clearKeptGames: false,
    });
    expect(asked).toEqual([1]);
  });
});

function openGame(waiting: number) {
  const done: string[] = [];
  const hold: TrackerSignOutHold = {
    waitingPlays: () => waiting,
    leave: async () => {
      done.push('released');
    },
  };
  return { hold, done };
}

let letGo = () => {};
afterEach(() => letGo());

describe('beforeSignOut', () => {
  it('with no game open, signs out and clears the kept games, asking nothing', async () => {
    const asked: number[] = [];
    expect(await beforeSignOut(null, (n) => (asked.push(n), true))).toEqual({
      go: true,
      clearKeptGames: true,
    });
    expect(asked).toEqual([]);
  });

  it('with a game open and nothing waiting, releases the session first and clears', async () => {
    const { hold, done } = openGame(0);
    const asked: number[] = [];
    expect(await beforeSignOut(hold, (n) => (asked.push(n), true))).toEqual({
      go: true,
      clearKeptGames: true,
    });
    expect([asked, done]).toEqual([[], ['released']]);
  });

  it('with plays waiting, asks with their number; yes releases and keeps the game', async () => {
    const { hold, done } = openGame(3);
    const asked: number[] = [];
    expect(await beforeSignOut(hold, (n) => (asked.push(n), true))).toEqual({
      go: true,
      clearKeptGames: false,
    });
    expect([asked, done]).toEqual([[3], ['released']]);
  });

  it('with plays waiting, no stops the sign-out and leaves the game open', async () => {
    const { hold, done } = openGame(2);
    expect(await beforeSignOut(hold, () => false)).toEqual({ go: false, clearKeptGames: false });
    expect(done).toEqual([]);
  });

  it('signs out even when the release fails (the session then runs out)', async () => {
    const hold: TrackerSignOutHold = {
      waitingPlays: () => 0,
      leave: () => Promise.reject(new Error('no answer')),
    };
    expect((await beforeSignOut(hold, () => true)).go).toBe(true);
  });
});

describe('holdSignOut', () => {
  it('holds the open game until the page lets go of it, and only its own', () => {
    const first = openGame(0).hold;
    const second = openGame(0).hold;
    const releaseFirst = holdSignOut(first);
    letGo = holdSignOut(second);
    releaseFirst();
    expect(trackerSignOutHold()).toBe(second);
    letGo();
    expect(trackerSignOutHold()).toBeNull();
  });
});
