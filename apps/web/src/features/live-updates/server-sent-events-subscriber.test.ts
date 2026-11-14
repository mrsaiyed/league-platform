// The browser's side of the local stand-in, end to end against the real hub, and
// on its own against a hand-driven EventSource.
import {
  gameChannelName,
  leagueScoreFrom,
  type LeagueScoreMessage,
  type LiveMessage,
} from '@srleagues/contracts';
import { createLocalLiveHub, type LocalLiveHub } from '@srleagues/providers';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hubEventSources } from './hub-event-source.test-helper.ts';
import type { LiveConnection } from './live-subscriber.ts';
import {
  serverSentEventsSubscriber,
  webLiveAddress,
  type EventSourceLike,
  type ServerSentEventsSubscriberOptions,
} from './server-sent-events-subscriber.ts';

const leagueA = '0192f000-0000-7000-8000-00000000000a';

describe('the web live address', () => {
  it('is the address of the live route of the web app', () => {
    const route = new URL(`../../app${webLiveAddress}/route.ts`, import.meta.url);
    expect(existsSync(fileURLToPath(route))).toBe(true);
  });
});
const leagueB = '0192f000-0000-7000-8000-00000000000b';
const game1 = '0192f000-0000-7000-8000-000000000001';
const game2 = '0192f000-0000-7000-8000-000000000002';

const message = (sequence: number, gameId = game1): LiveMessage => ({
  gameId,
  sequence,
  sentAt: 1_700_000_000_000 + sequence,
  status: 'live',
  score: { home: sequence, away: 0 },
  period: 1,
  clock: { state: 'running', remainingMs: 600_000 - sequence, asOf: 1_700_000_000_000 },
  teamFouls: { home: 0, away: 0 },
  latestPlay: { type: 'score', side: 'home', playerName: null, jersey: null, points: 1 },
});

const until = async (check: () => boolean) => {
  for (let i = 0; i < 400 && !check(); i += 1) await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
};

let hub: LocalLiveHub;
afterEach(() => {
  hub?.close();
  vi.useRealTimers();
});

describe('server-sent events subscriber, against the local hub', () => {
  it('hands every message, in order, to many pages watching the same game', async () => {
    hub = createLocalLiveHub();
    const { open } = hubEventSources(hub);
    const subscriber = serverSentEventsSubscriber({ address: '/api/v1/live', open });
    const pages = Array.from({ length: 20 }, () => ({
      got: [] as number[],
      states: [] as LiveConnection[],
    }));
    const subscriptions = pages.map((page) =>
      subscriber.subscribeGame(leagueA, game1, {
        onMessage: (m) => page.got.push(m.sequence),
        onConnection: (s) => page.states.push(s),
      }),
    );
    await until(() => pages.every((p) => p.states.includes('open')));

    for (let n = 1; n <= 50; n += 1) await hub.publishGame(leagueA, message(n));
    // Another game, and the same game ID in another league: neither reaches these pages.
    await hub.publishGame(leagueA, message(51, game2));
    await hub.publishGame(leagueB, message(51, game1));

    const expected = Array.from({ length: 50 }, (_, i) => i + 1);
    await until(() => pages.every((p) => p.got.length >= 50));
    for (const page of pages) {
      expect(page.got).toEqual(expected);
      expect(page.states).toEqual(['connecting', 'open']);
    }
    subscriptions.forEach((s) => s.close());
    await until(() => hub.listenerCount(gameChannelName(leagueA, game1)) === 0);
  });

  it("hands the league's live scores to the home page", async () => {
    hub = createLocalLiveHub();
    const { open, opened } = hubEventSources(hub);
    const subscriber = serverSentEventsSubscriber({ address: '/api/v1/live', open });
    const got: LeagueScoreMessage[] = [];
    let state: LiveConnection | undefined;
    subscriber.subscribeLeagueScores(leagueA, {
      onMessage: (m) => got.push(m),
      onConnection: (s) => (state = s),
    });
    expect(opened[0]?.url).toBe(
      `/api/v1/live?channel=${encodeURIComponent(`league:${leagueA}:live-scores`)}`,
    );
    await until(() => state === 'open');
    await hub.publishLeagueScore(leagueA, leagueScoreFrom(message(4, game1)));
    await hub.publishLeagueScore(leagueA, leagueScoreFrom(message(9, game2)));
    await until(() => got.length === 2);
    expect(got).toEqual([leagueScoreFrom(message(4, game1)), leagueScoreFrom(message(9, game2))]);
  });

  it('stops handing messages to a page that closed, while others keep theirs', async () => {
    hub = createLocalLiveHub();
    const { open } = hubEventSources(hub);
    const subscriber = serverSentEventsSubscriber({ address: '/api/v1/live', open });
    const closedPage: number[] = [];
    const openPage: number[] = [];
    let opens = 0;
    const onConnection = (s: LiveConnection) => {
      if (s === 'open') opens += 1;
    };
    const leaving = subscriber.subscribeGame(leagueA, game1, {
      onMessage: (m) => closedPage.push(m.sequence),
      onConnection,
    });
    subscriber.subscribeGame(leagueA, game1, {
      onMessage: (m) => openPage.push(m.sequence),
      onConnection,
    });
    await until(() => opens === 2);
    leaving.close();
    await hub.publishGame(leagueA, message(1));
    await until(() => openPage.length === 1);
    expect(closedPage).toEqual([]);
  });
});

/** An EventSource driven by hand. */
class HandSource implements EventSourceLike {
  readyState = 0;
  closed = false;
  private readonly listeners = new Map<string, ((event: Event) => void)[]>();
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  emit(type: string, data?: string) {
    const event = data === undefined ? new Event(type) : new MessageEvent(type, { data });
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function handDriven(extra: Partial<ServerSentEventsSubscriberOptions> = {}) {
  const sources: HandSource[] = [];
  const subscriber = serverSentEventsSubscriber({
    address: '/api/v1/live?v=1',
    open: (url) => {
      const source = new HandSource(url);
      sources.push(source);
      return source;
    },
    retryDelaysMs: [100, 400],
    // No spread, so the waits are exact; the spread has its own test.
    random: () => 1,
    ...extra,
  });
  return { sources, subscriber };
}

describe('server-sent events subscriber, on its own', () => {
  it('drops anything that is not a message for this game', () => {
    const { sources, subscriber } = handDriven();
    const got: LiveMessage[] = [];
    subscriber.subscribeGame(leagueA, game1, { onMessage: (m) => got.push(m) });
    const source = sources[0]!;
    expect(source.url).toBe(
      `/api/v1/live?v=1&channel=${encodeURIComponent(gameChannelName(leagueA, game1))}`,
    );
    source.emit('update', 'not json');
    source.emit('update', JSON.stringify({ ...message(1), players: [] }));
    source.emit('update', JSON.stringify(message(1, game2)));
    source.emit('update', JSON.stringify({ sequence: 1 }));
    source.emit('message', JSON.stringify(message(1)));
    source.emit('update', JSON.stringify(message(2)));
    expect(got).toEqual([message(2)]);
  });

  it('says unavailable when the connection drops, and open when it is back', () => {
    const { sources, subscriber } = handDriven();
    const states: LiveConnection[] = [];
    subscriber.subscribeGame(leagueA, game1, {
      onMessage: () => {},
      onConnection: (s) => states.push(s),
    });
    const source = sources[0]!;
    source.readyState = 1;
    source.emit('open');
    source.readyState = 0; // the browser is trying again by itself
    source.emit('error');
    source.readyState = 1;
    source.emit('open');
    expect(states).toEqual(['connecting', 'open', 'unavailable', 'open']);
    expect(sources).toHaveLength(1);
  });

  it('opens again by itself, waiting longer each time, once the browser gives up', () => {
    vi.useFakeTimers();
    const { sources, subscriber } = handDriven();
    const states: LiveConnection[] = [];
    subscriber.subscribeGame(leagueA, game1, {
      onMessage: () => {},
      onConnection: (s) => states.push(s),
    });
    sources[0]!.readyState = 2;
    sources[0]!.emit('error');
    expect(sources[0]!.closed).toBe(true);
    vi.advanceTimersByTime(99);
    expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(2);
    sources[1]!.readyState = 2;
    sources[1]!.emit('error');
    vi.advanceTimersByTime(399);
    expect(sources).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(3);
    sources[2]!.emit('open');
    expect(states).toEqual(['connecting', 'unavailable', 'unavailable', 'open']);
  });

  it('keeps waiting longer for a connection that opens and is refused at once', () => {
    vi.useFakeTimers();
    const { sources, subscriber } = handDriven({ stableMs: 1_000 });
    subscriber.subscribeGame(leagueA, game1, { onMessage: () => {} });
    const refuse = (source: HandSource) => {
      source.readyState = 2;
      source.emit('error');
    };
    sources[0]!.emit('open');
    refuse(sources[0]!);
    vi.advanceTimersByTime(100);
    expect(sources).toHaveLength(2);
    sources[1]!.emit('open');
    refuse(sources[1]!);
    vi.advanceTimersByTime(399);
    expect(sources).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(3);
    // Open for longer than the stable time: the next refusal starts from the first wait.
    sources[2]!.emit('open');
    vi.advanceTimersByTime(1_000);
    refuse(sources[2]!);
    vi.advanceTimersByTime(100);
    expect(sources).toHaveLength(4);
  });

  it('spreads each wait at random between half and all of it', () => {
    vi.useFakeTimers();
    const { sources, subscriber } = handDriven({ random: () => 0 });
    subscriber.subscribeGame(leagueA, game1, { onMessage: () => {} });
    sources[0]!.readyState = 2;
    sources[0]!.emit('error');
    vi.advanceTimersByTime(49);
    expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(2);
  });

  it('waits slowly by default after a refusal', () => {
    vi.useFakeTimers();
    const sources: HandSource[] = [];
    const subscriber = serverSentEventsSubscriber({
      address: '/api/v1/live',
      open: (url) => {
        const source = new HandSource(url);
        sources.push(source);
        return source;
      },
      random: () => 1,
    });
    subscriber.subscribeGame(leagueA, game1, { onMessage: () => {} });
    sources[0]!.readyState = 2;
    sources[0]!.emit('error');
    vi.advanceTimersByTime(29_999);
    expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(2);
  });

  it('says unavailable, and opens nothing, for an ID that is not one', () => {
    const { sources, subscriber } = handDriven();
    const states: LiveConnection[] = [];
    const handlers = { onMessage: () => {}, onConnection: (s: LiveConnection) => states.push(s) };
    expect(() => subscriber.subscribeGame('nope', game1, handlers).close()).not.toThrow();
    expect(() => subscriber.subscribeLeagueScores(leagueA.slice(1), handlers)).not.toThrow();
    expect(states).toEqual(['unavailable', 'unavailable']);
    expect(sources).toEqual([]);
  });

  it('keeps trying when the browser will not even open the source', () => {
    vi.useFakeTimers();
    const sources: HandSource[] = [];
    let refuseOpen = true;
    const subscriber = serverSentEventsSubscriber({
      address: '/api/v1/live',
      open: (url) => {
        if (refuseOpen) throw new SyntaxError('blocked');
        const source = new HandSource(url);
        sources.push(source);
        return source;
      },
      retryDelaysMs: [100, 400],
      random: () => 1,
    });
    const states: LiveConnection[] = [];
    subscriber.subscribeGame(leagueA, game1, {
      onMessage: () => {},
      onConnection: (s) => states.push(s),
    });
    expect(states).toEqual(['connecting', 'unavailable']);
    vi.advanceTimersByTime(100);
    expect(states).toEqual(['connecting', 'unavailable', 'unavailable']);
    refuseOpen = false;
    vi.advanceTimersByTime(400);
    expect(sources).toHaveLength(1);
    sources[0]!.emit('open');
    expect(states.at(-1)).toBe('open');
  });

  it('after close, hands nothing more, closes the source and does not open again', () => {
    vi.useFakeTimers();
    const { sources, subscriber } = handDriven();
    const got: LiveMessage[] = [];
    const states: LiveConnection[] = [];
    const subscription = subscriber.subscribeGame(leagueA, game1, {
      onMessage: (m) => got.push(m),
      onConnection: (s) => states.push(s),
    });
    sources[0]!.readyState = 2;
    sources[0]!.emit('error');
    subscription.close();
    vi.advanceTimersByTime(10_000);
    expect(sources).toHaveLength(1);
    sources[0]!.emit('update', JSON.stringify(message(1)));
    expect(got).toEqual([]);
    expect(states).toEqual(['connecting', 'unavailable']);
  });

  it('says unavailable when the hub refuses the channel', async () => {
    hub = createLocalLiveHub();
    const { open } = hubEventSources(hub);
    const subscriber = serverSentEventsSubscriber({
      address: '/api/v1/live?channel=everything',
      open,
      retryDelaysMs: [60_000],
    });
    const states: LiveConnection[] = [];
    const subscription = subscriber.subscribeLeagueScores(leagueA, {
      onMessage: () => {},
      onConnection: (s) => states.push(s),
    });
    // The extra `channel` the address carries makes the hub read the wrong one.
    await until(() => states.includes('unavailable'));
    expect(states).toEqual(['connecting', 'unavailable']);
    subscription.close();
  });
});
