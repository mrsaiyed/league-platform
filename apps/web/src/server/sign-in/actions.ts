'use server';
// The sign-in forms' server actions: each runs its flow (flows.ts) and sends the
// browser where the flow answers. Next.js refuses an action posted from another
// site (its Origin must be ours), so every change here comes from our own pages
// (T4 §5). The forms work with no script in the page.
import { redirect } from 'next/navigation';
import {
  askForCode,
  choosePassword,
  confirmPassword,
  enterCode,
  resendCode,
  signInWithPassword,
  signOut,
  signOutEverywhere,
  startGoogle,
} from './flows.ts';
import { fieldsOf, flowDeps, nextVisit } from './next-visit.ts';

export async function signUpAction(form: FormData): Promise<never> {
  redirect((await askForCode('sign-up', fieldsOf(form), await nextVisit(), await flowDeps())).to);
}

export async function forgotPasswordAction(form: FormData): Promise<never> {
  redirect((await askForCode('reset', fieldsOf(form), await nextVisit(), await flowDeps())).to);
}

export async function enterCodeAction(form: FormData): Promise<never> {
  redirect((await enterCode(fieldsOf(form), await nextVisit(), await flowDeps())).to);
}

export async function resendCodeAction(form: FormData): Promise<never> {
  redirect((await resendCode(fieldsOf(form), await nextVisit(), await flowDeps())).to);
}

export async function choosePasswordAction(form: FormData): Promise<never> {
  redirect((await choosePassword(fieldsOf(form), await nextVisit(), await flowDeps())).to);
}

export async function signInAction(form: FormData): Promise<never> {
  redirect((await signInWithPassword(fieldsOf(form), await nextVisit(), await flowDeps())).to);
}

export async function googleAction(form: FormData): Promise<never> {
  redirect((await startGoogle(fieldsOf(form), await nextVisit(), await flowDeps())).to);
}

export async function confirmPasswordAction(form: FormData): Promise<never> {
  redirect((await confirmPassword(fieldsOf(form), await nextVisit(), await flowDeps())).to);
}

/** The form says where the person is (`next`) and whether it is a staff page (`staff`). */
export async function signOutAction(form: FormData): Promise<never> {
  redirect((await signOut(fieldsOf(form), await nextVisit(), await flowDeps())).to);
}

export async function signOutEverywhereAction(): Promise<never> {
  redirect((await signOutEverywhere(await nextVisit(), await flowDeps())).to);
}
