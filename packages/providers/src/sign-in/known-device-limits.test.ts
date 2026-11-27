// T-504, T-506, T-507, T-509, T-510, T-511, T-522 on both adapters: the local stand-in and the
// Supabase adapter (against the fake Supabase Auth and the in-memory store) count alike.
// A stranger's wrong passwords and wrong codes do not shut out a device the app vouches
// for, nor spoil its waiting code; every ask for a code, a known device's too, meets the
// address's and the network's numbers; one network may ask for many codes; a flood of
// wrong passwords from a network leaves its codes alone.
import { describe, expect, it } from 'vitest';
import type { SignInDevice } from '@srleagues/contracts';
import * as local from './local/local-sign-in.test-helper.ts';
import type { SignInService } from './sign-in-service.ts';
import * as supabase from './supabase/supabase-sign-in.test-helper.ts';

type Env = {
  readonly sign: SignInService;
  readonly advanceSeconds: (seconds: number) => void;
  readonly capture: { readonly latestCodeFor: (email: string) => string | undefined };
};

const adapters: readonly (readonly [string, () => Env])[] = [
  ['the local stand-in', () => local.setup()],
  ['the Supabase adapter', () => supabase.setup()],
];

const member = 'ana@example.test';
const password = local.strongPassword;
const elsewhere = '198.51.100.7';
const laptop = local.laptop;
const here = laptop.networkAddress;
const device = (n: number, networkAddress = here): SignInDevice => ({
  deviceId: `device-made-up-${String(n).padStart(10, '0')}`,
  label: 'Chrome on Android',
  networkAddress,
});
const stranger = device(1, elsewhere);
const newPhone = device(2);

const outcome = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'ok' : r.error?.code);

function codeFor(env: Env, email: string): string {
  const code = env.capture.latestCodeFor(email);
  if (code === undefined) expect.fail(`no code captured for ${email}`);
  return code;
}

async function createAccount(env: Env, email: string, on: SignInDevice) {
  const asked = await env.sign.startSignUp({ email, networkAddress: on.networkAddress });
  const checked = await env.sign.verifyCode({
    email,
    code: codeFor(env, email),
    networkAddress: on.networkAddress,
  });
  if (!checked.ok) return [outcome(asked), outcome(checked)];
  const set = await env.sign.setPassword({ proof: checked.value.proof, password, device: on });
  return [outcome(asked), outcome(checked), outcome(set)];
}

/** Ten wrong passwords for `email` from `on`, waiting out each slow-down. */
async function tenWrong(env: Env, email: string, on: SignInDevice, knownDevice?: string) {
  const answers = [];
  for (let i = 0; i < 10; i++) {
    answers.push(
      outcome(await env.sign.signIn({ email, password: 'not it at all', device: on, knownDevice })),
    );
    env.advanceSeconds(30);
  }
  return answers;
}

describe.each(adapters)('on %s', (_name, setup) => {
  async function withMember() {
    const env = setup();
    expect(await createAccount(env, member, laptop)).toEqual(['ok', 'ok', 'ok']);
    // Past the hour, so the sign-up's own code no longer counts.
    env.advanceSeconds(2 * 60 * 60);
    return env;
  }

  it("a stranger's ten wrong passwords do not shut out a device that signed in before (T-504)", async () => {
    const env = await withMember();
    expect(await tenWrong(env, member, stranger)).toEqual(
      Array(10).fill('wrong-email-or-password'),
    );
    // An unknown device meets the address's lock, as before.
    expect(await env.sign.signIn({ email: member, password, device: newPhone })).toEqual({
      ok: false,
      error: { code: 'too-many-attempts', retryAfterSeconds: 15 * 60 - 30 },
    });
    // The device the app vouches for is not counted with the stranger.
    const known = await env.sign.signIn({
      email: member,
      password,
      device: laptop,
      knownDevice: laptop.deviceId,
    });
    expect(outcome(known)).toBe('ok');
  });

  it("a known device's own wrong passwords meet the same numbers, on a count of their own", async () => {
    const env = await withMember();
    await tenWrong(env, member, laptop, laptop.deviceId);
    const again = { email: member, password, device: laptop, knownDevice: laptop.deviceId };
    expect(outcome(await env.sign.signIn(again))).toBe('too-many-attempts');
    // Nobody else is shut out by it.
    expect(outcome(await env.sign.signIn({ email: member, password, device: newPhone }))).toBe(
      'ok',
    );
  });

  it('20 made-up device ids send no more codes to one address than an unknown device could (T-509)', async () => {
    const env = await withMember();
    const asksBy20 = async (networkAddress: string) => {
      const answers = [];
      for (let d = 0; d < 20; d++) {
        const knownDevice = device(500 + d).deviceId;
        for (let i = 0; i < 6; i++) {
          const asked = await env.sign.startReset({ email: member, networkAddress, knownDevice });
          answers.push(outcome(asked));
        }
      }
      return answers;
    };
    // With the network's 200 used up, a known device is refused there like a stranger.
    for (let i = 0; i < 200; i++) {
      await env.sign.startReset({ email: `p${i}@example.test`, networkAddress: here });
    }
    expect(outcome(await env.sign.startReset({ email: member, networkAddress: here }))).toBe(
      'too-many-attempts',
    );
    expect((await asksBy20(here)).filter((a) => a === 'ok')).toHaveLength(0);
    // On another network, the 20 together have the address's 5, as one unknown device.
    expect((await asksBy20(elsewhere)).filter((a) => a === 'ok')).toHaveLength(5);
    expect(outcome(await env.sign.startReset({ email: member, networkAddress: elsewhere }))).toBe(
      'too-many-attempts',
    );
  });

  it("a stranger's ask while a known device's code waits is answered as for no account (T-510, T-511)", async () => {
    // The look's attack, once at the member's address and once at an address with no
    // account, each on its own setup where the member is mid-reset on the laptop.
    const attack = async (email: string) => {
      const env = await withMember();
      const vouched = { email: member, networkAddress: here, knownDevice: laptop.deviceId };
      expect(outcome(await env.sign.startReset(vouched))).toBe('ok');
      const owners = codeFor(env, member);
      env.advanceSeconds(5 * 60);
      // A stranger on another network asks, then types the owner's code and wrong ones.
      const strangers = { email, networkAddress: elsewhere };
      const seen = [outcome(await env.sign.startReset(strangers))];
      expect(codeFor(env, member)).toBe(owners);
      const wrong = owners === '000000' ? '111111' : '000000';
      seen.push(outcome(await env.sign.verifyCode({ ...strangers, code: owners })));
      for (let i = 0; i < 5; i++) {
        seen.push(outcome(await env.sign.verifyCode({ ...strangers, code: wrong })));
      }
      // The owner's code is untouched; the stranger's entry keeps its own expiry, 10
      // minutes from its own ask, not the owner's.
      expect(outcome(await env.sign.verifyCode({ ...vouched, code: owners }))).toBe('ok');
      env.advanceSeconds(5 * 60 + 1);
      seen.push(outcome(await env.sign.verifyCode({ ...strangers, code: wrong })));
      env.advanceSeconds(5 * 60);
      seen.push(outcome(await env.sign.verifyCode({ ...strangers, code: wrong })));
      return seen;
    };
    const atMember = await attack(member);
    expect(atMember).toEqual([
      'ok',
      ...Array(4).fill('code-wrong'),
      'too-many-attempts',
      'too-many-attempts',
      'too-many-attempts',
      'code-expired',
    ]);
    expect(await attack('nobody@example.test')).toEqual(atMember);
  });

  it("the owner's new password leaves a stranger's held entry answering as for no account (T-522)", async () => {
    // The look's attack: the member is mid-reset on the laptop, a stranger's ask is held,
    // and the owner then sets a password. At the member's address the stranger's entry
    // keeps its attempts and expiry with no code, as at an address with no account.
    const attack = async (email: string) => {
      const env = await withMember();
      const vouched = { email: member, networkAddress: here, knownDevice: laptop.deviceId };
      expect(outcome(await env.sign.startReset(vouched))).toBe('ok');
      const owners = codeFor(env, member);
      env.advanceSeconds(60);
      const strangers = { email, networkAddress: elsewhere };
      const seen = [outcome(await env.sign.startReset(strangers))];
      const wrong = owners === '000000' ? '111111' : '000000';
      seen.push(outcome(await env.sign.verifyCode({ ...strangers, code: wrong })));
      const checked = await env.sign.verifyCode({ ...vouched, code: owners });
      if (!checked.ok) expect.fail('the owner could not use their own code');
      const set = await env.sign.setPassword({
        proof: checked.value.proof,
        password,
        device: laptop,
      });
      expect(outcome(set)).toBe('ok');
      for (let i = 0; i < 4; i++) {
        seen.push(outcome(await env.sign.verifyCode({ ...strangers, code: wrong })));
      }
      // Ten minutes from the stranger's own ask, not from the new password.
      env.advanceSeconds(10 * 60);
      seen.push(outcome(await env.sign.verifyCode({ ...strangers, code: wrong })));
      return seen;
    };
    const atMember = await attack(member);
    expect(atMember).toEqual([
      'ok',
      ...Array(4).fill('code-wrong'),
      'too-many-attempts',
      'code-expired',
    ]);
    expect(await attack('nobody@example.test')).toEqual(atMember);
  });

  it('a flood of wrong passwords from one network leaves codes and known devices there (T-506)', async () => {
    const env = await withMember();
    for (let i = 0; i < 100; i++) {
      const email = `p${i}@example.test`;
      await env.sign.signIn({ email, password: 'not it at all', device: device(100 + i) });
      env.advanceSeconds(5);
    }
    // The network's password lock holds for an unknown device, a right password included.
    expect(outcome(await env.sign.signIn({ email: member, password, device: newPhone }))).toBe(
      'too-many-attempts',
    );
    const known = { email: member, password, device: laptop, knownDevice: laptop.deviceId };
    expect(outcome(await env.sign.signIn(known))).toBe('ok');
    // Typing a code is not behind the passwords' lock: a newcomer there gets in.
    expect(await createAccount(env, 'newcomer@example.test', device(3))).toEqual([
      'ok',
      'ok',
      'ok',
    ]);
  });

  it('31 made-up people on one network each create an account in one hour (T-507)', async () => {
    const env = setup();
    const made = [];
    for (let i = 0; i < 31; i++) {
      made.push(await createAccount(env, `parent${i}@example.test`, device(10 + i)));
      env.advanceSeconds(60);
    }
    expect(made).toEqual(Array(31).fill(['ok', 'ok', 'ok']));
    // One address from an unknown device still has its 5 codes an hour, as before.
    const asks = [];
    for (let i = 0; i < 5; i++) {
      const input = { email: 'parent30@example.test', networkAddress: here };
      asks.push(outcome(await env.sign.startReset(input)));
    }
    expect(asks).toEqual(['ok', 'ok', 'ok', 'ok', 'too-many-attempts']);
  });

  it('refuses a known device that is not a device id: the app made a mistake', async () => {
    const env = setup();
    await expect(
      env.sign.startReset({ email: member, networkAddress: here, knownDevice: 'short' }),
    ).rejects.toThrow(TypeError);
  });
});
