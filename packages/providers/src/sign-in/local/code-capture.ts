// Catches sign-in emails instead of sending them, so tests and local work can read
// the codes. Nothing leaves the machine. Not for production.
import { ok } from '@srleagues/core';
import type { SignInCodeMessage, SignInCodeSender } from '../sign-in-service.ts';

export type SignInCodeCapture = {
  readonly sender: SignInCodeSender;
  /** Every message caught, oldest first, including those with no code. */
  readonly messages: () => readonly SignInCodeMessage[];
  /** The newest code sent to this address, if any. */
  readonly latestCodeFor: (email: string) => string | undefined;
  readonly clear: () => void;
};

export function createSignInCodeCapture(): SignInCodeCapture {
  const caught: SignInCodeMessage[] = [];
  return {
    sender: {
      send: async (message) => {
        caught.push(message);
        return ok({ queued: true as const });
      },
    },
    messages: () => [...caught],
    latestCodeFor: (email) => {
      const address = email.trim().toLowerCase();
      return caught.findLast((m) => m.to === address && m.code !== null)?.code ?? undefined;
    },
    clear: () => {
      caught.length = 0;
    },
  };
}
