// The flows' view of a Next.js request (flows.ts): its cookies, where it comes from,
// and the ports. Used by the server actions and Google's return.
import { cookies, headers } from 'next/headers';
import { getConfig } from '../config.ts';
import { webPorts } from '../container.ts';
import { networkAddressOf, type Visit } from './device.ts';
import type { FlowDeps } from './flows.ts';

export async function nextVisit(): Promise<Visit> {
  const jar = await cookies();
  const given = await headers();
  return {
    jar: {
      get: (name) => jar.get(name)?.value,
      set: (name, value, options) => {
        jar.set(name, value, options);
      },
      delete: (name) => {
        jar.delete(name);
      },
    },
    networkAddress: networkAddressOf(given.get('x-forwarded-for'), getConfig().TRUSTED_PROXY),
    userAgent: given.get('user-agent') ?? '',
  };
}

/** Whether the site is on HTTPS, so its cookies are Secure (T-69). */
export function secureCookies(): boolean {
  return new URL(getConfig().PUBLIC_BASE_URL).protocol === 'https:';
}

export async function flowDeps(): Promise<FlowDeps> {
  const ports = await webPorts();
  return {
    signIn: ports.signIn,
    mail: ports.signInMail,
    secureCookies: secureCookies(),
    siteOrigin: getConfig().PUBLIC_BASE_URL,
    now: () => new Date(),
  };
}

/** A form's text fields; files and repeated names are ignored. */
export function fieldsOf(form: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string' && !Object.hasOwn(fields, name)) fields[name] = value;
  }
  return fields;
}
