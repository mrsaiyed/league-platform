// GET /robots.txt (record 082): outside production, every robot is asked to keep out of the
// whole site, beside the "do not index" header and mark every page carries
// (do-not-index.ts). Production answers "not found": step 2.60 decided that a league keeps
// out of search engines by the robots mark in its pages' heads (a league that asked, or
// one that holds a child: U-18, T-312) and its JSON answers by a header, not here.
import { doNotIndex, keepOutRobots } from '../../server/do-not-index.ts';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  if (!doNotIndex()) return new Response(null, { status: 404 });
  return new Response(keepOutRobots, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
