// A stand-in with a clock the test moves, a capture the test reads, and a hash that
// counts its calls.
import { expect } from 'vitest';
import type { Result } from '@srleagues/core';
import type { SignInDevice } from '../sign-in-service.ts';
import { createSignInCodeCapture } from './code-capture.ts';
import { createLocalSignInStandIn, type LocalSignInOptions } from './local-sign-in.ts';
import { scryptPasswordHasher, type PasswordHasher } from './password-hash.ts';

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

export function setup(
  overrides: Partial<Omit<LocalSignInOptions, 'environment' | 'nodeEnv'>> = {},
) {
  let at = Date.UTC(2026, 10, 13, 12);
  const capture = createSignInCodeCapture();
  const hashCalls = { hash: 0, matches: 0, matchesWithNoHash: 0 };
  const countingHasher: PasswordHasher = {
    hash: (password) => {
      hashCalls.hash++;
      return scryptPasswordHasher.hash(password);
    },
    matches: (password, stored) => {
      hashCalls.matches++;
      if (!stored) hashCalls.matchesWithNoHash++;
      return scryptPasswordHasher.matches(password, stored);
    },
  };
  const standIn = createLocalSignInStandIn({
    environment: 'test',
    nodeEnv: 'test',
    codeSender: capture.sender,
    returnOrigins: [returnOrigin],
    now: () => new Date(at),
    hasher: countingHasher,
    ...overrides,
  });
  const advanceSeconds = (seconds: number) => {
    at += seconds * 1000;
  };
  return { ...standIn, sign: standIn.service, capture, advanceSeconds, hashCalls };
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
  env.approveExternalSignIn({ verifier: started.verifier, email });
  return value(
    await env.sign.completeExternalSignIn({
      provider: 'google',
      code: new URL(started.redirectTo).searchParams.get('code') ?? '',
      verifier: started.verifier,
      device,
    }),
  );
}
