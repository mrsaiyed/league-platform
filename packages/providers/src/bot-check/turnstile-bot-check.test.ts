// The Turnstile adapter (record 081) against made-up answers shaped like Turnstile's. No
// test reaches the network: every call goes to a stand-in fetch. Not verified against the
// live service.
import { describe, expect, it } from 'vitest';
import type { BotCheckInput } from './bot-check.ts';
import { createTurnstileBotCheck, type TurnstileProblem } from './turnstile-bot-check.ts';

type Call = { url: string; init: RequestInit };

function standIn(answer: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return answer();
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const secretKey = '0x-made-up-turnstile-secret-key';
const passed = { success: true, hostname: 'leagues.example.test', action: 'sign-in' };
const input: BotCheckInput = {
  answer: 'made-up-widget-answer',
  action: 'sign-in',
  networkAddress: '192.0.2.10',
};

function check(answer: () => Response | Promise<Response>) {
  const { calls, fetch } = standIn(answer);
  const problems: TurnstileProblem[] = [];
  const botCheck = createTurnstileBotCheck({
    siteKey: '0x-made-up-site-key',
    secretKey,
    siteHostname: 'Leagues.Example.Test',
    fetch,
    onProblem: (problem) => problems.push(problem),
  });
  return { botCheck, calls, problems };
}

describe('createTurnstileBotCheck', () => {
  it('draws Turnstile’s widget from its own origin, with our public key', () => {
    expect(check(() => json(200, passed)).botCheck.widget).toEqual({
      kind: 'turnstile',
      field: 'cf-turnstile-response',
      siteKey: '0x-made-up-site-key',
      scriptUrl: 'https://challenges.cloudflare.com/turnstile/v0/api.js',
      origin: 'https://challenges.cloudflare.com',
    });
  });

  it('asks Turnstile with the secret key, the answer and the visitor’s address, and passes', async () => {
    const { botCheck, calls, problems } = check(() => json(200, passed));
    expect(await botCheck.verify(input)).toEqual({ passed: true });
    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls as [Call];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({
      secret: secretKey,
      response: 'made-up-widget-answer',
      remoteip: '192.0.2.10',
    });
    expect(problems).toEqual([]);
  });

  it('does not tell Turnstile the shared unknown network', async () => {
    const { botCheck, calls } = check(() => json(200, passed));
    await botCheck.verify({ ...input, networkAddress: '0.0.0.0' });
    expect(Object.keys(JSON.parse(String(calls[0]?.init.body)) as object).sort()).toEqual([
      'response',
      'secret',
    ]);
  });

  it('refuses an answer made on another site or for another form, though Turnstile passed it', async () => {
    for (const said of [
      { ...passed, hostname: 'evil.example' },
      { ...passed, hostname: undefined },
      { ...passed, action: 'sign-up' },
      { ...passed, action: undefined },
    ]) {
      const { botCheck, problems } = check(() => json(200, said));
      expect(await botCheck.verify(input)).toEqual({ passed: false, refusal: 'failed' });
      expect(problems).toEqual([]);
    }
  });

  it('refuses a missing answer, and one too long to be Turnstile’s, without asking it', async () => {
    const { botCheck, calls } = check(() => json(200, passed));
    expect(await botCheck.verify({ ...input, answer: '' })).toEqual({
      passed: false,
      refusal: 'missing',
    });
    expect(await botCheck.verify({ ...input, answer: 'x'.repeat(2049) })).toEqual({
      passed: false,
      refusal: 'failed',
    });
    expect(calls).toEqual([]);
  });

  it('says what went wrong in a fixed word, reports what is ours to fix, and never echoes', async () => {
    const cases: [Response | Error, string, TurnstileProblem | undefined][] = [
      [
        json(200, { success: false, 'error-codes': ['invalid-input-response'] }),
        'failed',
        undefined,
      ],
      [json(200, { success: false, 'error-codes': ['timeout-or-duplicate'] }), 'failed', undefined],
      [json(200, { success: false, 'error-codes': [] }), 'failed', undefined],
      [
        json(200, { success: false, 'error-codes': ['invalid-input-secret'] }),
        'unavailable',
        'key-refused',
      ],
      [
        json(200, { success: false, 'error-codes': ['missing-input-secret'] }),
        'unavailable',
        'key-refused',
      ],
      [
        json(200, { success: false, 'error-codes': ['internal-error'] }),
        'unavailable',
        'no-answer',
      ],
      [json(200, { success: 'yes' }), 'unavailable', 'unexpected-answer'],
      [json(500, { success: true }), 'unavailable', 'unexpected-answer'],
      [json(403, {}), 'unavailable', 'unexpected-answer'],
      [new Response('not json', { status: 200 }), 'unavailable', 'unexpected-answer'],
      [new TypeError(`fetch failed: ${secretKey}`), 'unavailable', 'no-answer'],
    ];
    for (const [answer, refusal, problem] of cases) {
      const { botCheck, problems } = check(() => {
        if (answer instanceof Error) throw answer;
        return answer;
      });
      const verdict = await botCheck.verify(input);
      expect(verdict).toEqual({ passed: false, refusal });
      expect(problems).toEqual(problem === undefined ? [] : [problem]);
      expect(JSON.stringify(verdict)).not.toContain(secretKey);
      expect(JSON.stringify(verdict)).not.toContain('made-up-widget-answer');
    }
  });

  it('gives up on a Turnstile that does not answer in time', async () => {
    const { calls, fetch } = standIn(() => new Promise<Response>(() => {}));
    const slow = (async (url: string | URL | Request, init?: RequestInit) => {
      void fetch(url, init);
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }) as typeof globalThis.fetch;
    const botCheck = createTurnstileBotCheck({
      siteKey: 'k',
      secretKey,
      siteHostname: 'leagues.example.test',
      fetch: slow,
      timeoutMs: 20,
    });
    expect(await botCheck.verify(input)).toEqual({ passed: false, refusal: 'unavailable' });
    expect(calls).toHaveLength(1);
  });
});
