// What a sign-in screen reads of this request's own cookies (step 2.163): the sign-up or
// reset under way (the address the code went to, its purpose), and the address typed
// into the last refused sign-in on this device. Read only; the flows write them.
import { cookies } from 'next/headers';
import { readFlow, readTypedEmail, type Flow } from './cookies.ts';

async function jar() {
  const given = await cookies();
  return { get: (name: string) => given.get(name)?.value };
}

/** The sign-up or forgotten-password route under way on this device, if any. */
export async function flowOfThisRequest(): Promise<Flow | undefined> {
  return readFlow(await jar());
}

/** The address typed into the last refused sign-in on this device, if any. */
export async function typedEmailOfThisRequest(): Promise<string | undefined> {
  return readTypedEmail(await jar());
}
