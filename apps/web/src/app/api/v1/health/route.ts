// GET /api/v1/health: the uptime check's address (T8 §7). Never cached.
import { webPorts } from '../../../../server/container.ts';
import { webHealth } from '../../../../server/health.ts';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const { httpStatus, body } = await webHealth({ started: webPorts });
  return Response.json(body, { status: httpStatus, headers: { 'Cache-Control': 'no-store' } });
}
