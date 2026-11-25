// GET /api/v1/signed-in: whether this request is signed in, about no league (T-456).
// The tracker asks it when a league answers "not found" (signed-in-endpoint.ts).
import { getConfig } from '../../../../server/config.ts';
import { apiRequestFacts, respond } from '../../../../server/league-api-route.ts';
import { signedInAnswer } from '../../../../server/signed-in-endpoint.ts';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const { facts, ports } = await apiRequestFacts();
  return respond(
    await signedInAnswer(facts, { ...ports, siteOrigin: getConfig().PUBLIC_BASE_URL }),
  );
}
