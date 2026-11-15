// This request's facts (request-facts.ts), read once however many layouts, pages and
// screens ask (React cache, one per request). The session cookie is identified by the
// sign-in service once per request: the league gate, the account button, the refusal
// screen that Next.js draws into every page, and the front and account pages all share
// that one answer (step 2.127).
import { cookies } from 'next/headers';
import { cache } from 'react';
import { webPorts } from './container.ts';
import type { RequestFacts } from './context.ts';
import { requestFacts } from './request-facts.ts';

export const thisRequestFacts = cache(async (): Promise<RequestFacts> => {
  // The cookies first: whatever reads this is drawn per request, never at build time.
  await cookies();
  return requestFacts(await webPorts());
});
