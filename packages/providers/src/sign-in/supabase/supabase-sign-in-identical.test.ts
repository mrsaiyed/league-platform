// T-68 on the Supabase adapter: nothing it answers tells a stranger whether an account
// exists. Each case runs the same steps against an address with an account and one
// without; the answers must be equal, and so must the calls made to Supabase, the
// calls made to our store and the waits added to password checks (the same work, so
// timing tells nothing either). Against a fake Supabase Auth only.
import { describe, expect, it } from 'vitest';
import type { SignInService } from '../sign-in-service.ts';
import {
  here,
  laptop,
  setup,
  signUp,
  strongPassword,
  type Setup,
} from './supabase-sign-in.test-helper.ts';

const member = 'ana@example.test';
const stranger = 'nobody@example.test';

/** Runs `steps` once for the member and once for the stranger, each on a fresh setup. */
async function both<T>(steps: (sign: SignInService, email: string, env: Setup) => Promise<T>) {
  const answers: T[] = [];
  const work: string[][] = [];
  const kept: string[][] = [];
  const waits: number[][] = [];
  for (const email of [member, stranger]) {
    const env = setup();
    await signUp(env, member);
    // Past the hour, so the sign-up's own code request no longer counts.
    env.advanceSeconds(2 * 60 * 60);
    const from = env.fake.calls().length;
    const fromStore = env.storeCalls().length;
    const fromSleeps = env.sleeps.length;
    answers.push(await steps(env.sign, email, env));
    work.push(env.callsSince(from));
    kept.push(env.storeCalls().slice(fromStore));
    waits.push(env.sleeps.slice(fromSleeps));
  }
  expect(work[1]).toEqual(work[0]);
  expect(kept[1]).toEqual(kept[0]);
  expect(waits[1]).toEqual(waits[0]);
  return answers;
}

const codes = (results: readonly { ok: boolean; error?: { code: string } }[]) =>
  results.map((r) => (r.ok ? 'ok' : r.error?.code));

describe('the same answer and the same calls whether or not an account exists (T-68)', () => {
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
    // '000000' could be the member's real code once in a million runs.
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

  it('when a wrong password is typed', async () => {
    const [a, b] = await both((sign, email) =>
      sign.signIn({ email, password: 'not the password', device: laptop }),
    );
    expect(a).toEqual({ ok: false, error: { code: 'wrong-email-or-password' } });
    expect(b).toEqual(a);
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

  it('when the address is not a valid one, or the password could never be right', async () => {
    const [a, b] = await both(async (sign, email) => [
      await sign.signIn({ email: 'not an address', password: 'whatever it is', device: laptop }),
      await sign.signIn({ email, password: 'x'.repeat(73), device: laptop }),
    ]);
    expect(codes(a ?? [])).toEqual(['wrong-email-or-password', 'wrong-email-or-password']);
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
