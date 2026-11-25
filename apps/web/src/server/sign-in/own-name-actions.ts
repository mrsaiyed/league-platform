'use server';
// The own-name form's two answers (R-21, step 2.128). The account is always the session's
// (T-23): giving the name reads it before the name gate (ownName.accountOf), since the gate
// refuses that very session until the name is given; changing it reads the signed-in person.
import { changeOwnName, giveOwnName, platformUrl } from '@srleagues/core';
import { refresh } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import type { OwnNameFormState } from '../../features/sign-in/own-name-state.ts';
import { webPorts } from '../container.ts';
import { signedInPerson } from '../signed-in-leagues.ts';
import { cookieNames } from './cookies.ts';

function typed(form: FormData): { readonly firstName: string; readonly lastName: string } {
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
  };
  return { firstName: field('firstName'), lastName: field('lastName') };
}

/** The one screen's answer: the name made, then the account page, where a sign-in lands. */
export async function giveOwnNameAction(
  state: OwnNameFormState,
  form: FormData,
): Promise<OwnNameFormState> {
  const ports = await webPorts();
  const token = (await cookies()).get(cookieNames.session)?.value ?? '';
  const accountId = token === '' ? undefined : await ports.ownName.accountOf(token);
  if (accountId === undefined) redirect(platformUrl('account'));
  const input = typed(form);
  const given = await giveOwnName({ accountId, requestId: randomUUID() }, input, {
    ownNames: ports.ownName.store,
  });
  if (!given.ok) {
    const problem = given.error.code === 'already-named' ? 'alreadyNamed' : 'invalid';
    return { ...input, problem, saved: false, round: state.round + 1 };
  }
  redirect(platformUrl('account'));
}

/** "Your name" on the account page: saved and drawn at once, or refused with the text kept. */
export async function changeOwnNameAction(
  state: OwnNameFormState,
  form: FormData,
): Promise<OwnNameFormState> {
  const person = await signedInPerson();
  if (person.kind !== 'signed-in') redirect(platformUrl('account'));
  const ports = await webPorts();
  const input = typed(form);
  const changed = await changeOwnName(
    { accountId: person.accountId, requestId: randomUUID() },
    input,
    { ownNames: ports.ownName.store },
  );
  if (!changed.ok) {
    const problem = changed.error.code === 'no-name-yet' ? 'noNameYet' : 'invalid';
    return { ...input, problem, saved: false, round: state.round + 1 };
  }
  refresh();
  return { ...changed.value, problem: null, saved: true, round: state.round + 1 };
}
