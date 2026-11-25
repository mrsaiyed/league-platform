// A stand-in with two signed-up accounts, and deps that record what the email change sends
// and writes (start-own-email-change.test.ts, confirm-own-email-change.test.ts).
import { createLocalSignInStandIn, createSignInCodeCapture } from '@srleagues/providers';
import type { ConfirmOwnEmailChangeDeps } from './confirm-own-email-change.ts';
import type { OwnEmailContext, StartOwnEmailChangeDeps } from './start-own-email-change.ts';

export const here = '192.0.2.10';
export const password = 'correct horse battery';
export const ana = 'ana@example.test';
export const fresh = 'ana.new@example.test';
const laptop = { deviceId: 'device-laptop-0000000001', label: 'Firefox', networkAddress: here };
const phone = { deviceId: 'device-phone-00000000002', label: 'Safari', networkAddress: here };

export async function setup() {
  let at = Date.UTC(2026, 10, 25, 18);
  const capture = createSignInCodeCapture();
  const { service } = createLocalSignInStandIn({
    environment: 'test',
    nodeEnv: 'test',
    codeSender: capture.sender,
    returnOrigins: ['http://localhost:3000'],
    now: () => new Date(at),
  });
  const signUp = async (email: string, device = laptop) => {
    await service.startSignUp({ email, networkAddress: here });
    const code = capture.latestCodeFor(email) ?? '';
    const proof = await service.verifyCode({ email, code, networkAddress: here });
    if (!proof.ok) throw new Error('no proof');
    const made = await service.setPassword({ proof: proof.value.proof, password, device });
    if (!made.ok) throw new Error('no account');
    return made.value;
  };
  const made = await signUp(ana);
  const bo = await signUp('bo@example.test');
  const other = await service.signIn({ email: ana, password, device: phone });
  if (!other.ok) throw new Error('no second device');
  const context: OwnEmailContext = {
    accessToken: made.session.accessToken,
    networkAddress: here,
    accountId: 'our-ana',
  };
  const boContext: OwnEmailContext = {
    accessToken: bo.session.accessToken,
    networkAddress: here,
    accountId: 'our-bo',
  };
  const mails: { kind: 'asked' | 'changed'; to: string; newEmail: string }[] = [];
  const moved: { accountId: string; email: string }[] = [];
  const takenHere = new Set<string>();
  const warnings: string[] = [];
  const startDeps: StartOwnEmailChangeDeps = {
    signIn: service,
    ownEmail: { isFree: async (_id, email) => !takenHere.has(email) },
    mail: {
      emailChangeAsked: async (to, newEmail) => {
        mails.push({ kind: 'asked', to, newEmail });
      },
    },
    now: () => new Date(at),
  };
  const confirmDeps: ConfirmOwnEmailChangeDeps = {
    signIn: service,
    ownEmail: {
      change: async (accountId, email) => {
        moved.push({ accountId, email });
        return 'changed';
      },
    },
    mail: {
      emailChanged: async (to, newEmail) => {
        mails.push({ kind: 'changed', to, newEmail });
      },
    },
    now: () => new Date(at),
    warn: (message) => warnings.push(message),
  };
  const signsIn = async (email: string) =>
    (await service.signIn({ email, password, device: laptop })).ok;
  return {
    service,
    capture,
    context,
    boContext,
    other: other.value,
    mails,
    moved,
    takenHere,
    warnings,
    startDeps,
    confirmDeps,
    signsIn,
    advanceSeconds: (seconds: number) => {
      at += seconds * 1000;
    },
  };
}
