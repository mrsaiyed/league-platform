import { gameChannelName, leagueScoresChannelName } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { cookieValue } from './live-listen.ts';
import { sessionCookieName } from './session-cookie.ts';
import { standInLeagues, standInPeople, standInPorts } from './stand-in-ports.ts';

const ports = standInPorts({
  appEnv: 'test',
  publicBaseUrl: 'http://localhost:3000',
  log: () => {},
  emailFrom: 'scores@example.test',
});
const game = '01900000-0000-7000-8000-006a00000002';

function listen(channel: string, token?: string, method = 'GET') {
  const controller = new AbortController();
  const request = new Request(
    `http://localhost:3000/api/v1/live?channel=${encodeURIComponent(channel)}`,
    {
      method,
      signal: controller.signal,
      headers: token === undefined ? {} : { cookie: `other=1; ${sessionCookieName}=${token}` },
    },
  );
  const feed = ports.liveFeed;
  if (feed === null) throw new Error('the stand-in has a live feed');
  return { answer: feed(request), stop: () => controller.abort() };
}

async function statusOf(channel: string, token?: string, method?: string) {
  const { answer, stop } = listen(channel, token, method);
  const response = await answer;
  stop();
  await response.body?.cancel();
  return response.status;
}

describe('GET /api/v1/live on the stand-in hub', () => {
  it("lets anyone listen to a live league's channels", async () => {
    expect(await statusOf(leagueScoresChannelName(standInLeagues.live.id))).toBe(200);
    expect(await statusOf(gameChannelName(standInLeagues.live.id, game))).toBe(200);
  });

  it('lets only those who may open a draft league listen to it, as its pages do', async () => {
    const draft = leagueScoresChannelName(standInLeagues.draft.id);
    expect(await statusOf(draft)).toBe(403);
    expect(await statusOf(draft, standInPeople.stranger.token)).toBe(403);
    expect(await statusOf(draft, 'not-a-session')).toBe(403);
    expect(await statusOf(draft, standInPeople.owner.token)).toBe(200);
  });

  it('refuses a league that is not there or is in the bin, and a name that is not a channel', async () => {
    expect(await statusOf(leagueScoresChannelName(standInLeagues.inBin.id))).toBe(403);
    expect(await statusOf(leagueScoresChannelName('01900000-0000-7000-8000-0000000000ff'))).toBe(
      403,
    );
    expect(await statusOf('everything')).toBe(400);
  });

  it('only listens: a page cannot publish', async () => {
    expect(await statusOf(leagueScoresChannelName(standInLeagues.live.id), undefined, 'POST')).toBe(
      405,
    );
  });

  it('hands a listening page what the tracker publishes', async () => {
    const leagueId = standInLeagues.live.id;
    const { answer, stop } = listen(leagueScoresChannelName(leagueId));
    const response = await answer;
    const reader = response.body?.getReader();
    if (reader === undefined) throw new Error('expected a stream');
    await ports.tracker.publisher.publishLeagueScore(leagueId, {
      gameId: game,
      sequence: 1,
      sentAt: 1,
      status: 'live',
      score: { home: 2, away: 0 },
      period: 1,
    });
    let text = '';
    while (!text.includes('"sequence":1')) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
    expect(text).toContain(`"gameId":"${game}"`);
    stop();
    await reader.cancel();
  });
});

describe('cookieValue', () => {
  it('reads one cookie from a Cookie header', () => {
    expect(cookieValue('a=1; srl_session=tok%20en; b=2', 'srl_session')).toBe('tok en');
    expect(cookieValue('a=1', 'srl_session')).toBeUndefined();
    expect(cookieValue(null, 'srl_session')).toBeUndefined();
    expect(cookieValue('srl_session=%E0%A4%A', 'srl_session')).toBeUndefined();
  });
});
