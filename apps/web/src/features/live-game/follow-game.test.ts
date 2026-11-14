// Following a game (step 2.45, record 051): messages applied in order, a gap answered by
// a snapshot, a blocked connection answered by a snapshot every 5 seconds, and the slower
// fetches that keep the players and a lost last message right.
import type { GameSnapshot, GameStatus, LiveMessage } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import type { LiveConnection, LiveHandlers, LiveSubscriber } from '../live-updates/index.ts';
import { followGame, type FollowedGame, type FollowTimers } from './follow-game.ts';

const leagueId = '0192f000-0000-7000-8000-0000000000aa';
const gameId = '0192f000-0000-7000-8000-000000000001';

const message = (sequence: number, status: GameStatus = 'live'): LiveMessage => ({
  gameId,
  sequence,
  sentAt: 1_000_000 + sequence,
  status,
  score: { home: sequence * 2, away: 0 },
  period: 1,
  clock: { state: 'stopped', remainingMs: 480_000 },
  teamFouls: { home: 0, away: 0 },
  latestPlay: null,
});

const snapshot = (sequence: number, status: GameStatus = 'live'): GameSnapshot => ({
  ...message(sequence, status),
  periods: 4,
  teams: {
    home: { name: 'Home', statsVisible: true },
    away: { name: 'Away', statsVisible: true },
  },
  players: [],
});

/** Timers moved by hand. */
function clock() {
  let now = 0;
  let next = 1;
  const due = new Map<number, { at: number; run: () => void }>();
  const timers: FollowTimers = {
    setTimeout: (run, ms) => {
      const id = next++;
      due.set(id, { at: now + ms, run });
      return id;
    },
    clearTimeout: (handle) => void due.delete(handle as number),
    now: () => now,
  };
  /** Moves time on, running each timer that falls due, in order. */
  async function advance(ms: number) {
    const until = now + ms;
    for (;;) {
      const first = [...due.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (first === undefined || first[1].at > until) break;
      due.delete(first[0]);
      now = first[1].at;
      first[1].run();
      await settle();
    }
    now = until;
    await settle();
  }
  return { timers, advance };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function world(initial = snapshot(0)) {
  let handlers: LiveHandlers<LiveMessage> | undefined;
  let closed = false;
  const subscriber: LiveSubscriber = {
    subscribeGame: (_league, _game, h) => {
      handlers = h;
      h.onConnection?.('connecting');
      return { close: () => void (closed = true) };
    },
    subscribeLeagueScores: () => ({ close: () => {} }),
  };
  let server = initial;
  const fetches: number[] = [];
  const time = clock();
  const seen: FollowedGame[] = [];
  const handle = followGame({
    leagueId,
    gameId,
    initial,
    initialReceivedAt: 0,
    subscriber,
    fetchSnapshot: async () => {
      fetches.push(time.timers.now());
      return server;
    },
    onChange: (f) => void seen.push(f),
    timers: time.timers,
  });
  return {
    handle,
    fetches,
    seen,
    advance: time.advance,
    last: () => seen.at(-1),
    serverIs: (s: GameSnapshot) => void (server = s),
    send: (m: LiveMessage) => handlers?.onMessage(m),
    connect: (c: LiveConnection) => handlers?.onConnection?.(c),
    subscribed: () => handlers !== undefined,
    closed: () => closed,
  };
}

describe('following a game', () => {
  it('applies each message in order, with no fetch', async () => {
    const w = world();
    w.connect('open');
    await settle();
    expect(w.fetches).toEqual([0]); // the catch-up on opening
    w.send(message(1));
    w.send(message(2));
    expect(w.last()?.game.sequence).toBe(2);
    expect(w.last()?.game.score.home).toBe(4);
    expect(w.last()?.connection).toBe('open');
    expect(w.fetches).toEqual([0]);
  });

  it('fetches a snapshot at once on a gap, and shows it', async () => {
    const w = world();
    w.connect('open');
    await settle();
    w.send(message(1));
    w.serverIs(snapshot(3));
    w.send(message(3)); // 2 was dropped
    await settle();
    expect(w.fetches).toHaveLength(2);
    expect(w.last()?.game.sequence).toBe(3);
    w.send(message(4));
    expect(w.last()?.game.sequence).toBe(4);
  });

  it('asks again after 2 seconds while the snapshot is behind', async () => {
    const w = world();
    w.connect('open');
    await settle();
    w.send(message(3)); // a gap; the cached snapshot is still at 0
    await settle();
    expect(w.last()?.game.sequence).toBe(0);
    w.serverIs(snapshot(3));
    await w.advance(2_000);
    expect(w.last()?.game.sequence).toBe(3);
  });

  it('re-fetches every 5 seconds while the live connection cannot be made', async () => {
    const w = world();
    w.connect('unavailable');
    await w.advance(4_999);
    expect(w.fetches).toEqual([]);
    w.serverIs(snapshot(2));
    await w.advance(1);
    expect(w.last()?.game.sequence).toBe(2);
    expect(w.last()?.connection).toBe('unavailable');
    await w.advance(10_000);
    expect(w.fetches).toEqual([5_000, 10_000, 15_000]);
  });

  it('re-fetches only every 60 seconds for a game not live, then 5 once it starts', async () => {
    const w = world(snapshot(0, 'scheduled'));
    w.connect('unavailable');
    await w.advance(59_999);
    expect(w.fetches).toEqual([]);
    await w.advance(1);
    expect(w.fetches).toEqual([60_000]);
    w.serverIs(snapshot(1, 'live'));
    await w.advance(60_000);
    expect(w.last()?.game.status).toBe('live');
    await w.advance(5_000);
    expect(w.fetches).toEqual([60_000, 120_000, 125_000]);
  });

  it('catches up when the connection opens again, then stops polling', async () => {
    const w = world();
    w.connect('unavailable');
    await w.advance(5_000);
    w.serverIs(snapshot(1));
    w.connect('open');
    await settle();
    expect(w.fetches).toEqual([5_000, 5_000]);
    expect(w.last()?.game.sequence).toBe(1);
    await w.advance(29_000);
    expect(w.fetches).toHaveLength(2);
  });

  it('refreshes the players at most every 5 seconds after messages', async () => {
    const w = world();
    w.connect('open');
    await settle();
    w.send(message(1));
    w.send(message(2));
    await w.advance(4_999);
    expect(w.fetches).toEqual([0]);
    w.serverIs(snapshot(2));
    await w.advance(1);
    expect(w.fetches).toEqual([0, 5_000]);
    expect(w.last()?.game.playersAsOfSequence).toBe(2);
  });

  it('finds a lost last message within 30 seconds of quiet', async () => {
    const w = world(snapshot(5));
    w.connect('open');
    await settle();
    w.serverIs(snapshot(6)); // message 6 never arrived, and nothing after it
    await w.advance(30_000);
    expect(w.last()?.game.sequence).toBe(6);
  });

  it('stops following once the game is final', async () => {
    const w = world();
    w.connect('open');
    await settle();
    w.send(message(1, 'final'));
    expect(w.last()?.game.status).toBe('final');
    expect(w.closed()).toBe(true);
    await w.advance(120_000);
    expect(w.fetches).toEqual([0]);
  });

  it('does not follow a game that is already final', async () => {
    const w = world(snapshot(9, 'final'));
    expect(w.subscribed()).toBe(false);
    await w.advance(120_000);
    expect(w.fetches).toEqual([]);
  });

  it('sends nothing after it is closed', async () => {
    const w = world();
    w.connect('unavailable');
    w.handle.close();
    expect(w.closed()).toBe(true);
    const before = w.seen.length;
    w.send(message(1));
    await w.advance(60_000);
    expect(w.fetches).toEqual([]);
    expect(w.seen).toHaveLength(before);
  });

  it('keeps the largest clock offset seen, from messages and fetched snapshots', async () => {
    const w = world(); // the page's snapshot: sent at 1_000_000, received at 0
    w.serverIs({ ...snapshot(0), sentAt: 1_000_500 }); // the catch-up: sent at 1_000_500, received at 0
    w.connect('open');
    await settle();
    expect(w.last()?.offsetMs).toBe(1_000_500);
    await w.advance(1_000);
    w.send(message(1)); // sent at 1_000_001, received at 1_000: a slow arrival
    expect(w.last()?.offsetMs).toBe(1_000_500);
    w.send({ ...message(2), sentAt: 1_002_000 }); // sent at 1_002_000, received at 1_000
    expect(w.last()?.offsetMs).toBe(1_001_000);
    w.serverIs({ ...snapshot(2), sentAt: 1_000_002 }); // a cached copy, sent long ago
    await w.advance(5_000);
    expect(w.fetches.length).toBeGreaterThan(1);
    expect(w.last()?.offsetMs).toBe(1_001_000);
  });
});
