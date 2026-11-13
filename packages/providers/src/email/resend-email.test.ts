// The Resend adapter (T-11) against made-up answers shaped like Resend's. No test
// reaches the network: every call goes to a stand-in fetch. Not verified against
// the live service.
import { EmailSendError, type EmailMessage } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { resendEmail } from './resend-email.ts';

const message: EmailMessage = {
  from: '"North League" <hello@example.test>',
  to: 'player@example.test',
  replyTo: 'contact@example.test',
  subject: 'You are invited',
  html: '<p>Join</p>',
  text: 'Join',
  headers: { 'List-Unsubscribe': '<https://example.test/unsubscribe>' },
  idempotencyKey: 'invitation:0190abcd-0000-7000-8000-00000000000f',
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

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('resendEmail', () => {
  it('posts the email with its key and idempotency key, and returns the id', async () => {
    const { calls, fetch } = standIn(() => json(200, { id: 're_made_up_id' }));
    const sender = resendEmail({ apiKey: 're_made_up_key', fetch, baseUrl: 'https://resend.test' });
    expect(await sender.send(message)).toEqual({ id: 're_made_up_id' });
    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls as [Call];
    expect(url).toBe('https://resend.test/emails');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer re_made_up_key',
      'Content-Type': 'application/json',
      'Idempotency-Key': message.idempotencyKey,
    });
    expect(JSON.parse(String(init.body))).toEqual({
      from: message.from,
      to: ['player@example.test'],
      subject: 'You are invited',
      html: '<p>Join</p>',
      text: 'Join',
      reply_to: 'contact@example.test',
      headers: { 'List-Unsubscribe': '<https://example.test/unsubscribe>' },
    });
  });

  it('leaves out reply-to and headers when there are none', async () => {
    const { calls, fetch } = standIn(() => json(200, { id: 'x' }));
    const { replyTo: _r, headers: _h, ...plain } = message;
    await resendEmail({ apiKey: 'k', fetch }).send(plain);
    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['from', 'html', 'subject', 'text', 'to']);
    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
  });

  it('says what went wrong, whether to try again, and nothing of the email or key', async () => {
    const cases: [Response | Error, string, boolean][] = [
      [json(429, { message: 'Too many requests' }), 'rate-limited', true],
      [json(500, { message: 'oops' }), 'unavailable', true],
      [json(503, {}), 'unavailable', true],
      [json(409, { name: 'invalid_idempotent_request' }), 'rejected', false],
      [json(401, { message: 'API key is invalid' }), 'not-authorized', true],
      [json(403, {}), 'not-authorized', true],
      [json(422, { message: 'Invalid `to` field: player@example.test' }), 'rejected', false],
      [json(400, {}), 'rejected', false],
      [json(200, { nothing: true }), 'unexpected-answer', true],
      [new Response('not json', { status: 200 }), 'unexpected-answer', true],
      [new TypeError('fetch failed: player@example.test'), 'unavailable', true],
    ];
    for (const [answer, code, retryable] of cases) {
      const { fetch } = standIn(() => {
        if (answer instanceof Error) throw answer;
        return answer;
      });
      const error = await resendEmail({ apiKey: 're_made_up_key', fetch })
        .send(message)
        .then(
          () => undefined,
          (thrown: unknown) => thrown,
        );
      expect(error).toBeInstanceOf(EmailSendError);
      expect({
        code,
        got: (error as EmailSendError).code,
        retryable: (error as EmailSendError).retryable,
      }).toEqual({
        code,
        got: code,
        retryable,
      });
      const text = `${String(error)} ${JSON.stringify(error)}`;
      expect(text).not.toMatch(/example\.test|re_made_up_key|Invalid/);
    }
  });

  it('gives up on an answer that does not come in time', async () => {
    const fetch = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as typeof globalThis.fetch;
    await expect(
      resendEmail({ apiKey: 'k', fetch, timeoutMs: 20 }).send(message),
    ).rejects.toMatchObject({ code: 'unavailable', retryable: true });
  });
});
