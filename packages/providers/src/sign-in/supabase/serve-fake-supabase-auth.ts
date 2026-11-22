// The fake Supabase Auth (fake-supabase-auth.ts) served over HTTP on this computer, so the
// web app can be started in staging mode with SUPABASE_URL pointing at it and the real
// adapter speaking to it through `fetch`, exactly as it would to the service (step 2.93's
// last part). For tests only (T-201): made-up accounts in memory, 127.0.0.1 only, a port
// the system picks, plain http (which the adapter accepts only for an address on this
// computer). Nothing in it is a real key or a real person.
//
// What the test copy would email, the test reads here instead: the code the fake made
// for an address (`codeFor`) is the one the adapter hands our email service, which in
// staging captures every email in the server's own memory (T-140).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createFakeSupabaseAuth, type FakeSupabaseAuthOptions } from './fake-supabase-auth.ts';

export type FakeSupabaseAuthServer = {
  /** Its address on this computer, for SUPABASE_URL: `http://localhost:<port>`. */
  readonly url: string;
  /** The newest code made for an address (sign-up or reset), or undefined. */
  readonly codeFor: (email: string) => string | undefined;
  /** How many calls of a method and path (after `/auth/v1`, without the query) it was asked. */
  readonly callsTo: (method: string, path: string) => number;
  readonly close: () => Promise<void>;
};

export type FakeSupabaseAuthServerOptions = Omit<FakeSupabaseAuthOptions, 'now'> & {
  readonly now?: () => Date;
};

const bodyOf = (request: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });

/** Starts the fake on 127.0.0.1. Close it when done. */
export async function serveFakeSupabaseAuth(
  options: FakeSupabaseAuthServerOptions,
): Promise<FakeSupabaseAuthServer> {
  const fake = createFakeSupabaseAuth({ now: () => new Date(), ...options });
  const codes = new Map<string, string>();

  const answer = async (request: IncomingMessage, response: ServerResponse) => {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') headers[name] = value;
    }
    const text = await bodyOf(request);
    const method = request.method ?? 'GET';
    const url = `http://localhost${request.url ?? '/'}`;
    let answered: Response;
    try {
      answered = await fake.fetch(url, {
        method,
        headers,
        ...(text === '' ? {} : { body: text }),
      });
    } catch {
      answered = new Response(null, { status: 404 });
    }
    const raw = await answered.text();
    if (method === 'POST' && new URL(url).pathname === '/auth/v1/admin/generate_link') {
      try {
        const made = JSON.parse(raw) as { email?: unknown; email_otp?: unknown };
        if (typeof made.email === 'string' && typeof made.email_otp === 'string') {
          codes.set(made.email.toLowerCase(), made.email_otp);
        }
      } catch {
        // Not a code: nothing to keep.
      }
    }
    response.writeHead(answered.status, Object.fromEntries(answered.headers.entries()));
    response.end(raw);
  };

  const server = createServer((request, response) => {
    answer(request, response).catch(() => {
      response.writeHead(500);
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://localhost:${port}`,
    codeFor: (email) => codes.get(email.trim().toLowerCase()),
    callsTo: (method, path) =>
      fake.calls().filter((call) => call.method === method && call.path.split('?')[0] === path)
        .length,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
