// Runs before every page. It writes the address exactly as it arrived (still
// percent-encoded, capitals kept) into a request header for the pages, overwriting
// any header of that name the browser sent, because the pages are given only the
// decoded parts and context.ts must see the address as it came (T-34, U-7).
import { NextResponse, type NextRequest } from 'next/server';
import { pathHeader } from './server/request-facts-header.ts';

export function proxy(request: NextRequest): NextResponse {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.set(pathHeader, url.pathname + url.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
