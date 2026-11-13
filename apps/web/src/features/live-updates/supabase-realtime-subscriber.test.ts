// The Supabase Realtime subscriber (T-8) against recorded-style messages, shaped as
// Realtime sends them (Phoenix channels, version 1.0.0). No test reaches the network:
// the WebSocket is a stand-in driven by hand. NOT VERIFIED against the live service.
import {
  gameChannelName,
  leagueScoreFrom,
  leagueScoresChannelName,
  type LeagueScoreMessage,
  type LiveMessage,
} from '@srleagues/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveConnection } from './live-subscriber.ts';
import {
  sentRealtimeEvents,
  supabaseRealtimeSubscriber,
  type SupabaseRealtimeSubscriberOptions,
  type WebSocketLike,
} from './supabase-realtime-subscriber.ts';

const league = '0192f000-0000-7000-8000-00000000000a';
const game1 = '0192f000-0000-7000-8000-000000000001';
const game2 = '0192f000-0000-7000-8000-000000000002';
const key = 'made-up-publishable-key';
const gameTopic = `realtime:${gameChannelName(league, game1)}`;
const scoresTopic = `realtime:${leagueScoresChannelName(league)}`;

const message = (sequence: number, gameId = game1): LiveMessage => ({
  gameId,
  sequence,
  sentAt: 1_700_000_000_000 + sequence,
  status: 'live',
  score: { home: sequence, away: 1 },
  period: 3,
  clock: { state: 'stopped', remainingMs: 120_000 },
  teamFouls: { home: 2, away: 5 },
  latestPlay: { type: 'foul', side: 'away', playerName: 'J. Doe', jersey: '11' },
});

// ---- recorded-style frames, as Realtime sends them

const joinOk = (topic: string, ref: string) => ({
  ref,
  event: 'phx_reply',
  payload: { status: 'ok', response: { postgres_changes: [] } },
  topic,
});
const joinRefused = (topic: string, ref: string) => ({
  ref,
  event: 'phx_reply',
  payload: {
    status: 'error',
    response: {
      reason: 'Unauthorized: You do not have permissions to read from this Channel topic',
    },
  },
  topic,
});
const system = (topic: string) => ({
  ref: null,
  event: 'system',
  payload: {
    message: 'Subscribed to Realtime',
    status: 'ok',
    extension: 'broadcast',
    channel: topic,
  },
  topic,
});
const presenceState = (topic: string) => ({
  ref: null,
  event: 'presence_state',
  payload: {},
  topic,
});
const broadcast = (topic: string, payload: unknown, event = 'update') => ({
  ref: null,
  event: 'broadcast',
  payload: { event, payload, type: 'broadcast' },
  topic,
});
const heartbeatOk = (ref: string) => ({
  ref,
  event: 'phx_reply',
  payload: { status: 'ok', response: {} },
  topic: 'phoenix',
});
const channelError = (topic: string, ref: string) => ({
  ref,
  event: 'phx_error',
  payload: {},
  topic,
});

type SentFrame = {
  topic: string;
  event: string;
  payload: { config?: { private?: boolean } };
  ref: string;
  join_ref?: string;
};

class FakeSocket implements WebSocketLike {
  readonly sent: SentFrame[] = [];
  closed = false;
  private readonly listeners = new Map<string, ((event: Event) => void)[]>();
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as SentFrame);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.fire('close', new Event('close'));
  }
  fire(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  opened() {
    this.fire('open', new Event('open'));
  }
  receive(frame: unknown) {
    this.fire('message', new MessageEvent('message', { data: JSON.stringify(frame) }));
  }
  /** The ref of the last join sent for `topic`. */
  joinRef(topic: string): string {
    const join = this.sent.filter((f) => f.topic === topic && f.event === 'phx_join').at(-1);
    if (join === undefined) throw new Error(`no join for ${topic}`);
    return join.ref;
  }
}

let sockets: FakeSocket[];
const allSent = () => sockets.flatMap((s) => s.sent);

function subscriber(extra: Partial<SupabaseRealtimeSubscriberOptions> = {}) {
  return supabaseRealtimeSubscriber({
    url: 'https://project.supabase.test/',
    publishableKey: key,
    open: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    retryDelaysMs: [100, 500],
    refusedDelaysMs: [1_000, 5_000],
    // No spread, so the waits are exact; the spread has its own test.
    random: () => 1,
    ...extra,
  });
}

function watchGame(live: ReturnType<typeof subscriber>, gameId = game1) {
  const got: LiveMessage[] = [];
  const states: LiveConnection[] = [];
  const subscription = live.subscribeGame(league, gameId, {
    onMessage: (m) => got.push(m),
    onConnection: (s) => states.push(s),
  });
  return { got, states, subscription };
}

beforeEach(() => {
  sockets = [];
  vi.useFakeTimers();
});
afterEach(() => {
  // Whatever happened, the page only ever joined, left and kept the line open.
  for (const frame of allSent()) expect(sentRealtimeEvents).toContain(frame.event);
  vi.useRealTimers();
});

describe('supabaseRealtimeSubscriber', () => {
  it("connects with the publishable key and joins the game's private channel", () => {
    const page = watchGame(subscriber());
    expect(sockets).toHaveLength(1);
    const socket = sockets[0]!;
    expect(socket.url).toBe(
      `wss://project.supabase.test/realtime/v1/websocket?apikey=${key}&vsn=1.0.0`,
    );
    expect(socket.sent).toEqual([]);
    socket.opened();
    expect(socket.sent).toEqual([
      {
        topic: gameTopic,
        event: 'phx_join',
        payload: {
          config: { broadcast: { ack: false, self: false }, presence: { key: '' }, private: true },
        },
        ref: '1',
        join_ref: '1',
      },
    ]);
    expect(page.states).toEqual(['connecting']);
    socket.receive(joinOk(gameTopic, '1'));
    socket.receive(system(gameTopic));
    socket.receive(presenceState(gameTopic));
    expect(page.states).toEqual(['connecting', 'open']);
  });

  it('hands on every broadcast message, in order', () => {
    const page = watchGame(subscriber());
    const socket = sockets[0]!;
    socket.opened();
    socket.receive(joinOk(gameTopic, socket.joinRef(gameTopic)));
    for (let n = 1; n <= 30; n += 1) socket.receive(broadcast(gameTopic, message(n)));
    expect(page.got.map((m) => m.sequence)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(page.got[0]).toEqual(message(1));
  });

  it('drops anything that is not a message for this channel and game', () => {
    const page = watchGame(subscriber());
    const socket = sockets[0]!;
    socket.opened();
    // Before the join is answered, nothing is handed on.
    socket.receive(broadcast(gameTopic, message(1)));
    socket.receive(joinOk(gameTopic, socket.joinRef(gameTopic)));
    socket.receive(broadcast(gameTopic, message(2), 'other-event'));
    socket.receive(broadcast(gameTopic, { ...message(2), players: [] }));
    socket.receive(broadcast(gameTopic, message(2, game2)));
    socket.receive(broadcast(`realtime:${gameChannelName(league, game2)}`, message(2)));
    socket.receive(broadcast(gameTopic.replace('realtime:', ''), message(2)));
    socket.fire('message', new MessageEvent('message', { data: 'not json' }));
    socket.receive({ event: 'broadcast' });
    socket.receive(null);
    socket.receive(broadcast(gameTopic, message(3)));
    expect(page.got.map((m) => m.sequence)).toEqual([3]);
  });

  it('shares one connection and one join between pages of the same channel', () => {
    const live = subscriber();
    const first = watchGame(live);
    const second = watchGame(live);
    const scores: LeagueScoreMessage[] = [];
    live.subscribeLeagueScores(league, { onMessage: (m) => scores.push(m) });
    expect(sockets).toHaveLength(1);
    const socket = sockets[0]!;
    socket.opened();
    expect(socket.sent.map((f) => f.topic)).toEqual([gameTopic, scoresTopic]);
    socket.receive(joinOk(gameTopic, socket.joinRef(gameTopic)));
    socket.receive(joinOk(scoresTopic, socket.joinRef(scoresTopic)));
    socket.receive(broadcast(gameTopic, message(1)));
    socket.receive(broadcast(scoresTopic, leagueScoreFrom(message(1))));
    expect(first.got).toEqual([message(1)]);
    expect(second.got).toEqual([message(1)]);
    expect(scores).toEqual([leagueScoreFrom(message(1))]);
    // A page arriving on a joined channel is open at once.
    const third = watchGame(live);
    expect(third.states).toEqual(['open']);
  });

  it('says unavailable when a join is refused, and joins again only much later', () => {
    const page = watchGame(subscriber());
    const socket = sockets[0]!;
    socket.opened();
    socket.receive(joinRefused(gameTopic, socket.joinRef(gameTopic)));
    expect(page.states).toEqual(['connecting', 'unavailable']);
    vi.advanceTimersByTime(999);
    expect(socket.sent).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(socket.sent).toHaveLength(2);
    // Refused again: the wait grows.
    socket.receive(joinRefused(gameTopic, socket.joinRef(gameTopic)));
    vi.advanceTimersByTime(4_999);
    expect(socket.sent).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(socket.sent).toHaveLength(3);
    socket.receive(joinOk(gameTopic, socket.joinRef(gameTopic)));
    expect(page.states).toEqual(['connecting', 'unavailable', 'unavailable', 'open']);
  });

  it('keeps waiting longer for a channel that is joined and dropped at once', () => {
    watchGame(subscriber({ stableMs: 1_000 }));
    const socket = sockets[0]!;
    socket.opened();
    const joins = () => socket.sent.filter((f) => f.event === 'phx_join').length;
    socket.receive(joinOk(gameTopic, socket.joinRef(gameTopic)));
    socket.receive(channelError(gameTopic, socket.joinRef(gameTopic)));
    vi.advanceTimersByTime(100);
    expect(joins()).toBe(2);
    socket.receive(joinOk(gameTopic, socket.joinRef(gameTopic)));
    socket.receive(channelError(gameTopic, socket.joinRef(gameTopic)));
    vi.advanceTimersByTime(499);
    expect(joins()).toBe(2);
    vi.advanceTimersByTime(1);
    expect(joins()).toBe(3);
    // Joined for longer than the stable time: the next failure starts from the first wait.
    socket.receive(joinOk(gameTopic, socket.joinRef(gameTopic)));
    vi.advanceTimersByTime(1_000);
    socket.receive(channelError(gameTopic, socket.joinRef(gameTopic)));
    vi.advanceTimersByTime(100);
    expect(joins()).toBe(4);
  });

  it('keeps waiting longer for a connection that opens and closes at once', () => {
    watchGame(subscriber({ stableMs: 1_000 }));
    sockets[0]!.opened();
    sockets[0]!.close();
    vi.advanceTimersByTime(100);
    expect(sockets).toHaveLength(2);
    sockets[1]!.opened();
    sockets[1]!.close();
    vi.advanceTimersByTime(499);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
    sockets[2]!.opened();
    vi.advanceTimersByTime(1_000);
    sockets[2]!.close();
    vi.advanceTimersByTime(100);
    expect(sockets).toHaveLength(4);
  });

  it('spreads each wait at random between half and all of it', () => {
    watchGame(subscriber({ random: () => 0 }));
    sockets[0]!.close();
    vi.advanceTimersByTime(49);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
  });

  it('says unavailable, and opens nothing, for an ID that is not one', () => {
    const live = subscriber();
    const states: LiveConnection[] = [];
    const handlers = { onMessage: () => {}, onConnection: (s: LiveConnection) => states.push(s) };
    expect(() => live.subscribeGame(league, 'not-a-game', handlers).close()).not.toThrow();
    expect(() => live.subscribeLeagueScores('not-a-league', handlers).close()).not.toThrow();
    expect(states).toEqual(['unavailable', 'unavailable']);
    expect(sockets).toEqual([]);
  });

  it('keeps trying when the browser will not even open the connection', () => {
    let refuseOpen = true;
    const page = watchGame(
      subscriber({
        open: (url) => {
          if (refuseOpen) throw new SyntaxError('blocked');
          const socket = new FakeSocket(url);
          sockets.push(socket);
          return socket;
        },
      }),
    );
    expect(page.states).toEqual(['connecting', 'unavailable']);
    vi.advanceTimersByTime(100);
    expect(page.states).toEqual(['connecting', 'unavailable', 'unavailable']);
    refuseOpen = false;
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(1);
    sockets[0]!.opened();
    sockets[0]!.receive(joinOk(gameTopic, sockets[0]!.joinRef(gameTopic)));
    expect(page.states.at(-1)).toBe('open');
  });

  it('joins no more channels than its limit', () => {
    const live = subscriber({ maxChannels: 2 });
    watchGame(live, game1);
    watchGame(live, game2);
    const third = live.subscribeLeagueScores(league, {
      onMessage: () => {},
      onConnection: (s) => expect(s).toBe('unavailable'),
    });
    const socket = sockets[0]!;
    socket.opened();
    expect(socket.sent.map((f) => f.topic)).toEqual([
      gameTopic,
      `realtime:${gameChannelName(league, game2)}`,
    ]);
    // A page already on a joined channel is not counted again.
    const again = watchGame(live, game1);
    expect(again.states).toEqual(['connecting']);
    third.close();
  });

  it('tries a join again when it goes unanswered', () => {
    const page = watchGame(subscriber({ joinTimeoutMs: 1_000 }));
    const socket = sockets[0]!;
    socket.opened();
    const firstRef = socket.joinRef(gameTopic);
    vi.advanceTimersByTime(1_100);
    expect(page.states).toEqual(['connecting', 'unavailable']);
    const secondRef = socket.joinRef(gameTopic);
    expect(secondRef).not.toBe(firstRef);
    // A late answer to the old join counts for nothing.
    socket.receive(joinOk(gameTopic, firstRef));
    expect(page.states).toEqual(['connecting', 'unavailable']);
    socket.receive(joinOk(gameTopic, secondRef));
    expect(page.states).toEqual(['connecting', 'unavailable', 'open']);
  });

  it('joins again when the service drops the channel', () => {
    const page = watchGame(subscriber());
    const socket = sockets[0]!;
    socket.opened();
    socket.receive(joinOk(gameTopic, socket.joinRef(gameTopic)));
    socket.receive(channelError(gameTopic, socket.joinRef(gameTopic)));
    socket.receive(broadcast(gameTopic, message(1)));
    expect(page.got).toEqual([]);
    vi.advanceTimersByTime(100);
    socket.receive(joinOk(gameTopic, socket.joinRef(gameTopic)));
    socket.receive(broadcast(gameTopic, message(2)));
    expect(page.got).toEqual([message(2)]);
    expect(page.states).toEqual(['connecting', 'open', 'unavailable', 'open']);
  });

  it('reconnects after the connection closes, waiting longer each time, and joins again', () => {
    const page = watchGame(subscriber());
    sockets[0]!.opened();
    sockets[0]!.receive(joinOk(gameTopic, sockets[0]!.joinRef(gameTopic)));
    sockets[0]!.close();
    expect(page.states).toEqual(['connecting', 'open', 'unavailable']);
    vi.advanceTimersByTime(100);
    expect(sockets).toHaveLength(2);
    sockets[1]!.close(); // fails before opening
    vi.advanceTimersByTime(499);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
    const socket = sockets[2]!;
    socket.opened();
    socket.receive(joinOk(gameTopic, socket.joinRef(gameTopic)));
    socket.receive(broadcast(gameTopic, message(5)));
    expect(page.got).toEqual([message(5)]);
    expect(page.states.at(-1)).toBe('open');
  });

  it('keeps the line open with heartbeats, and starts again when one goes unanswered', () => {
    const page = watchGame(subscriber({ heartbeatMs: 1_000 }));
    const socket = sockets[0]!;
    socket.opened();
    socket.receive(joinOk(gameTopic, socket.joinRef(gameTopic)));
    vi.advanceTimersByTime(1_000);
    const beat = socket.sent.at(-1)!;
    expect(beat).toEqual({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: beat.ref });
    socket.receive(heartbeatOk(beat.ref));
    vi.advanceTimersByTime(1_000);
    expect(socket.closed).toBe(false);
    // This one is never answered.
    vi.advanceTimersByTime(1_000);
    expect(socket.closed).toBe(true);
    expect(page.states.at(-1)).toBe('unavailable');
    vi.advanceTimersByTime(100);
    expect(sockets).toHaveLength(2);
  });

  it('leaves the channel and closes the connection when the last page stops', () => {
    const live = subscriber();
    const first = watchGame(live);
    const second = watchGame(live);
    const socket = sockets[0]!;
    socket.opened();
    const ref = socket.joinRef(gameTopic);
    socket.receive(joinOk(gameTopic, ref));
    first.subscription.close();
    expect(socket.sent.map((f) => f.event)).toEqual(['phx_join']);
    second.subscription.close();
    expect(socket.sent.at(-1)).toMatchObject({
      topic: gameTopic,
      event: 'phx_leave',
      join_ref: ref,
    });
    expect(socket.closed).toBe(true);
    socket.receive(broadcast(gameTopic, message(1)));
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(first.got).toEqual([]);
    expect(second.got).toEqual([]);
  });

  it('opens a fresh connection for a page that arrives after everyone left', () => {
    const live = subscriber();
    watchGame(live).subscription.close();
    const page = watchGame(live);
    expect(sockets).toHaveLength(2);
    sockets[1]!.opened();
    sockets[1]!.receive(joinOk(gameTopic, sockets[1]!.joinRef(gameTopic)));
    expect(page.states).toEqual(['connecting', 'open']);
  });
});
