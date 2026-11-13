// The local stand-in (T-14, T6 §6): messages reach many listeners in order, each
// channel only its own, and the page-facing door only lets pages listen (T-120).
import {
  gameChannelName,
  leagueScoreFrom,
  leagueScoresChannelName,
  type LiveMessage,
} from '@srleagues/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalLiveHub, type LocalLiveHub } from './local-live-hub.ts';
import { LivePublishError, type LiveDelivery } from './live-publisher.ts';

const leagueA = '0192f000-0000-7000-8000-00000000000a';
const leagueB = '0192f000-0000-7000-8000-00000000000b';
const game1 = '0192f000-0000-7000-8000-000000000001';
const game2 = '0192f000-0000-7000-8000-000000000002';

const message = (sequence: number, gameId = game1): LiveMessage => ({
  gameId,
  sequence,
  sentAt: 1_700_000_000_000 + sequence,
  status: 'live',
  score: { home: sequence * 2, away: sequence },
  period: 1,
  clock: { state: 'stopped', remainingMs: 600_000 },
  teamFouls: { home: 0, away: 0 },
  latestPlay: null,
});

type Event = { event: string; data: unknown };

/** Reads server-sent events off a response until `count` have arrived. */
async function readEvents(response: Response, count: number): Promise<Event[]> {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  const found: Event[] = [];
  let buffer = '';
  while (found.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const lines = block.split('\n');
      const event = lines.find((l) => l.startsWith('event: '))?.slice(7);
      const data = lines.find((l) => l.startsWith('data: '))?.slice(6);
      if (event !== undefined && data !== undefined) found.push({ event, data: JSON.parse(data) });
    }
  }
  await reader.cancel();
  return found;
}

/** Reads the raw text until `needle` appears. */
async function readUntil(response: Response, needle: string): Promise<string> {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let text = '';
  while (!text.includes(needle)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += value;
  }
  await reader.cancel();
  return text;
}

const listenTo = (hub: LocalLiveHub, channel: string, init: RequestInit = {}) =>
  hub.serve(
    new Request(`http://local.test/api/v1/live?channel=${encodeURIComponent(channel)}`, init),
  );

let hub: LocalLiveHub;
afterEach(() => hub?.close());

describe('local live hub', () => {
  it('delivers every message in order to many pages and listeners at once', async () => {
    hub = createLocalLiveHub();
    const channel = gameChannelName(leagueA, game1);
    const streams = await Promise.all(Array.from({ length: 25 }, () => listenTo(hub, channel)));
    const heard: number[][] = Array.from({ length: 5 }, () => []);
    heard.forEach((list) =>
      hub.listen(channel, (d) => list.push((d.payload as LiveMessage).sequence)),
    );
    expect(hub.listenerCount(channel)).toBe(30);

    const reading = streams.map((s) => readEvents(s, 80));
    // Half awaited one by one, half fired together: order is the order of publishing.
    for (let n = 1; n <= 40; n += 1) await hub.publishGame(leagueA, message(n));
    await Promise.all(
      Array.from({ length: 40 }, (_, i) => hub.publishGame(leagueA, message(41 + i))),
    );

    const expected = Array.from({ length: 80 }, (_, i) => i + 1);
    for (const events of await Promise.all(reading)) {
      expect(events.map((e) => e.event)).toEqual(expected.map(() => 'update'));
      expect(events.map((e) => (e.data as LiveMessage).sequence)).toEqual(expected);
      expect(events[0]?.data).toEqual(message(1));
    }
    for (const list of heard) expect(list).toEqual(expected);
  });

  it('keeps each game and each league to its own channel', async () => {
    hub = createLocalLiveHub();
    const got: Record<string, LiveDelivery[]> = { a1: [], a2: [], b1: [], scoresA: [] };
    hub.listen(gameChannelName(leagueA, game1), (d) => got.a1!.push(d));
    hub.listen(gameChannelName(leagueA, game2), (d) => got.a2!.push(d));
    hub.listen(gameChannelName(leagueB, game1), (d) => got.b1!.push(d));
    hub.listen(leagueScoresChannelName(leagueA), (d) => got.scoresA!.push(d));

    await hub.publishGame(leagueA, message(1, game1));
    await hub.publishGame(leagueA, message(1, game2));
    await hub.publishLeagueScore(leagueA, leagueScoreFrom(message(1, game1)));

    expect(got.a1!.map((d) => d.channel)).toEqual([gameChannelName(leagueA, game1)]);
    expect(got.a2!.map((d) => (d.payload as LiveMessage).gameId)).toEqual([game2]);
    expect(got.b1).toEqual([]);
    expect(got.scoresA!.map((d) => d.payload)).toEqual([leagueScoreFrom(message(1, game1))]);
  });

  it('carries league scores to pages over the stream', async () => {
    hub = createLocalLiveHub();
    const stream = await listenTo(hub, leagueScoresChannelName(leagueA));
    const reading = readEvents(stream, 2);
    await hub.publishLeagueScore(leagueA, leagueScoreFrom(message(3, game1)));
    await hub.publishLeagueScore(leagueA, leagueScoreFrom(message(1, game2)));
    expect((await reading).map((e) => e.data)).toEqual([
      leagueScoreFrom(message(3, game1)),
      leagueScoreFrom(message(1, game2)),
    ]);
  });

  it('lets pages only listen: every other method is refused and publishes nothing', async () => {
    hub = createLocalLiveHub();
    const channel = gameChannelName(leagueA, game1);
    const heard: LiveDelivery[] = [];
    hub.listen(channel, (d) => heard.push(d));
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const answer = await listenTo(hub, channel, { method, body: JSON.stringify(message(1)) });
      expect(answer.status).toBe(405);
      expect(answer.headers.get('Allow')).toBe('GET');
    }
    expect(heard).toEqual([]);
    expect(hub.listenerCount(channel)).toBe(1);
  });

  it('refuses a channel that is not one of ours', async () => {
    hub = createLocalLiveHub();
    for (const channel of ['', 'everything', `league:${leagueA}:game:nope`]) {
      expect((await listenTo(hub, channel)).status).toBe(400);
    }
    expect((await hub.serve(new Request('http://local.test/api/v1/live'))).status).toBe(400);
  });

  it('answers with an event stream that is never cached', async () => {
    hub = createLocalLiveHub();
    const answer = await listenTo(hub, gameChannelName(leagueA, game1));
    expect(answer.status).toBe(200);
    expect(answer.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
    expect(answer.headers.get('Cache-Control')).toBe('no-store, no-transform');
  });

  it('stops listening when the page goes away', async () => {
    hub = createLocalLiveHub();
    const channel = gameChannelName(leagueA, game1);
    const leaving = new AbortController();
    const stream = await listenTo(hub, channel, { signal: leaving.signal });
    expect(hub.listenerCount(channel)).toBe(1);
    leaving.abort();
    expect(hub.listenerCount(channel)).toBe(0);
    await stream.body!.cancel();

    const other = await listenTo(hub, channel);
    expect(hub.listenerCount(channel)).toBe(1);
    await other.body!.cancel();
    expect(hub.listenerCount(channel)).toBe(0);
  });

  it('ends the stream of a page that stopped reading, without holding up the rest', async () => {
    hub = createLocalLiveHub({ maxWaiting: 3 });
    const channel = gameChannelName(leagueA, game1);
    await listenTo(hub, channel); // never read
    const reader = await listenTo(hub, channel);
    const reading = readEvents(reader, 10);
    for (let n = 1; n <= 10; n += 1) await hub.publishGame(leagueA, message(n));
    expect((await reading).map((e) => (e.data as LiveMessage).sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(hub.listenerCount(channel)).toBe(0);
  });

  it('ends a stalled stream on keep-alives alone, and stops its timer', async () => {
    vi.useFakeTimers();
    try {
      hub = createLocalLiveHub({ keepAliveMs: 10, maxWaiting: 3 });
      const channel = gameChannelName(leagueA, game1);
      const stalled = await listenTo(hub, channel); // never read, and no messages sent
      expect(hub.streamCount(channel)).toBe(1);
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(100);
      expect(hub.listenerCount(channel)).toBe(0);
      expect(hub.streamCount()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      await expect(stalled.body!.getReader().read()).rejects.toThrow('fell too far behind');
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks authorize before a page may listen, and refuses when it says no', async () => {
    const asked: string[] = [];
    hub = createLocalLiveHub({
      authorize: async (channel, request) => {
        asked.push(`${channel.kind}:${channel.leagueId}:${new URL(request.url).pathname}`);
        return channel.leagueId === leagueA;
      },
    });
    const open = await listenTo(hub, gameChannelName(leagueA, game1));
    const hidden = await listenTo(hub, leagueScoresChannelName(leagueB));
    expect(open.status).toBe(200);
    expect(hidden.status).toBe(403);
    expect(asked).toEqual([
      `game:${leagueA}:/api/v1/live`,
      `league-scores:${leagueB}:/api/v1/live`,
    ]);
    expect(hub.listenerCount(leagueScoresChannelName(leagueB))).toBe(0);
    await open.body!.cancel();
  });

  it('answers 503 when authorize fails, rather than letting the page in', async () => {
    hub = createLocalLiveHub({
      authorize: () => {
        throw new Error('database down');
      },
    });
    const answer = await listenTo(hub, gameChannelName(leagueA, game1));
    expect(answer.status).toBe(503);
    expect(await answer.text()).not.toContain('database');
    expect(hub.streamCount()).toBe(0);
  });

  it('caps streams per channel and in all', async () => {
    hub = createLocalLiveHub({ maxStreamsPerChannel: 2, maxStreams: 3 });
    const a1 = gameChannelName(leagueA, game1);
    const a2 = gameChannelName(leagueA, game2);
    const first = await listenTo(hub, a1);
    await listenTo(hub, a1);
    const third = await listenTo(hub, a1);
    expect(third.status).toBe(503);
    expect(third.headers.get('Retry-After')).toBe('30');
    expect((await listenTo(hub, a2)).status).toBe(200);
    expect((await listenTo(hub, leagueScoresChannelName(leagueA))).status).toBe(503);
    expect(hub.streamCount()).toBe(3);
    // A page leaving makes room again.
    await first.body!.cancel();
    expect(hub.streamCount(a1)).toBe(1);
    expect((await listenTo(hub, a1)).status).toBe(200);
  });

  it('keeps the connection open with comments and tells the page when to retry', async () => {
    hub = createLocalLiveHub({ keepAliveMs: 5, retryMs: 1500 });
    const text = await readUntil(
      await listenTo(hub, gameChannelName(leagueA, game1)),
      ': keep-alive',
    );
    expect(text.startsWith('retry: 1500\n\n')).toBe(true);
  });

  it('still reaches everyone when one listener fails', async () => {
    hub = createLocalLiveHub();
    const channel = gameChannelName(leagueA, game1);
    const heard: number[] = [];
    hub.listen(channel, () => {
      throw new Error('broken');
    });
    hub.listen(channel, (d) => heard.push((d.payload as LiveMessage).sequence));
    await hub.publishGame(leagueA, message(1));
    expect(heard).toEqual([1]);
  });

  it('lets the same function listen twice and stop once', async () => {
    hub = createLocalLiveHub();
    const channel = gameChannelName(leagueA, game1);
    const heard: number[] = [];
    const listener = (d: LiveDelivery) => heard.push((d.payload as LiveMessage).sequence);
    const stopFirst = hub.listen(channel, listener);
    hub.listen(channel, listener);
    stopFirst();
    stopFirst();
    await hub.publishGame(leagueA, message(1));
    expect(heard).toEqual([1]);
  });

  it('refuses a message with anything its shape does not have, and sends nothing', async () => {
    hub = createLocalLiveHub();
    const heard: LiveDelivery[] = [];
    hub.listen(gameChannelName(leagueA, game1), (d) => heard.push(d));
    const withPlayers = { ...message(1), players: [{ name: 'A. Player' }] } as LiveMessage;
    await expect(hub.publishGame(leagueA, withPlayers)).rejects.toMatchObject({
      code: 'invalid-message',
      retryable: false,
    });
    await expect(hub.publishGame('not-a-league', message(1))).rejects.toBeInstanceOf(
      LivePublishError,
    );
    const scoreWithPlay = { ...leagueScoreFrom(message(1)), latestPlay: null } as never;
    await expect(hub.publishLeagueScore(leagueA, scoreWithPlay)).rejects.toMatchObject({
      code: 'invalid-message',
    });
    expect(heard).toEqual([]);
  });

  it('ends every stream when closed', async () => {
    hub = createLocalLiveHub();
    const channel = gameChannelName(leagueA, game1);
    const stream = await listenTo(hub, channel);
    hub.close();
    expect(hub.listenerCount(channel)).toBe(0);
    expect(await readEvents(stream, 1)).toEqual([]);
  });
});
