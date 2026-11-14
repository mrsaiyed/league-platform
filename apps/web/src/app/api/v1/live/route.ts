// GET /api/v1/live?channel=…: a page listens to a live channel on the local stand-in
// hub, over server-sent events (T-14, record 021). The hub only lets a page listen,
// and only to a league it may open (server/live-listen.ts); no other method is
// answered, so no page can publish (T-120). Where pages listen to the live service
// itself, there is no such address.
import { webPorts } from '../../../../server/container.ts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const { liveFeed } = await webPorts();
  if (liveFeed === null) {
    return Response.json(
      { error: 'not-found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return liveFeed(request);
}
