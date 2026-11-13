// T-68: nothing the sign-in service answers tells a stranger whether an account
// exists. Each case runs the same steps against an address with an account and one
// without, and the answers must be equal, down to the retry times and the work done.
import { describe, expect, it } from 'vitest';
import { ok } from '@srleagues/core';
import type { SignInCodeMessage, SignInService } from '../sign-in-service.ts';
import {
  here,
  laptop,
  setup,
  signUp,
  strongPassword,
  value,
  type Setup,
} from './local-sign-in.test-helper.ts';

const member = 'ana@example.test';
const stranger = 'nobody@example.test';

/** Runs `steps` once for the member and once for the stranger, each on a fresh stand-in. */
async function both<T>(steps: (sign: SignInService, email: string, env: Setup) => Promise<T>) {
  const answers: T[] = [];
  for (const email of [member, stranger]) {
    const env = setup();
    await signUp(env, member);
    // Past the hour, so the sign-up's own code request no longer counts.
    env.advanceSeconds(2 * 60 * 60);
    answers.push(await steps(env.sign, email, env));
  }
  return answers;
}

const codes = (results: readonly { ok: boolean; error?: { code: string } }[]) =>
  results.map((r) => (r.ok ? 'ok' : r.error?.code));

describe('the same answer whether or not an account exists (T-68)', () => {
  it('when a sign-up code is asked for', async () => {
    const [a, b] = await both((sign, email) => sign.startSignUp({ email, networkAddress: here }));
    expect(a).toEqual({ ok: true, value: { codeValidMinutes: 10 } });
    expect(b).toEqual(a);
  });

  it('when a reset code is asked for', async () => {
    const [a, b] = await both((sign, email) => sign.startReset({ email, networkAddress: here }));
    expect(a).toEqual({ ok: true, value: { codeValidMinutes: 10 } });
    expect(b).toEqual(a);
  });

  it('when a reset is asked for, the sender is called and awaited either way', async () => {
    const queued = ok({ queued: true as const });
    for (const email of [member, stranger]) {
      const offered: SignInCodeMessage[] = [];
      let holding = false;
      let release = () => {};
      const env = setup({
        codeSender: {
          send: (message) => {
            offered.push(message);
            if (!holding) return Promise.resolve(queued);
            return new Promise((resolve) => {
              release = () => resolve(queued);
            });
          },
        },
      });
      await env.sign.startSignUp({ email: member, networkAddress: here });
      const code = offered.at(-1)?.code ?? '';
      const { proof } = value(
        await env.sign.verifyCode({ email: member, code, networkAddress: here }),
      );
      value(await env.sign.setPassword({ proof, password: strongPassword, device: laptop }));
      offered.length = 0;
      holding = true;

      let settled = false;
      const asking = env.sign.startReset({ email, networkAddress: here }).then((result) => {
        settled = true;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(settled, email).toBe(false);
      expect(offered, email).toHaveLength(1);
      release();
      expect(await asking).toEqual({ ok: true, value: { codeValidMinutes: 10 } });
      expect(offered[0]).toMatchObject({ to: email, purpose: 'reset' });
      expect(offered[0]?.code === null, email).toBe(email === stranger);
    }
  });

  it('when codes are asked for too often', async () => {
    const [a, b] = await both(async (sign, email, env) => {
      const results = [];
      for (let i = 0; i < 7; i++) {
        const input = { email, networkAddress: here };
        results.push(await (i % 2 ? sign.startReset(input) : sign.startSignUp(input)));
        env.advanceSeconds(10);
      }
      return results;
    });
    expect(a?.at(-1)).toEqual({
      ok: false,
      error: { code: 'too-many-attempts', retryAfterSeconds: 60 * 60 - 60 },
    });
    expect(b).toEqual(a);
  });

  it('when reset codes are guessed, used up and left to expire', async () => {
    const [a, b] = await both(async (sign, email, env) => {
      const verify = () => sign.verifyCode({ email, code: '000000', networkAddress: here });
      await sign.startReset({ email, networkAddress: here });
      const tries = [];
      for (let i = 0; i < 6; i++) tries.push(await verify());
      await sign.startReset({ email, networkAddress: here });
      tries.push(await verify());
      env.advanceSeconds(10 * 60);
      tries.push(await verify());
      return codes(tries);
    });
    // '000000' could be the member's real code once in a million runs; a real code is
    // the one thing only the mailbox can tell apart.
    expect(a).toEqual([
      'code-wrong',
      'code-wrong',
      'code-wrong',
      'code-wrong',
      'too-many-attempts',
      'too-many-attempts',
      'code-wrong',
      'code-expired',
    ]);
    expect(b).toEqual(a);
  });

  it('when a code is checked for an address that never asked for one', async () => {
    const [a, b] = await both((sign, email) =>
      sign.verifyCode({ email, code: '123456', networkAddress: here }),
    );
    expect(a).toEqual({ ok: false, error: { code: 'code-expired' } });
    expect(b).toEqual(a);
  });

  it('when a wrong password is typed, with the same hashing work', async () => {
    const work: number[] = [];
    const [a, b] = await both(async (sign, email, env) => {
      const before = env.hashCalls.matches;
      const result = await sign.signIn({ email, password: 'not the password', device: laptop });
      work.push(env.hashCalls.matches - before);
      return result;
    });
    expect(a).toEqual({ ok: false, error: { code: 'wrong-email-or-password' } });
    expect(b).toEqual(a);
    expect(work).toEqual([1, 1]);
  });

  it("when the member's own password is typed for the stranger's address", async () => {
    const env = setup();
    await signUp(env, member);
    expect(
      await env.sign.signIn({ email: stranger, password: strongPassword, device: laptop }),
    ).toEqual({ ok: false, error: { code: 'wrong-email-or-password' } });
  });

  it('when wrong guesses slow and then lock the address', async () => {
    const [a, b] = await both(async (sign, email, env) => {
      const results = [];
      for (let i = 0; i < 12; i++) {
        results.push(await sign.signIn({ email, password: 'not the password', device: laptop }));
        env.advanceSeconds(i < 5 ? 1 : 30);
      }
      return results;
    });
    expect(codes(a ?? [])).toEqual([
      ...Array(5).fill('wrong-email-or-password'),
      'too-many-attempts',
      ...Array(5).fill('wrong-email-or-password'),
      'too-many-attempts',
    ]);
    expect(b).toEqual(a);
  });

  it('when guesses arrive all at once', async () => {
    const [a, b] = await both((sign, email) =>
      Promise.all(
        Array.from({ length: 8 }, () =>
          sign.signIn({ email, password: 'not the password', device: laptop }),
        ),
      ),
    );
    expect(codes(a ?? [])).toEqual([
      ...Array(5).fill('wrong-email-or-password'),
      ...Array(3).fill('too-many-attempts'),
    ]);
    expect(b).toEqual(a);
  });

  it('when the address is not a valid one', async () => {
    const [a, b] = await both((sign) =>
      sign.signIn({ email: 'not an address', password: 'whatever it is', device: laptop }),
    );
    expect(a).toEqual({ ok: false, error: { code: 'wrong-email-or-password' } });
    expect(b).toEqual(a);
  });

  it('and only the mailbox learns the difference', async () => {
    const env = setup();
    await signUp(env, member);
    env.capture.clear();
    await env.sign.startReset({ email: member, networkAddress: here });
    await env.sign.startReset({ email: stranger, networkAddress: here });
    await env.sign.startSignUp({ email: stranger, networkAddress: here });
    expect(
      env.capture.messages().map((m) => [m.to, m.purpose, m.accountExists, m.code === null]),
    ).toEqual([
      [member, 'reset', true, false],
      [stranger, 'reset', false, true],
      [stranger, 'sign-up', false, false],
    ]);
  });
});
