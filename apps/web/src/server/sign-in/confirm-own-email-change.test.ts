// confirmOwnEmailChange (T-73, T-457): a right code changes the email, ends the other
// devices and tells the old address once; every other code changes nothing.
import { describe, expect, it } from 'vitest';
import { confirmOwnEmailChange } from './confirm-own-email-change.ts';
import { ana, fresh, password, setup } from './own-email-change.test-helper.ts';
import { startOwnEmailChange } from './start-own-email-change.ts';

type Env = Awaited<ReturnType<typeof setup>>;
const ask = async (env: Env) => {
  const started = await startOwnEmailChange(
    env.context,
    { newEmail: fresh, password },
    env.startDeps,
  );
  if (!started.ok) throw new Error(started.error.code);
  return env.capture.latestCodeFor(fresh) ?? '';
};
const wrongOf = (code: string) => (code === '000000' ? '111111' : '000000');
const confirm = (env: Env, code: string, context = env.context) =>
  confirmOwnEmailChange(context, { code }, env.confirmDeps);
const unchanged = async (env: Env) => {
  expect(env.moved).toEqual([]);
  expect(env.mails.filter((m) => m.kind === 'changed')).toEqual([]);
  expect(await env.signsIn(ana)).toBe(true);
  expect(await env.signsIn(fresh)).toBe(false);
};

describe('typing the code from the new address (T-73)', () => {
  it('a wrong code changes nothing; the right one changes the email, ends the other devices, tells the old address once', async () => {
    const env = await setup();
    const code = await ask(env);
    expect(await confirm(env, wrongOf(code))).toEqual({ ok: false, error: { code: 'code-wrong' } });
    await unchanged(env);
    const changed = await confirm(env, code);
    expect(changed.ok && changed.value.newEmail).toBe(fresh);
    expect(env.moved).toEqual([{ accountId: 'our-ana', email: fresh }]);
    expect(env.mails.filter((m) => m.kind === 'changed')).toEqual([
      { kind: 'changed', to: ana, newEmail: fresh },
    ]);
    expect((await env.service.identify({ accessToken: env.other.session.accessToken })).ok).toBe(
      false,
    );
    expect(await env.signsIn(fresh)).toBe(true);
    expect(await env.signsIn(ana)).toBe(false);
  });

  it('a code spent changes nothing more', async () => {
    const env = await setup();
    const code = await ask(env);
    expect((await confirm(env, code)).ok).toBe(true);
    expect(await confirm(env, code)).toEqual({ ok: false, error: { code: 'code-expired' } });
    expect(env.moved).toHaveLength(1);
    expect(env.mails.filter((m) => m.kind === 'changed')).toHaveLength(1);
  });

  it('an expired code, one used up, and one asked by another account change nothing', async () => {
    const expired = await setup();
    const late = await ask(expired);
    expired.advanceSeconds(10 * 60);
    expect(await confirm(expired, late)).toEqual({ ok: false, error: { code: 'code-expired' } });
    await unchanged(expired);

    const another = await setup();
    const anas = await ask(another);
    expect(await confirm(another, anas, another.boContext)).toEqual({
      ok: false,
      error: { code: 'code-expired' },
    });
    await unchanged(another);

    const usedUp = await setup();
    const right = await ask(usedUp);
    for (let i = 0; i < 4; i++) await confirm(usedUp, wrongOf(right));
    expect((await confirm(usedUp, wrongOf(right))).ok).toBe(false);
    expect(await confirm(usedUp, right)).toMatchObject({
      ok: false,
      error: { code: 'too-many-attempts' },
    });
    await unchanged(usedUp);
  });
});
