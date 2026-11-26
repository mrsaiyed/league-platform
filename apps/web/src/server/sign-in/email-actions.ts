'use server';
// "Change my email" on the account page (T-73, step 2.128, T-457): one action for both
// halves, told apart by the form's `step`. The account is the session's, read from its
// cookie (T-23), never from the form. What comes back to the page never holds a password
// nor a code: only the address typed, which box was wrong and why. A change refreshes the
// page, so "Signed in as" and the devices list show it at once with scripts on.
import { platformUrl } from '@srleagues/core';
import { consoleSink, createLogger } from '@srleagues/observability';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ChangeEmailFormState } from '../../features/sign-in/change-email-state.ts';
import { getConfig } from '../config.ts';
import { webPorts } from '../container.ts';
import { confirmOwnEmailChange } from './confirm-own-email-change.ts';
import { cookieNames } from './cookies.ts';
import { flowDeps, nextVisit } from './next-visit.ts';
import { screenUrl } from './problems.ts';
import { startOwnEmailChange } from './start-own-email-change.ts';

const startProblem = {
  'wrong-password': 'wrongPassword',
  'no-password': 'noPassword',
  'invalid-email': 'invalid',
  'same-email': 'same',
  'code-not-sent': 'notSent',
  'too-many-attempts': 'tooManyAttempts',
} as const;

const confirmProblem = {
  'code-wrong': 'codeWrong',
  'code-expired': 'codeExpired',
  'too-many-attempts': 'tooManyAttempts',
} as const;

const minutesOf = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

export async function changeEmailAction(
  state: ChangeEmailFormState,
  form: FormData,
): Promise<ChangeEmailFormState> {
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
  };
  const visit = await nextVisit();
  const ports = await webPorts();
  const accessToken = visit.jar.get(cookieNames.session) ?? '';
  const context = {
    accessToken,
    networkAddress: visit.networkAddress,
    accountId: accessToken === '' ? undefined : await ports.ownName.accountOf(accessToken),
  };
  const deps = { ...(await flowDeps()), ownEmail: ports.ownEmail };
  const round = state.round + 1;
  const signedOut = () =>
    redirect(screenUrl('signin', { problem: 'signInAgain', next: platformUrl('account') }));

  if (field('step') === 'code') {
    const changed = await confirmOwnEmailChange(
      context,
      { code: field('code') },
      {
        ...deps,
        // With no address and no code (T-86), for whoever puts it right (T-458).
        warn: (message) =>
          createLogger({
            sink: consoleSink,
            level: getConfig().LOG_LEVEL,
            base: { app: 'web' },
          }).warn(message, {}),
      },
    );
    if (!changed.ok) {
      const error = changed.error;
      if (error.code === 'signed-out') signedOut();
      if (error.code === 'signed-out') return state;
      const waitMinutes =
        error.code === 'too-many-attempts' && error.retryAfterSeconds > 0
          ? minutesOf(error.retryAfterSeconds)
          : 0;
      // A code used up asks for a new one, as an expired one does.
      const problem =
        error.code === 'too-many-attempts' && waitMinutes === 0
          ? 'codeExpired'
          : confirmProblem[error.code];
      return { ...state, changedTo: null, problem, box: 'code', waitMinutes, round };
    }
    refresh();
    return {
      sentTo: null,
      changedTo: changed.value.newEmail,
      problem: null,
      box: null,
      waitMinutes: 0,
      round,
    };
  }

  const started = await startOwnEmailChange(
    context,
    { newEmail: field('newEmail'), password: field('password') },
    deps,
  );
  if (!started.ok) {
    const error = started.error;
    if (error.code === 'signed-out') signedOut();
    if (error.code === 'signed-out') return state;
    const waitMinutes = error.code === 'too-many-attempts' ? minutesOf(error.retryAfterSeconds) : 0;
    return {
      sentTo: null,
      changedTo: null,
      problem: startProblem[error.code],
      box: error.box,
      waitMinutes,
      round,
    };
  }
  return {
    sentTo: started.value.newEmail,
    changedTo: null,
    problem: null,
    box: null,
    waitMinutes: 0,
    round,
  };
}
