// GET /api/v1/signed-in: whether this request is signed in, about no league (T-456).
// The tracker asks it when a league answers "not found" (signed-in-endpoint.ts).
import { getConfig } from '../../../../server/config.ts';
import { webPorts } from '../../../../server/container.ts';
import { respond } from '../../../../server/league-api-route.ts';
import { requestFacts } from '../../../../server/request-facts.ts';
import { signedInAnswer } from '../../../../server/signed-in-endpoint.ts';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const ports = await webPorts();
  const facts = await requestFacts(ports);
  return respond(
    await signedInAnswer(facts, { ...ports, siteOrigin: getConfig().PUBLIC_BASE_URL }),
  );
}
