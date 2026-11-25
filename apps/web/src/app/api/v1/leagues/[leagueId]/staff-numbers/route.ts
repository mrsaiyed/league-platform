// GET /api/v1/leagues/{leagueId}/staff-numbers?page=…: the player numbers a public page
// leaves out, for a signed-in coach, captain or admin allowed to see them (step 2.46). The
// handler is server/staff-numbers-endpoint.ts, which also runs the league gate (U-9).
import { leagueEndpoint, respond } from '../../../../../../server/league-api-route.ts';
import {
  askedStaffNumbers,
  staffNumbersParts,
  staffNumbersRequest,
} from '../../../../../../server/staff-numbers-endpoint.ts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  // A session that no longer works is a visitor here, as on the page that asks.
  const endpoint = await leagueEndpoint(staffNumbersParts, 'visitor');
  const question = askedStaffNumbers(new URL(request.url).searchParams);
  if (!endpoint.ok) return respond(await staffNumbersRequest(endpoint, question));
  const { context, holder, ports } = endpoint;
  const read = {
    // What the gate read already (league-api.ts), not read a second time.
    accessOf: async () => holder,
    publicStats: ports.publicStats,
    tracker: ports.tracker,
  };
  return respond(await staffNumbersRequest({ ok: true, context, ports: read }, question));
}
