'use server';
// "Change my password" on the account page (T-85, step 2.128). The account is the session's,
// read from its cookie (T-23), never from the form. What comes back to the page never holds a
// password: only which box was wrong and why.
import { platformUrl } from '@srleagues/core';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ChangePasswordFormState } from '../../features/sign-in/change-password-state.ts';
import { changeOwnPassword, type ChangeOwnPasswordError } from './change-own-password.ts';
import { cookieNames } from './cookies.ts';
import { flowDeps, nextVisit } from './next-visit.ts';
import { screenUrl } from './problems.ts';

const problemOf = {
  'wrong-password': 'wrongOld',
  'no-password': 'noPassword',
  'password-too-short': 'tooShort',
  'password-too-long': 'tooLong',
  'password-leaked': 'leaked',
  'too-many-attempts': 'tooManyAttempts',
} as const satisfies Record<
  Exclude<ChangeOwnPasswordError['code'], 'signed-out'>,
  ChangePasswordFormState['problem']
>;

export async function changePasswordAction(
  state: ChangePasswordFormState,
  form: FormData,
): Promise<ChangePasswordFormState> {
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
  };
  const visit = await nextVisit();
  const changed = await changeOwnPassword(
    {
      accessToken: visit.jar.get(cookieNames.session) ?? '',
      networkAddress: visit.networkAddress,
    },
    { oldPassword: field('oldPassword'), newPassword: field('newPassword') },
    await flowDeps(),
  );
  const round = state.round + 1;
  if (!changed.ok) {
    const error = changed.error;
    if (error.code === 'signed-out') {
      redirect(screenUrl('signin', { problem: 'signInAgain', next: platformUrl('account') }));
    }
    const waitMinutes =
      error.code === 'too-many-attempts' ? Math.max(1, Math.ceil(error.retryAfterSeconds / 60)) : 0;
    return { problem: problemOf[error.code], box: error.box, waitMinutes, saved: false, round };
  }
  refresh();
  return { problem: null, box: null, waitMinutes: 0, saved: true, round };
}
