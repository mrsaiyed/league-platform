// The request's facts for context.ts, read from Next.js: the Host, the address as
// it arrived (from the proxy's header) and who the session cookie belongs to.
import { cookies, headers } from 'next/headers';
import type { RequestFacts } from './context.ts';
import type { WebPorts } from './ports.ts';
import { pathHeader } from './request-facts-header.ts';
import { sessionCookieName } from './session-cookie.ts';

export async function requestFacts(ports: WebPorts): Promise<RequestFacts> {
  const given = await headers();
  const token = (await cookies()).get(sessionCookieName)?.value;
  return {
    host: given.get('host') ?? '',
    // Missing only if the proxy did not run: then the path is not one, and nothing is found.
    path: given.get(pathHeader) ?? '',
    session: token === undefined || token === '' ? null : await ports.identify(token),
  };
}
