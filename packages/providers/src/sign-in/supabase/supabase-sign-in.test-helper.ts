// The Supabase adapter wired to a fake Supabase Auth and the in-memory store, with a
// clock the test moves and a capture the test reads. No network, no project (T-201).
import { expect } from 'vitest';
import type { Result } from '@srleagues/core';
import type { SignInDevice } from '../sign-in-service.ts';
import { createSignInCodeCapture } from '../local/code-capture.ts';
import { sampleLeakedPasswords } from '../local/leaked-passwords.ts';
import {
  createFakeSupabaseAuth,
  type FakeSupabaseAuthOptions,
} from './fake-supabase-auth.test-helper.ts';
import { createMemorySignInStore } from './memory-sign-in-store.ts';
import type { SupabaseSignInStore } from './sign-in-store.ts';
import { createSupabaseSignIn, type SupabaseSignInOptions } from './supabase-sign-in.ts';

export const laptop: SignInDevice = {
  deviceId: 'device-laptop-0000000001',
  label: 'Firefox on Windows',
  networkAddress: '192.0.2.10',
};
export const phone: SignInDevice = {
  deviceId: 'device-phone-00000000002',
  label: 'Safari on iPhone',
  networkAddress: '2001:db8:1:2::20',
};
export const here = laptop.networkAddress;
export const strongPassword = 'correct horse battery';
export const returnOrigin = 'http://localhost:3000';
export const projectUrl = 'https://fake-project.supabase.test';
/** Made up (T-201): never a real key. */
export const secretKey = 'sb_secret_fake_for_tests_only';

export function setup(
  overrides: Partial<
    Omit<SupabaseSignInOptions, 'fetch' | 'store' | 'projectUrl' | 'secretKey'>
  > = {},
  fakeOptions: Partial<Omit<FakeSupabaseAuthOptions, 'now' | 'secretKey'>> = {},
) {
  let at = Date.UTC(2026, 10, 13, 12);
  const now = () => new Date(at);
  const capture = createSignInCodeCapture();
  const fake = createFakeSupabaseAuth({
    now,
    secretKey,
    leakedPasswords: sampleLeakedPasswords,
    ...fakeOptions,
  });
  const { store, storeCalls } = recorded(
    createMemorySignInStore({ environment: 'test', nodeEnv: 'test', now }),
  );
  // The password time floor is measured on a clock that stands still, and its waits
  // are written down rather than waited.
  const sleeps: number[] = [];
  const sign = createSupabaseSignIn({
    projectUrl,
    secretKey,
    fetch: fake.fetch,
    store,
    codeSender: capture.sender,
    returnOrigins: [returnOrigin],
    allowLocalHttp: true,
    now,
    elapsed: () => 0,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...overrides,
  });
  const advanceSeconds = (seconds: number) => {
    at += seconds * 1000;
  };
  /** How many calls reached Supabase since `from`, by method and path without the query's values. */
  const callsSince = (from: number) =>
    fake
      .calls()
      .slice(from)
      .map((c) => `${c.method} ${c.path}`);
  return { sign, fake, store, storeCalls, sleeps, capture, advanceSeconds, callsSince };
}

/** The store, with every method call written down by name, oldest first. */
function recorded(inner: SupabaseSignInStore) {
  const calls: string[] = [];
  const wrap = <T extends object>(part: string, target: T): T =>
    new Proxy(target, {
      get(object, key, receiver) {
        const found: unknown = Reflect.get(object, key, receiver);
        if (typeof found !== 'function') return found;
        return (...args: unknown[]): unknown => {
          calls.push(`${part}.${String(key)}`);
          return Reflect.apply(found, object, args);
        };
      },
    });
  const store: SupabaseSignInStore = {
    limits: wrap('limits', inner.limits),
    codes: wrap('codes', inner.codes),
    accounts: wrap('accounts', inner.accounts),
    sessions: wrap('sessions', inner.sessions),
  };
  return { store, storeCalls: () => [...calls] };
}

export type Setup = ReturnType<typeof setup>;

/** The value of a result that must have succeeded. */
export function value<V, E extends { code: string }>(result: Result<V, E>): V {
  if (!result.ok) expect.fail(`expected success, got ${result.error.code}`);
  return result.value;
}

/** The newest captured code for an address, which must exist. */
export function codeFor(env: Setup, email: string): string {
  const code = env.capture.latestCodeFor(email);
  if (code === undefined) expect.fail(`no code captured for ${email}`);
  return code;
}

/** A proof for the address, from a sign-up code. */
export async function proofFor(env: Setup, email: string, networkAddress = here) {
  value(await env.sign.startSignUp({ email, networkAddress }));
  const code = codeFor(env, email);
  return value(await env.sign.verifyCode({ email, code, networkAddress })).proof;
}

/** Signs up an address with a password on a device, the whole way through. */
export async function signUp(
  env: Setup,
  email: string,
  password = strongPassword,
  device = laptop,
) {
  const proof = await proofFor(env, email, device.networkAddress);
  return value(await env.sign.setPassword({ proof, password, device }));
}

/** Starts and finishes a Google sign-in as `email`. */
export async function signInWithGoogle(env: Setup, email: string, device = laptop) {
  const started = value(
    await env.sign.startExternalSignIn({
      provider: 'google',
      returnAddress: `${returnOrigin}/auth/return`,
    }),
  );
  const code = env.fake.googleConsent(started.redirectTo, email);
  return value(
    await env.sign.completeExternalSignIn({
      provider: 'google',
      code,
      verifier: started.verifier,
      device,
    }),
  );
}
