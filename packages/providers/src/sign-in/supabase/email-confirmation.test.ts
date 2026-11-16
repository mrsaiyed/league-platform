// Step 2.115: how Supabase's "Confirm email" setting is read, against the fake Supabase
// Auth and handwritten answers. No network, no project (T-201).
import { describe, expect, it } from 'vitest';
import type { EmailConfirmation } from '../sign-in-service.ts';
import type { FetchLike } from './gotrue-client.ts';
import { createSupabaseEmailConfirmation } from './email-confirmation.ts';
import { createFakeSupabaseAuth } from './fake-supabase-auth.test-helper.ts';
import { projectUrl, secretKey, setup } from './supabase-sign-in.test-helper.ts';

/** The question alone, asked of a Supabase that answers every call with `answer`. */
function askingOf(answer: () => Response | Promise<Response>) {
  const seen: { url: string; init: Parameters<FetchLike>[1] }[] = [];
  const fetch: FetchLike = async (url, init) => {
    seen.push({ url, init });
    return answer();
  };
  return { question: createSupabaseEmailConfirmation({ projectUrl, secretKey, fetch }), seen };
}

const settings = (fields: Record<string, unknown>) =>
  Response.json({ external: { email: true }, disable_signup: false, ...fields });

describe('the Supabase adapter: does Supabase confirm email addresses? (step 2.115)', () => {
  it('answers on when the project has "Confirm email" on', async () => {
    const env = setup();
    expect(await env.sign.emailConfirmation()).toBe('on');
    expect(env.callsSince(0)).toEqual(['GET /settings']);
  });

  it('answers off when Supabase takes any address typed as proved', async () => {
    const env = setup({}, { mailerAutoconfirm: true });
    expect(await env.sign.emailConfirmation()).toBe('off');
  });

  it('answers unknown, never on, when Supabase refuses, is down or does not answer', async () => {
    const refused = setup();
    refused.fake.override('GET', '/settings', () =>
      Response.json({ code: 'no_api_key', message: 'No API key found' }, { status: 401 }),
    );
    expect(await refused.sign.emailConfirmation()).toEqual({ unknown: 'key-refused', status: 401 });

    const down = setup();
    down.fake.override('GET', '/settings', () => new Response('busy', { status: 503 }));
    expect(await down.sign.emailConfirmation()).toEqual({
      unknown: 'unexpected-answer',
      status: 503,
    });

    // No answer in time: the timer fires at once, and the call never answers.
    const never: FetchLike = () => new Promise<Response>(() => {});
    const timedOut = createSupabaseEmailConfirmation({
      projectUrl,
      secretKey,
      fetch: never,
      startTimer: (_ms, fire) => {
        queueMicrotask(fire);
        return () => {};
      },
    });
    expect(await timedOut.emailConfirmation()).toEqual({ unknown: 'no-answer-in-time' });
  });
});

describe('the question alone, before the adapter is built (step 2.115)', () => {
  it('asks the project settings with the key the app already holds, and nothing else', async () => {
    const { question, seen } = askingOf(() => settings({ mailer_autoconfirm: false }));
    expect(await question.emailConfirmation()).toBe('on');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe(`${projectUrl}/auth/v1/settings`);
    expect(seen[0]?.init.method).toBe('GET');
    expect(seen[0]?.init.body).toBeUndefined();
    expect(seen[0]?.init.headers).toMatchObject({ apikey: secretKey });
  });

  it('gives the same answers as the adapter against the fake Supabase', async () => {
    for (const [mailerAutoconfirm, expected] of [
      [false, 'on'],
      [true, 'off'],
    ] as const) {
      const fake = createFakeSupabaseAuth({ now: () => new Date(), secretKey, mailerAutoconfirm });
      const question = createSupabaseEmailConfirmation({
        projectUrl,
        secretKey,
        fetch: fake.fetch,
      });
      expect(await question.emailConfirmation()).toBe(expected);
    }
  });

  it('reads only a plain yes or no: every other shape of answer is unknown, with its kind', async () => {
    const missing: EmailConfirmation = { unknown: 'setting-missing' };
    const answers: [() => Response, EmailConfirmation][] = [
      [() => settings({ mailer_autoconfirm: false }), 'on'],
      [() => settings({ mailer_autoconfirm: true }), 'off'],
      [() => settings({}), missing],
      [() => settings({ mailer_autoconfirm: null }), missing],
      [() => settings({ mailer_autoconfirm: 'false' }), missing],
      [() => settings({ mailer_autoconfirm: 0 }), missing],
      [() => Response.json([{ mailer_autoconfirm: false }]), missing],
      [() => Response.json(null), missing],
      [() => new Response('<html>not json</html>', { status: 200 }), missing],
      [() => new Response(null, { status: 204 }), missing],
      [
        () => Response.json({ code: 'not_found' }, { status: 404 }),
        { unknown: 'unexpected-answer', status: 404 },
      ],
      [
        () => Response.json({ code: 'bad_jwt' }, { status: 403 }),
        { unknown: 'key-refused', status: 403 },
      ],
      [
        () => Response.json({ code: 'no_api_key' }, { status: 401 }),
        { unknown: 'key-refused', status: 401 },
      ],
      [() => new Response('down', { status: 500 }), { unknown: 'unexpected-answer', status: 500 }],
      [() => new Response(null, { status: 302 }), { unknown: 'unexpected-answer', status: 302 }],
    ];
    for (const [answer, expected] of answers) {
      const { question } = askingOf(answer);
      expect(await question.emailConfirmation()).toEqual(expected);
    }
  });

  it('keeps nothing of the answer but its status: never its words, the key or an address', async () => {
    const words = `No API key found for ${projectUrl} with ${secretKey}, ask ana@example.test`;
    for (const status of [200, 302, 401, 404, 500]) {
      const { question } = askingOf(() =>
        Response.json(
          { code: words, message: words, mailer_autoconfirm: words },
          { status, headers: { 'x-sb-error-code': words } },
        ),
      );
      const answer = await question.emailConfirmation();
      const said = JSON.stringify(answer);
      for (const secret of [projectUrl, secretKey, 'ana@', 'No API key']) {
        expect(said).not.toContain(secret);
      }
      expect(answer).not.toBe('on');
    }
  });

  it('answers unknown when there is no connection, or the answer is cut off', async () => {
    const question = createSupabaseEmailConfirmation({
      projectUrl,
      secretKey,
      fetch: () => Promise.reject(new Error(`connect failed for ${projectUrl}`)),
    });
    expect(await question.emailConfirmation()).toEqual({ unknown: 'no-connection' });

    const cutOff = createSupabaseEmailConfirmation({
      projectUrl,
      secretKey,
      fetch: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error(`reset by ${projectUrl}`));
            },
          }),
        ),
    });
    expect(await cutOff.emailConfirmation()).toEqual({ unknown: 'no-connection' });
  });

  it('refuses a project address that is not https, and a missing key, before asking', () => {
    const fetch: FetchLike = () => Promise.reject(new Error('never called'));
    expect(() =>
      createSupabaseEmailConfirmation({ projectUrl: 'http://localhost:54321', secretKey, fetch }),
    ).toThrow('must use https');
    expect(() => createSupabaseEmailConfirmation({ projectUrl, secretKey: '', fetch })).toThrow(
      'secret key is missing',
    );
  });
});
