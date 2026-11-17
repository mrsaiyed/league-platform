// GET /robots.txt (record 081): outside production, every robot is asked to keep out of the
// whole site, beside the "do not index" header and mark every page carries
// (do-not-index.ts). Production has no robots rule yet: it answers "not found", as before
// this file, until step 2.60 decides what production lets search engines show.
import { doNotIndex, keepOutRobots } from '../../server/do-not-index.ts';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  if (!doNotIndex()) return new Response(null, { status: 404 });
  return new Response(keepOutRobots, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
