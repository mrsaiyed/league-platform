import { describe, expect, it } from 'vitest';
import { createLocalSignInStandIn, createSignInCodeCapture } from '@srleagues/providers';
import { changeOwnPassword, type ChangeOwnPasswordDeps } from './change-own-password.ts';

const here = '192.0.2.10';
const oldOne = 'correct horse battery';
const newOne = 'a brand new passphrase';
const laptop = { deviceId: 'device-laptop-0000000001', label: 'Firefox', networkAddress: here };
const phone = { deviceId: 'device-phone-00000000002', label: 'Safari', networkAddress: here };
const at = new Date(Date.UTC(2026, 10, 25, 18));

async function setup() {
  const capture = createSignInCodeCapture();
  const { service } = createLocalSignInStandIn({
    environment: 'test',
    nodeEnv: 'test',
    codeSender: capture.sender,
    returnOrigins: ['http://localhost:3000'],
    now: () => at,
  });
  const email = 'ana@example.test';
  await service.startSignUp({ email, networkAddress: here });
  const code = capture.latestCodeFor(email) ?? '';
  const proof = await service.verifyCode({ email, code, networkAddress: here });
  if (!proof.ok) throw new Error('no proof');
  const made = await service.setPassword({
    proof: proof.value.proof,
    password: oldOne,
    device: laptop,
  });
  if (!made.ok) throw new Error('no account');
  const other = await service.signIn({ email, password: oldOne, device: phone });
  if (!other.ok) throw new Error('no second device');
  const sent: { to: string; at: Date }[] = [];
  const deps: ChangeOwnPasswordDeps = {
    signIn: service,
    mail: {
      passwordChanged: async (to, when) => {
        sent.push({ to, at: when });
      },
    },
    now: () => at,
  };
  const context = { accessToken: made.value.session.accessToken, networkAddress: here };
  const signInWith = (password: string) => service.signIn({ email, password, device: phone });
  return { service, deps, context, sent, other: other.value.session, signInWith };
}

describe('changeOwnPassword (T-85, step 2.128)', () => {
  it('refuses a wrong old password, says it is that box, and changes and sends nothing', async () => {
    const env = await setup();
    const answer = await changeOwnPassword(
      env.context,
      { oldPassword: 'not my password', newPassword: newOne },
      env.deps,
    );
    expect(answer).toEqual({ ok: false, error: { code: 'wrong-password', box: 'oldPassword' } });
    expect(env.sent).toEqual([]);
    expect((await env.service.identify({ accessToken: env.other.accessToken })).ok).toBe(true);
    expect((await env.signInWith(oldOne)).ok).toBe(true);
  });

  it('refuses a weak new password by the sign-up rule, saying it is that box', async () => {
    const env = await setup();
    const change = (newPassword: string) =>
      changeOwnPassword(env.context, { oldPassword: oldOne, newPassword }, env.deps);
    expect(await change('short')).toEqual({
      ok: false,
      error: { code: 'password-too-short', box: 'newPassword' },
    });
    expect(await change('password123')).toEqual({
      ok: false,
      error: { code: 'password-leaked', box: 'newPassword' },
    });
    expect(env.sent).toEqual([]);
    expect((await env.signInWith(oldOne)).ok).toBe(true);
  });

  it('ends the other sessions, keeps this one, and emails the account once', async () => {
    const env = await setup();
    const answer = await changeOwnPassword(
      env.context,
      { oldPassword: oldOne, newPassword: newOne },
      env.deps,
    );
    expect(answer).toEqual({ ok: true, value: { endedSessions: 1 } });
    expect((await env.service.identify({ accessToken: env.context.accessToken })).ok).toBe(true);
    const other = await env.service.identify({ accessToken: env.other.accessToken });
    expect(other).toEqual({ ok: false, error: { code: 'session-ended' } });
    expect(env.sent).toEqual([{ to: 'ana@example.test', at }]);
    expect((await env.signInWith(oldOne)).ok).toBe(false);
    expect((await env.signInWith(newOne)).ok).toBe(true);
  });

  it('limits wrong old passwords as sign-in does, and answers a signed-out device', async () => {
    const env = await setup();
    const wrong = () =>
      changeOwnPassword(env.context, { oldPassword: 'wrong', newPassword: newOne }, env.deps);
    for (let i = 0; i < 5; i++) await wrong();
    const limited = await wrong();
    expect(limited.ok ? null : limited.error.code).toBe('too-many-attempts');
    const signedOut = await changeOwnPassword(
      { accessToken: '', networkAddress: here },
      { oldPassword: oldOne, newPassword: newOne },
      env.deps,
    );
    expect(signedOut).toEqual({ ok: false, error: { code: 'signed-out', box: null } });
    expect(env.sent).toEqual([]);
  });
});
