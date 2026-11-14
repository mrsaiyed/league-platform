import type { CommandReply } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { createMemoryQueueStorage } from './memory-queue-storage.ts';
import { commandId, tap } from './queue-storage-contract.test-helper.ts';
import type { QueueStorage } from './queue-storage.ts';
import { createFakeServer, createManualClock } from './tracker-queue.test-helper.ts';
import { createTrackerQueue, type TrackerQueueOptions } from './tracker-queue.ts';

const game = '00000000-0000-4000-8000-0000000000a1';
const session = '00000000-0000-4000-8000-0000000000c1';
const minute = 60_000;

function setup(
  options: Partial<TrackerQueueOptions> = {},
  shared?: { storage: QueueStorage; clock: ReturnType<typeof createManualClock> },
) {
  const clock = shared?.clock ?? createManualClock();
  const storage = shared?.storage ?? createMemoryQueueStorage();
  const server = createFakeServer(clock);
  const open = (more: Partial<TrackerQueueOptions> = {}) =>
    createTrackerQueue({
      gameId: game,
      storage,
      transport: server.transport,
      clock,
      sessionId: () => session,
      random: () => 1,
      ...options,
      ...more,
    });
  return { clock, storage, server, queue: open(), open };
}

const held = async (storage: QueueStorage) =>
  (await storage.list(game)).map((entry) => [entry.command.commandId, entry.state]);

describe('tracker queue: storing taps (T-114)', () => {
  it('has stored a tap by the time enqueue resolves, with no network at all', async () => {
    const { queue, server, storage } = setup();
    server.mode = 'down';
    await queue.start();
    await queue.enqueue(tap(1));
    expect(await held(storage)).toEqual([[commandId(1), 'waiting']]);
    expect(queue.status().waiting).toBe(1);
  });

  it('rejects a tap it could not store, so the screen does not confirm it', async () => {
    const storage = createMemoryQueueStorage();
    const broken: QueueStorage = {
      ...storage,
      add: () => Promise.reject(new Error('disk full')),
    };
    const { queue } = setup({ storage: broken });
    await queue.start();
    await expect(queue.enqueue(tap(1))).rejects.toThrow('disk full');
    expect(queue.status().waiting).toBe(0);
  });

  it('counts a stored tap as waiting even when the read after it fails', async () => {
    const storage = createMemoryQueueStorage();
    let failList = false;
    const flaky: QueueStorage = {
      ...storage,
      list: (g) => (failList ? Promise.reject(new Error('busy')) : storage.list(g)),
    };
    let current: string | null = null;
    const { queue } = setup({ storage: flaky, sessionId: () => current });
    await queue.start();
    failList = true;
    await queue.enqueue(tap(1));
    expect(queue.status().waiting).toBe(1);
    // The same tap again is already held: the count does not grow.
    await queue.enqueue(tap(1));
    expect(queue.status().waiting).toBe(1);
    expect(await held(storage)).toEqual([[commandId(1), 'waiting']]);
  });

  it('rejects a command ID already used in another game (a bug), not as a storage failure', async () => {
    const { queue, storage } = setup();
    await storage.add('00000000-0000-4000-8000-0000000000a9', {
      protocolVersion: 1,
      command: tap(1),
    });
    await queue.start();
    await expect(queue.enqueue(tap(1))).rejects.toThrow('command-id-in-other-game');
    expect(queue.status()).toMatchObject({ waiting: 0, storageFailure: null });
  });

  it('a storage failure is shown as one, never as offline, and clears once storage works', async () => {
    const storage = createMemoryQueueStorage();
    let broken = true;
    const flaky: QueueStorage = {
      add: (g, e) => (broken ? Promise.reject(new Error('disk full')) : storage.add(g, e)),
      list: (g) => (broken ? Promise.reject(new Error('disk full')) : storage.list(g)),
      settle: (g, s) => storage.settle(g, s),
    };
    const { queue, clock } = setup({ storage: flaky });
    await expect(queue.start()).rejects.toThrow('disk full');
    await expect(queue.enqueue(tap(1))).rejects.toThrow('disk full');
    expect(queue.status()).toMatchObject({
      storageFailure: { code: 'storage-write-failed', since: clock.now() },
      unansweredSince: null,
      waiting: 0,
    });
    broken = false;
    await queue.start();
    await queue.enqueue(tap(1));
    await queue.idle();
    expect(queue.status()).toMatchObject({
      storageFailure: null,
      unansweredSince: null,
      waiting: 0,
    });
  });

  it('sends taps made before it started once it starts', async () => {
    const { queue, server } = setup();
    await queue.enqueue(tap(1));
    expect(server.received).toHaveLength(0);
    await queue.start();
    await queue.idle();
    expect(server.saved).toEqual([commandId(1)]);
  });
});

describe('tracker queue: sending', () => {
  it('sends in order, a batch at a time, one send at once', async () => {
    const { queue, server, storage } = setup({ batchSize: 2 });
    for (const n of [1, 2, 3, 4, 5]) await queue.enqueue(tap(n));
    const seen: number[] = [];
    queue.subscribe((status) => seen.push(status.waiting));
    await queue.start();
    await queue.idle();
    expect(server.received.map((batch) => batch.commands.length)).toEqual([2, 2, 1]);
    expect(server.saved).toEqual([1, 2, 3, 4, 5].map(commandId));
    expect(server.received.every((batch) => batch.sessionId === session)).toBe(true);
    expect(server.mostAtOnce()).toBe(1);
    expect(await held(storage)).toEqual([]);
    expect(queue.status()).toMatchObject({ waiting: 0, sending: false, sequence: 5 });
    expect(seen).toContain(0);
  });

  it('sends nothing while the device holds no scoring session, then sends on wake', async () => {
    let current: string | null = null;
    const { queue, server } = setup({ sessionId: () => current });
    await queue.start();
    await queue.enqueue(tap(1));
    await queue.idle();
    expect(server.received).toHaveLength(0);
    current = session;
    queue.wake();
    await queue.idle();
    expect(server.saved).toEqual([commandId(1)]);
  });

  it('never sends a tap under a session other than the one it was made under', async () => {
    let current: string | null = session;
    const { queue, server, storage } = setup({ sessionId: () => current });
    server.mode = 'down';
    await queue.start();
    await queue.enqueue(tap(1));
    current = '00000000-0000-4000-8000-0000000000c2';
    await queue.enqueue(tap(2));
    server.mode = 'up';
    queue.wake();
    await queue.idle();
    expect(server.saved).toEqual([commandId(2)]);
    expect(await held(storage)).toEqual([[commandId(1), 'waiting']]);
    expect(server.received.at(-1)?.sessionId).toBe(current);
  });

  it('sends taps stored before a release under the version they were made with (T-127)', async () => {
    const { queue, server, storage } = setup({ protocolVersion: 2 });
    await storage.add(game, { protocolVersion: 1, command: tap(1) });
    await storage.add(game, { protocolVersion: 1, command: tap(2) });
    await queue.enqueue(tap(3));
    await queue.start();
    await queue.idle();
    expect(server.received.map((b) => [b.protocolVersion, b.commands.length])).toEqual([
      [1, 2],
      [2, 1],
    ]);
  });

  it('sends at once on wake instead of waiting out the pause', async () => {
    const { queue, server, clock } = setup();
    server.mode = 'down';
    await queue.start();
    await queue.enqueue(tap(1));
    await clock.advance(10_000);
    const tries = server.received.length;
    server.mode = 'up';
    queue.wake();
    await queue.idle();
    expect(server.received).toHaveLength(tries + 1);
    expect(queue.status()).toMatchObject({ waiting: 0, unansweredSince: null });
  });

  it('keeps everything when the storage fails while settling, and tries again', async () => {
    const storage = createMemoryQueueStorage();
    let failSettle = true;
    const flaky: QueueStorage = {
      ...storage,
      settle: (g, s) => (failSettle ? Promise.reject(new Error('busy')) : storage.settle(g, s)),
    };
    const { queue, server, clock } = setup({ storage: flaky });
    await queue.enqueue(tap(1));
    await queue.start();
    await queue.idle();
    expect(await held(storage)).toEqual([[commandId(1), 'waiting']]);
    failSettle = false;
    await clock.advance(1_000);
    expect(await held(storage)).toEqual([]);
    expect(server.saved).toEqual([commandId(1)]);
  });

  it('stops sending when stopped, keeping what it holds', async () => {
    const { queue, server, clock, storage } = setup();
    server.mode = 'down';
    await queue.start();
    await queue.enqueue(tap(1));
    queue.stop();
    expect(clock.pending()).toBe(0);
    await clock.advance(10 * minute);
    expect(server.received).toHaveLength(1);
    expect(await held(storage)).toEqual([[commandId(1), 'waiting']]);
    await expect(queue.enqueue(tap(2))).rejects.toThrow();
  });
});

describe('tracker queue: the done test, each case left in a known state', () => {
  it('the tab closed mid-send after the server saved: the next tab sends again, nothing counts twice', async () => {
    const first = setup();
    first.server.mode = 'save-and-vanish';
    await first.queue.start();
    for (const n of [1, 2, 3]) await first.queue.enqueue(tap(n));
    // Tap 1 reached the server and was saved; its answer never came back. The tab closes.
    expect(first.server.saved).toEqual([commandId(1)]);
    first.queue.stop();
    expect(await held(first.storage)).toEqual([
      [commandId(1), 'waiting'],
      [commandId(2), 'waiting'],
      [commandId(3), 'waiting'],
    ]);

    // The tracker opens again on the same device storage.
    first.server.mode = 'up';
    const second = first.open();
    await second.start();
    await second.idle();
    expect(first.server.received.at(-1)?.commands.map((c) => c.commandId)).toEqual(
      [1, 2, 3].map(commandId),
    );
    expect(first.server.saved).toEqual([1, 2, 3].map(commandId));
    expect(await held(first.storage)).toEqual([]);
    expect(second.status()).toMatchObject({ waiting: 0, refused: [], halted: null });
  });

  it('the tab closed before anything was sent: the next tab sends it all', async () => {
    let current: string | null = null;
    const first = setup({ sessionId: () => current });
    await first.queue.start();
    await first.queue.enqueue(tap(1));
    await first.queue.enqueue(tap(2));
    first.queue.stop();
    current = session;
    const second = first.open();
    await second.start();
    await second.idle();
    expect(first.server.saved).toEqual([1, 2].map(commandId));
    expect(second.status().waiting).toBe(0);
  });

  it('the server down for an hour: every tap kept in order, about two tries a minute, then all sent', async () => {
    const { queue, server, clock, storage } = setup();
    server.mode = 'down';
    const downAt = clock.now();
    await queue.start();
    for (const n of [1, 2, 3, 4, 5]) await queue.enqueue(tap(n));
    for (let m = 1; m <= 60; m += 1) {
      await clock.advance(minute);
      if (m === 30) for (const n of [6, 7]) await queue.enqueue(tap(n));
      expect(queue.status().waiting).toBe(m < 30 ? 5 : 7);
      expect(clock.pending()).toBe(1);
    }
    expect(queue.status()).toMatchObject({ unansweredSince: downAt, halted: null });
    expect(server.received.length).toBeGreaterThanOrEqual(100);
    expect(server.received.length).toBeLessThanOrEqual(130);
    expect(server.mostAtOnce()).toBe(1);
    expect(await held(storage)).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map((n) => [commandId(n), 'waiting']),
    );

    server.mode = 'up';
    await clock.advance(30_000);
    expect(server.saved).toEqual([1, 2, 3, 4, 5, 6, 7].map(commandId));
    expect(queue.status()).toMatchObject({ waiting: 0, unansweredSince: null, sequence: 7 });
    expect(clock.pending()).toBe(0);
  });

  it('a duplicate reply: a slow answer is given up, sent again, and the server says duplicate', async () => {
    const { queue, server, clock, storage } = setup();
    server.mode = 'slow';
    server.slowMs = 20_000;
    await queue.enqueue(tap(1));
    await queue.enqueue(tap(2));
    await queue.start();
    await clock.advance(0);
    expect(server.received).toHaveLength(1); // saved; the answer is on its way, slowly
    server.mode = 'up';
    await clock.advance(15_000); // the first send is given up
    expect(queue.status()).toMatchObject({ waiting: 2 });
    await clock.advance(1_000); // and sent again
    expect(server.received).toHaveLength(2);
    expect(server.saved).toEqual([1, 2].map(commandId));
    expect(await held(storage)).toEqual([]);
    expect(queue.status()).toMatchObject({ waiting: 0, refused: [], unansweredSince: null });
  });

  it('a duplicate reply: answers repeated, or for commands not sent, change only what was sent', async () => {
    const { queue, server, clock, storage } = setup();
    const odd: CommandReply = {
      protocolVersion: 1,
      sequence: 4,
      results: [
        { commandId: commandId(1), status: 'duplicate' },
        { commandId: commandId(1), status: 'accepted' },
        { commandId: commandId(99), status: 'accepted' },
      ],
    };
    server.answerWith = { kind: 'reply', reply: odd };
    await queue.enqueue(tap(1));
    await queue.enqueue(tap(2));
    await queue.start();
    await queue.idle();
    // Tap 1 is answered for; tap 2 was left out, so it went again, and an answer that
    // says nothing about it counts as no answer.
    expect(await held(storage)).toEqual([[commandId(2), 'waiting']]);
    expect(server.received.map((b) => b.commands.length)).toEqual([2, 1]);
    expect(queue.status()).toMatchObject({ waiting: 1, sequence: 4 });
    expect(queue.status().unansweredSince).not.toBeNull();

    server.answerWith = null;
    await clock.advance(1_000);
    expect(await held(storage)).toEqual([]);
    expect(queue.status()).toMatchObject({ waiting: 0, unansweredSince: null });
  });

  it('a refused command (rule): kept as refused, never sent again, the rest still sent', async () => {
    const { queue, server, storage } = setup();
    server.refuse.set(commandId(2), 'rule');
    for (const n of [1, 2, 3]) await queue.enqueue(tap(n));
    await queue.start();
    await queue.idle();
    expect(server.saved).toEqual([1, 3].map(commandId));
    expect(await held(storage)).toEqual([[commandId(2), 'refused']]);
    expect(queue.status()).toMatchObject({
      waiting: 0,
      halted: null,
      refused: [{ command: tap(2), refusal: { code: 'rule', message: 'refused: rule' } }],
    });

    queue.wake();
    await queue.enqueue(tap(4));
    await queue.idle();
    expect(server.received.map((b) => b.commands.map((c) => c.commandId))).toEqual([
      [1, 2, 3].map(commandId),
      [commandId(4)],
    ]);

    // The tracker has told the scorekeeper; the refused tap is dropped.
    await queue.forget([commandId(2)]);
    expect(await held(storage)).toEqual([]);
    expect(queue.status().refused).toEqual([]);
  });

  it('a refused command (device lost the game): the tap stays waiting, the queue halts, resume sends all in order', async () => {
    const { queue, server, storage } = setup({ batchSize: 1 });
    server.refuse.set(commandId(2), 'session-not-held');
    for (const n of [1, 2, 3]) await queue.enqueue(tap(n));
    await queue.start();
    await queue.idle();
    expect(queue.status()).toMatchObject({
      waiting: 2,
      refused: [],
      halted: { kind: 'refused', code: 'session-not-held' },
    });
    await queue.enqueue(tap(4));
    await queue.idle();
    expect(server.received).toHaveLength(2);
    expect(await held(storage)).toEqual([
      [commandId(2), 'waiting'],
      [commandId(3), 'waiting'],
      [commandId(4), 'waiting'],
    ]);

    // The device takes the game back.
    server.refuse.delete(commandId(2));
    queue.resume();
    await queue.idle();
    expect(server.saved).toEqual([1, 2, 3, 4].map(commandId));
    expect(server.received.slice(2).map((b) => b.commands[0]?.commandId)).toEqual(
      [2, 3, 4].map(commandId),
    );
    expect(queue.status()).toMatchObject({ waiting: 0, refused: [], halted: null });
  });

  it('every refusal about the request, not the tap, leaves the taps waiting', async () => {
    for (const code of [
      'session-not-held',
      'game-not-live',
      'not-allowed',
      'unknown-game',
    ] as const) {
      const { queue, server, storage } = setup();
      // The server says the same for every tap of the request.
      for (const n of [1, 2]) server.refuse.set(commandId(n), code);
      for (const n of [1, 2]) await queue.enqueue(tap(n));
      await queue.start();
      await queue.idle();
      expect(queue.status().halted).toEqual({ kind: 'refused', code });
      expect(queue.status().refused).toEqual([]);
      expect(await held(storage)).toEqual([
        [commandId(1), 'waiting'],
        [commandId(2), 'waiting'],
      ]);
    }
  });

  it('forget clears a halt once nothing is left waiting behind it', async () => {
    const { queue, server, storage } = setup();
    for (const n of [1, 2]) server.refuse.set(commandId(n), 'session-not-held');
    for (const n of [1, 2]) await queue.enqueue(tap(n));
    await queue.start();
    await queue.idle();
    // Another device took over; the tracker showed both taps as not saved.
    await queue.forget([commandId(1)]);
    expect(queue.status().halted).not.toBeNull();
    await queue.forget([commandId(2)]);
    expect(queue.status()).toMatchObject({ waiting: 0, halted: null });
    expect(await held(storage)).toEqual([]);

    server.refuse.clear();
    await queue.enqueue(tap(3));
    await queue.idle();
    expect(server.saved).toEqual([commandId(3)]);
  });

  it('keeps taps set aside as not saved, never sends them, and a new queue does not either', async () => {
    const { queue, server, storage, clock, open } = setup();
    for (const n of [1, 2, 3]) server.refuse.set(commandId(n), 'session-not-held');
    for (const n of [1, 2, 3]) await queue.enqueue(tap(n));
    await queue.start();
    await queue.idle();
    await queue.setAside([commandId(1), commandId(2)]);
    expect(queue.status().halted).not.toBeNull();
    await queue.setAside([commandId(3)]);
    expect(queue.status()).toMatchObject({ waiting: 0, waitingTaps: [], halted: null });
    server.refuse.clear();
    await queue.idle();
    expect(server.saved).toEqual([]);

    // The page is reloaded: the taps are still held as not saved, and still not sent.
    queue.stop();
    const reloaded = open();
    await reloaded.start();
    await reloaded.idle();
    expect(reloaded.status()).toMatchObject({ waiting: 0, refused: [] });
    expect(await held(storage)).toEqual([1, 2, 3].map((n) => [commandId(n), 'not-saved']));
    await reloaded.forget([commandId(1)]);
    expect((await held(storage)).map(([id]) => id)).toEqual([commandId(2), commandId(3)]);
    await clock.advance(minute);
    expect(server.saved).toEqual([]);
  });

  it('says which taps are waiting, and when the server last said it had some (L1)', async () => {
    const { queue, server, clock } = setup();
    server.mode = 'down';
    await queue.start();
    for (const n of [1, 2]) await queue.enqueue(tap(n));
    expect(queue.status().waitingTaps).toEqual([tap(1), tap(2)]);
    expect(queue.status().savedAt).toBeNull();
    await clock.advance(minute);
    server.mode = 'up';
    const when = clock.now();
    queue.wake();
    await queue.idle();
    expect(queue.status()).toMatchObject({ waiting: 0, waitingTaps: [], savedAt: when });
    // A refusal is an answer, but saves nothing: the time stays.
    server.refuse.set(commandId(3), 'rule');
    await clock.advance(minute);
    await queue.enqueue(tap(3));
    await queue.idle();
    expect(queue.status().savedAt).toBe(when);
  });

  it('a halt after an outage clears the offline clock: the server did answer', async () => {
    const { queue, server, clock } = setup();
    server.mode = 'down';
    await queue.start();
    await queue.enqueue(tap(1));
    await clock.advance(5_000);
    expect(queue.status().unansweredSince).not.toBeNull();
    server.answerWith = { kind: 'rejected', httpStatus: 403 };
    queue.wake();
    await queue.idle();
    expect(queue.status()).toMatchObject({
      halted: { kind: 'rejected', httpStatus: 403 },
      unansweredSince: null,
    });
    expect(clock.pending()).toBe(0);
  });

  it('a batch the server cannot take (400, 413, 422): the bad tap is found one at a time and refused, the rest saved', async () => {
    for (const status of [400, 413, 422]) {
      const { queue, server, storage } = setup();
      server.badRequest.set(commandId(3), status);
      for (const n of [1, 2, 3, 4, 5]) await queue.enqueue(tap(n));
      await queue.start();
      await queue.idle();
      expect(server.saved).toEqual([1, 2, 4, 5].map(commandId));
      expect(await held(storage)).toEqual([[commandId(3), 'refused']]);
      expect(queue.status()).toMatchObject({
        waiting: 0,
        halted: null,
        unansweredSince: null,
        refused: [{ command: tap(3), refusal: { code: 'rule', message: `http-${status}` } }],
      });
      expect(server.received.map((b) => b.commands.length)).toEqual([5, 1, 1, 1, 1, 1]);

      // Once the bad tap is found, batches are whole again.
      server.mode = 'down';
      for (const n of [6, 7]) await queue.enqueue(tap(n));
      server.mode = 'up';
      queue.wake();
      await queue.idle();
      expect(server.received.at(-1)?.commands.length).toBe(2);
      expect(server.saved).toEqual([1, 2, 4, 5, 6, 7].map(commandId));
    }
  });

  it('a version the server no longer speaks, or a request turned away whole: halts, nothing lost', async () => {
    const { queue, server, storage } = setup();
    server.answerWith = {
      kind: 'version-refused',
      refusal: { error: 'unsupported-protocol-version', accepted: [2, 3] },
    };
    await queue.enqueue(tap(1));
    await queue.start();
    await queue.idle();
    expect(queue.status().halted).toEqual({ kind: 'version-refused', accepted: [2, 3] });
    expect(await held(storage)).toEqual([[commandId(1), 'waiting']]);

    server.answerWith = { kind: 'rejected', httpStatus: 401 };
    queue.resume();
    await queue.idle();
    expect(queue.status().halted).toEqual({ kind: 'rejected', httpStatus: 401 });
    expect(await held(storage)).toEqual([[commandId(1), 'waiting']]);

    server.answerWith = null;
    queue.resume();
    await queue.idle();
    expect(server.saved).toEqual([commandId(1)]);
    expect(queue.status()).toMatchObject({ waiting: 0, halted: null });
  });
});
