// Where Google sends the browser back (T-67). The address holds Google's one-time
// code: the answer is a forward at once, and the address is never passed on
// (next.config.ts: no referrer here).
import { NextResponse, type NextRequest } from 'next/server';
import { getConfig } from '../../../../server/config.ts';
import { finishGoogle } from '../../../../server/sign-in/flows.ts';
import { flowDeps, nextVisit } from '../../../../server/sign-in/next-visit.ts';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get('code') ?? '';
  const answer = await finishGoogle(code.slice(0, 4096), await nextVisit(), await flowDeps());
  const response = NextResponse.redirect(new URL(answer.to, getConfig().PUBLIC_BASE_URL), 303);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
