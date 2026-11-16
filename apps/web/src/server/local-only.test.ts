// Step 2.96's gate, as the server runs it: the two local-only pages and the form's action,
// started with the app's settings for staging and for production, answer "not found"
// (Next.js's own notFound, the answer of an address that does not exist) before the app's
// ports are even asked for, even when ports that carry the tools would be there. In local
// and test they are drawn. The settings are made up and read by the real loadConfig.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig, type Config } from './config-schema.ts';
import type { LocalTools } from './local-tools.ts';

const settings = {
  PUBLIC_BASE_URL: 'https://leagues.example.test',
  PLATFORM_DATABASE_URL: 'postgres://app:made-up-password@localhost:5432/league_local',
  SUPABASE_URL: 'https://made-up-project.supabase.example.test',
  SUPABASE_SECRET_KEY: 'made-up-supabase-key',
  RESEND_API_KEY: 'made-up-resend-key',
  EMAIL_FROM: 'hello@example.test',
  TRUSTED_PROXY: 'one',
};

/** A request made on this computer, as the proxy passes it on. */
const madeHere = () => new Headers({ host: '127.0.0.1:3000', 'x-forwarded-for': '127.0.0.1' });
const state: { config: Config | undefined; request: Headers } = {
  config: undefined,
  request: madeHere(),
};
const tools: LocalTools = {
  keptEmails: async () => [],
  madeUpPeople: async () => [],
  madeUpSignInOf: () => ({ kind: 'password', email: 'owner@example.test', password: 'made-up' }),
  newestCodeFor: async () => undefined,
};
const webPorts = vi.fn(async () => ({ localTools: tools }));

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

const keptEmailsPage = async () =>
  (await import('../app/(platform)/signin/kept-emails/page.tsx')).default;
const madeUpPeoplePage = async () =>
  (await import('../app/(platform)/signin/made-up-people/page.tsx')).default;
const action = async () => (await import('./sign-in/local-actions.ts')).beMadeUpPersonAction;

const form = () => {
  const data = new FormData();
  data.set('person', 'owner');
  data.set('next', '/north-valley/admin');
  return data;
};

beforeEach(() => {
  webPorts.mockClear();
  state.request = madeHere();
});

describe.each(['staging', 'production'])('in %s', (appEnv) => {
  beforeEach(() => {
    state.config = loadConfig({ ...settings, APP_ENV: appEnv });
  });

  it('the kept emails page answers "not found" and asks the app for nothing', async () => {
    const Page = await keptEmailsPage();
    const answer = await Page().catch((error: unknown) => error);
    expect(digestOf(answer)).toBe(notFoundDigest);
    expect(webPorts).not.toHaveBeenCalled();
  });

  it('"be this made-up person" answers "not found" and asks the app for nothing', async () => {
    const Page = await madeUpPeoplePage();
    const answer = await Page().catch((error: unknown) => error);
    expect(digestOf(answer)).toBe(notFoundDigest);
    expect(webPorts).not.toHaveBeenCalled();
  });

  it('the form\'s action, posted directly, answers "not found" and signs nobody in', async () => {
    const beMadeUpPersonAction = await action();
    const answer = await beMadeUpPersonAction(form()).catch((error: unknown) => error);
    expect(digestOf(answer)).toBe(notFoundDigest);
    expect(webPorts).not.toHaveBeenCalled();
  });
});

describe.each(['local', 'test'])('in %s', (appEnv) => {
  beforeEach(() => {
    state.config = loadConfig({
      ...settings,
      PUBLIC_BASE_URL: 'http://127.0.0.1:3000',
      APP_ENV: appEnv,
    });
  });

  it('both pages are drawn from the tools of the made-up ports', async () => {
    for (const Page of [await keptEmailsPage(), await madeUpPeoplePage()]) {
      expect(await Page()).toBeTruthy();
    }
    expect(webPorts).toHaveBeenCalledTimes(2);
  });

  it('a made-up database without the tools, or any ports without them, answers "not found"', async () => {
    webPorts.mockResolvedValueOnce({ localTools: null as unknown as LocalTools });
    const Page = await keptEmailsPage();
    expect(digestOf(await Page().catch((error: unknown) => error))).toBe(notFoundDigest);
  });

  // Review of step 2.96, M1: even with ports that carry the tools and would answer anyone,
  // a request from another computer on the network, or one passed on by another server,
  // gets "not found" from both pages and the action, and the app is not asked.
  it('both pages and the action answer "not found" to a request not made on this computer', async () => {
    for (const request of [
      new Headers({ host: '192.168.1.20:3000' }),
      new Headers({ host: '127.0.0.1:3000', 'x-forwarded-for': '192.168.1.30' }),
      new Headers({ host: '127.0.0.1:3000', 'x-forwarded-host': 'leagues.example.com' }),
    ]) {
      state.request = request;
      for (const Page of [await keptEmailsPage(), await madeUpPeoplePage()]) {
        expect(digestOf(await Page().catch((error: unknown) => error))).toBe(notFoundDigest);
      }
      const beMadeUpPersonAction = await action();
      const answer = await beMadeUpPersonAction(form()).catch((error: unknown) => error);
      expect(digestOf(answer)).toBe(notFoundDigest);
    }
    expect(webPorts).not.toHaveBeenCalled();
  });
});
