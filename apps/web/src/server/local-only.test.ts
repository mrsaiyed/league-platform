// Step 2.96's gate, as the server runs it. The settings are made up and read by the real
// loadConfig.
//
// In staging and production the two local-only addresses, `/signin/kept-emails` and
// `/signin/made-up-people`, have no route of their own: they are answered by the route
// every unknown `/signin/<name>` is answered by (`[league]/(site)/[...missing]`), so they
// answer as an address that does not exist. Shown here, beside an unknown address, under
// the real staging and production settings and a real database's ports (which carry no
// tools): the league layout, the page and the league's "not found" screen give the same
// answers and ask the app the same things, and the gate never asks for the ports. The
// form's action, posted directly, answers Next.js's own "not found" and asks the app
// nothing.
//
// What this does not prove: what Next.js itself sends over the network for these addresses
// (the status line, the markup, the page data it streams, its headers). Neither mode can
// start today (record 055), so no server can be asked; when staging can serve, the pages
// and the posted action are to be compared byte for byte with an unknown address in
// staging and in production mode (record 075, "Not done yet").
//
// In local and test both pages are drawn from the tools of the made-up ports, and refused
// as an unknown address when the ports carry none or the request was not made here.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig, type Config } from './config-schema.ts';
import type { LocalTools } from './local-tools.ts';
import { pathHeader } from './request-facts-header.ts';

const settings = {
  PUBLIC_BASE_URL: 'https://leagues.example.test',
  PLATFORM_DATABASE_URL: 'postgres://app:made-up-password@localhost:5432/league_local',
  SUPABASE_URL: 'https://made-up-project.supabase.example.test',
  SUPABASE_SECRET_KEY: 'made-up-supabase-key',
  RESEND_API_KEY: 'made-up-resend-key',
  EMAIL_FROM: 'hello@example.test',
  TRUSTED_PROXY: 'one',
};

/** A request for `address`, as the proxy passes it on to the pages. */
const requestFor = (host: string, address: string, more: Record<string, string> = {}) =>
  new Headers({ host, 'x-forwarded-for': '127.0.0.1', [pathHeader]: address, ...more });

const tools = {
  keptEmails: vi.fn(async () => []),
  madeUpPeople: vi.fn(async () => []),
  madeUpSignInOf: vi.fn(() => ({
    kind: 'password' as const,
    email: 'owner@example.test',
    password: 'made-up',
  })),
  watchForCode: vi.fn(() => ({ code: async () => undefined, stop: () => {} })),
} satisfies LocalTools;

/** What was asked of the app's ports, in order: each property read and each call. */
const asked: string[] = [];

/**
 * Ports as a database's: they carry `localTools` (none for a real database), find no
 * league and no session; every read and call is written down.
 */
function portsCarrying(localTools: LocalTools | null): object {
  const target: Record<string, unknown> = {
    localTools,
    madeUpWorld: false,
    answers: () => true,
    newRequestId: () => 'made-up-request',
    findLeague: async () => undefined,
    findLeagueById: async () => undefined,
    identify: async () => ({ ok: false, error: { code: 'session-ended' } }),
    accessOf: async () => undefined,
    leaguesOfAccount: async () => [],
  };
  return new Proxy(target, {
    get(object, name) {
      // Not a promise: `await` asks for `then`, which is no port.
      if (typeof name !== 'string' || name === 'then') return undefined;
      asked.push(`read ${name}`);
      const value = object[name];
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        asked.push(`call ${name}(${JSON.stringify(args)})`);
        return (value as (...given: unknown[]) => unknown)(...args);
      };
    },
  });
}

const state: { config: Config | undefined; request: Headers; ports: object } = {
  config: undefined,
  request: new Headers(),
  ports: portsCarrying(null),
};
const webPorts = vi.fn(async () => state.ports);

vi.mock('./config.ts', () => ({
  getConfig: () => {
    if (state.config === undefined) throw new Error('no settings');
    return state.config;
  },
}));
vi.mock('./container.ts', () => ({ webPorts }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => state.request,
}));

/** What Next.js's notFound() throws: the not-found answer of an unknown address. */
const notFoundDigest = 'NEXT_HTTP_ERROR_FALLBACK;404';
const digestOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'digest' in error
    ? String((error as { digest: unknown }).digest)
    : String(error);

const catchAllPage = async () =>
  (await import('../app/[league]/(site)/[...missing]/page.tsx')).default;
const leagueLayout = async () => (await import('../app/[league]/layout.tsx')).default;
const leagueNotFound = async () => (await import('../app/[league]/not-found.tsx')).default;
const gate = async () => (await import('./local-only.ts')).localTools;
const action = async () => (await import('./sign-in/local-actions.ts')).beMadeUpPersonAction;

/** The catch-all route's page for `/signin/<name>`: what it draws, or what it throws. */
async function pageAt(name: string): Promise<unknown> {
  const Page = await catchAllPage();
  return Page({ params: Promise.resolve({ league: 'signin', missing: [name] }) }).catch(
    (error: unknown) => error,
  );
}

const form = () => {
  const data = new FormData();
  data.set('person', 'owner');
  data.set('next', '/north-valley/admin');
  return data;
};

beforeEach(() => {
  webPorts.mockClear();
  for (const tool of Object.values(tools)) tool.mockClear();
  asked.length = 0;
});

describe.each(['staging', 'production'])('in %s', (appEnv) => {
  const host = 'leagues.example.test';
  beforeEach(() => {
    state.config = loadConfig({ ...settings, APP_ENV: appEnv });
    state.ports = portsCarrying(null);
  });

  it('the gate gives nothing and never asks for the ports, even ports that carry the tools', async () => {
    state.ports = portsCarrying(tools);
    state.request = requestFor(host, '/signin/kept-emails');
    expect(await (await gate())()).toBeUndefined();
    expect(webPorts).not.toHaveBeenCalled();
  });

  it('both addresses answer exactly as an unknown /signin/<name>: layout, page and "not found"', async () => {
    /** Everything the server does for `/signin/<name>` before Next.js sends it. */
    const answerFor = async (name: string) => {
      asked.length = 0;
      state.request = requestFor(host, `/signin/${name}`);
      const Layout = await leagueLayout();
      const layout = await Layout({
        children: 'the page',
        params: Promise.resolve({ league: 'signin' }),
      });
      const page = digestOf(await pageAt(name));
      const NotFound = await leagueNotFound();
      const screen = renderToStaticMarkup(await NotFound());
      return {
        layout,
        page,
        screen: screen.replaceAll(name, '{name}'),
        asked: asked.map((line) => line.replaceAll(name, '{name}')),
      };
    };
    const unknown = await answerFor('no-such-page');
    expect(unknown.page).toBe(notFoundDigest);
    expect(unknown.layout).toBe('the page');
    expect(unknown.screen).not.toBe('');
    expect(unknown.asked).toContain('call newRequestId([])');
    for (const name of ['kept-emails', 'made-up-people']) {
      expect(await answerFor(name), name).toEqual(unknown);
    }
    expect(tools.keptEmails).not.toHaveBeenCalled();
    expect(tools.madeUpPeople).not.toHaveBeenCalled();
  });

  it('the form\'s action, posted directly, answers "not found" and signs nobody in', async () => {
    state.ports = portsCarrying(tools);
    state.request = requestFor(host, '/signin/made-up-people');
    const beMadeUpPersonAction = await action();
    const answer = await beMadeUpPersonAction(form()).catch((error: unknown) => error);
    expect(digestOf(answer)).toBe(notFoundDigest);
    expect(webPorts).not.toHaveBeenCalled();
    expect(tools.madeUpSignInOf).not.toHaveBeenCalled();
  });
});

describe('the routes', () => {
  // Review of step 2.96, L5: deliberate, not a side effect of reading the cookies.
  it('the route that answers both addresses is drawn per request, never at build time', async () => {
    const route = await import('../app/[league]/(site)/[...missing]/page.tsx');
    expect(route.dynamic).toBe('force-dynamic');
  });

  const app = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');

  /** Every page or endpoint file under app/, as its address's segments (groups left out). */
  function routes(dir: string = app, segments: readonly string[] = []): string[][] {
    const found: string[][] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const group = /^\(.+\)$/.test(entry.name);
        found.push(
          ...routes(path.join(dir, entry.name), group ? segments : [...segments, entry.name]),
        );
      } else if (/^(page|route)\.(tsx?|jsx?)$/.test(entry.name)) {
        found.push([...segments]);
      }
    }
    return found;
  }

  /** Whether a route of these segments could answer this address (Next.js's matching). */
  function couldAnswer(route: readonly string[], address: readonly string[]): boolean {
    const [first, ...rest] = route;
    if (first === undefined) return address.length === 0;
    if (/^\[\[\.\.\..+\]\]$/.test(first)) return true;
    if (/^\[\.\.\..+\]$/.test(first)) return address.length > 0;
    if (address.length === 0) return false;
    if (/^\[.+\]$/.test(first)) return couldAnswer(rest, address.slice(1));
    return first === address[0] && couldAnswer(rest, address.slice(1));
  }

  it('neither address has a route of its own: the routes that could answer are an unknown one’s', () => {
    const all = routes();
    const answering = (address: string) =>
      all.filter((route) => couldAnswer(route, address.split('/').filter(Boolean)));
    const unknown = answering('/signin/no-such-page');
    expect(unknown.map((route) => route.join('/'))).toEqual(['[league]/[...missing]']);
    for (const address of ['/signin/kept-emails', '/signin/made-up-people']) {
      expect(answering(address), address).toEqual(unknown);
    }
  });
});

describe.each(['local', 'test'])('in %s', (appEnv) => {
  const host = '127.0.0.1:3000';
  beforeEach(() => {
    state.config = loadConfig({
      ...settings,
      PUBLIC_BASE_URL: `http://${host}`,
      APP_ENV: appEnv,
    });
    state.ports = portsCarrying(tools);
  });

  it('both pages are drawn from the tools of the made-up ports', async () => {
    for (const name of ['kept-emails', 'made-up-people']) {
      state.request = requestFor(host, `/signin/${name}`);
      const drawn = (await pageAt(name)) as ReactElement<{ readonly tools: LocalTools }>;
      expect(digestOf(drawn)).not.toContain('NEXT_');
      // The screen itself (an async component), drawn with the tools it was given.
      const screen = drawn.type as (props: { readonly tools: LocalTools }) => Promise<ReactNode>;
      expect(drawn.props.tools).toBe(tools);
      expect(renderToStaticMarkup(await screen(drawn.props))).toContain('<h1>');
    }
    expect(tools.keptEmails).toHaveBeenCalledOnce();
    expect(tools.madeUpPeople).toHaveBeenCalledOnce();
  });

  it('"be this made-up person" says so plainly when no new code came (review, L9)', async () => {
    state.request = requestFor(host, '/signin/made-up-people?problem=no-code');
    const Page = await catchAllPage();
    const drawn = (await Page({
      params: Promise.resolve({ league: 'signin', missing: ['made-up-people'] }),
      searchParams: Promise.resolve({ problem: 'no-code' }),
    })) as ReactElement<{ readonly tools: LocalTools; readonly noNewCode: boolean }>;
    const screen = drawn.type as (props: typeof drawn.props) => Promise<ReactNode>;
    expect(renderToStaticMarkup(await screen(drawn.props))).toContain('No new code came in time');
    const plain = (await pageAt('made-up-people')) as typeof drawn;
    expect(renderToStaticMarkup(await screen(plain.props))).not.toContain('No new code');
  });

  it('a made-up database without the tools, or any ports without them, answers "not found"', async () => {
    state.ports = portsCarrying(null);
    for (const name of ['kept-emails', 'made-up-people']) {
      state.request = requestFor(host, `/signin/${name}`);
      expect(digestOf(await pageAt(name))).toBe(notFoundDigest);
    }
  });

  // Review of step 2.96, M1: even with ports that carry the tools and would answer anyone,
  // a request from another computer on the network, or one passed on by another server,
  // gets "not found" from both pages and the action, and no tool is used.
  it('both pages and the action answer "not found" to a request not made on this computer', async () => {
    for (const more of [
      { host: '192.168.1.20:3000' },
      { 'x-forwarded-for': '192.168.1.30' },
      { 'x-forwarded-host': 'leagues.example.com' },
    ]) {
      for (const name of ['kept-emails', 'made-up-people']) {
        state.request = requestFor(host, `/signin/${name}`, more);
        expect(digestOf(await pageAt(name))).toBe(notFoundDigest);
      }
      const beMadeUpPersonAction = await action();
      const answer = await beMadeUpPersonAction(form()).catch((error: unknown) => error);
      expect(digestOf(answer)).toBe(notFoundDigest);
    }
    for (const tool of Object.values(tools)) expect(tool).not.toHaveBeenCalled();
  });
});
