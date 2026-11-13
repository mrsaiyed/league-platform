// The Supabase Realtime publisher (T-8) against recorded-style answers. No test
// reaches the network: every call goes to a stand-in fetch. NOT VERIFIED against
// the live service.
import {
  gameChannelName,
  leagueScoreFrom,
  leagueScoresChannelName,
  type LiveMessage,
} from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { LivePublishError } from './live-publisher.ts';
import { supabaseRealtimePublisher } from './supabase-realtime-publisher.ts';

const league = '0192f000-0000-7000-8000-00000000000a';
const game = '0192f000-0000-7000-8000-000000000001';
const secretKey = 'made-up-secret-key-for-tests';

const message: LiveMessage = {
  gameId: game,
  sequence: 12,
  sentAt: 1_700_000_000_000,
  status: 'live',
  score: { home: 20, away: 18 },
  period: 2,
  clock: { state: 'running', remainingMs: 412_000, asOf: 1_700_000_000_000 },
  teamFouls: { home: 4, away: 2 },
  latestPlay: { type: 'score', side: 'away', playerName: null, jersey: null, points: 3 },
};

type Call = { url: string; init: RequestInit };

function standIn(answer: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return answer();
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

/** Realtime's recorded answer to a broadcast: 202 Accepted, no body. */
const accepted = () => new Response(null, { status: 202 });
const refused = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('supabaseRealtimePublisher', () => {
  it("posts the game's message on its private channel with the secret key", async () => {
    const { calls, fetch } = standIn(accepted);
    const publisher = supabaseRealtimePublisher({
      url: 'https://project.supabase.test/',
      secretKey,
      fetch,
    });
    await publisher.publishGame(league, message);
    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls as [Call];
    expect(url).toBe('https://project.supabase.test/realtime/v1/api/broadcast');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ apikey: secretKey, 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({
      messages: [
        {
          topic: gameChannelName(league, game),
          event: 'update',
          payload: message,
          private: true,
        },
      ],
    });
  });

  it("posts a score on the league's channel", async () => {
    const { calls, fetch } = standIn(accepted);
    const publisher = supabaseRealtimePublisher({ url: 'https://p.test', secretKey, fetch });
    await publisher.publishLeagueScore(league, leagueScoreFrom(message));
    const body = JSON.parse(String(calls[0]?.init.body)) as {
      messages: { topic: string; payload: unknown; private: boolean }[];
    };
    expect(body.messages).toEqual([
      {
        topic: leagueScoresChannelName(league),
        event: 'update',
        payload: leagueScoreFrom(message),
        private: true,
      },
    ]);
  });

  it('takes any success as published', async () => {
    const { fetch } = standIn(() => new Response('{}', { status: 200 }));
    const publisher = supabaseRealtimePublisher({ url: 'https://p.test', secretKey, fetch });
    await expect(publisher.publishGame(league, message)).resolves.toBeUndefined();
  });

  it.each([
    [401, 'not-authorized', false],
    [403, 'not-authorized', false],
    [429, 'rate-limited', true],
    [400, 'rejected', false],
    [413, 'rejected', false],
    [500, 'unavailable', true],
    [503, 'unavailable', true],
  ] as const)('turns status %i into %s', async (status, code, retryable) => {
    const { fetch } = standIn(() =>
      refused(status, { message: `Invalid key ${secretKey}`, topic: 'x' }),
    );
    const publisher = supabaseRealtimePublisher({ url: 'https://p.test', secretKey, fetch });
    const error = await publisher.publishGame(league, message).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(LivePublishError);
    expect(error).toMatchObject({ code, retryable, status });
    // Never the answer's text, never the key.
    expect(String((error as Error).message)).not.toContain(secretKey);
    expect(String((error as Error).message)).not.toContain('Invalid');
  });

  it('says unavailable when the service cannot be reached or does not answer', async () => {
    const { fetch } = standIn(() => {
      throw new TypeError(`fetch failed for ${secretKey}`);
    });
    const publisher = supabaseRealtimePublisher({ url: 'https://p.test', secretKey, fetch });
    await expect(publisher.publishGame(league, message)).rejects.toMatchObject({
      code: 'unavailable',
      retryable: true,
      status: undefined,
    });
  });

  it('sends nothing for a message with anything its shape does not have', async () => {
    const { calls, fetch } = standIn(accepted);
    const publisher = supabaseRealtimePublisher({ url: 'https://p.test', secretKey, fetch });
    const leaky = { ...message, players: [{ name: 'A. Player', birthDate: '2010-01-01' }] };
    await expect(publisher.publishGame(league, leaky as LiveMessage)).rejects.toMatchObject({
      code: 'invalid-message',
    });
    await expect(publisher.publishGame('not-a-league', message)).rejects.toMatchObject({
      code: 'invalid-message',
    });
    expect(calls).toEqual([]);
  });
});
