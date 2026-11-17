// "Be this made-up person" and the kept emails (step 2.96), on the sign-in stand-in with a
// browser played by a cookie jar: the session it makes is the ordinary one (the password
// form's on the stand-in, the code screens' on the made-up database); a key that is no
// made-up person signs nobody in; and no code, no address and no link reaches a log line
// or the console during a sign-up whose code is read from the kept emails (T4 §10).
import { platformUrl } from '@srleagues/core';
import { seedLeagues } from '@srleagues/database';
import { createLogger, memorySink } from '@srleagues/observability';
import { createLocalBotCheck } from '@srleagues/providers';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readKeptEmails } from '../kept-emails.ts';
import { madeUpDatabaseTools } from '../made-up-database-people.ts';
import { standInPeople, standInMember, standInPorts, standInSignIn } from '../stand-in-ports.ts';
import { beMadeUpPerson } from './be-made-up-person.ts';
import { cookieNames, type CookieJar } from './cookies.ts';
import type { Visit } from './device.ts';
import {
  askForCode,
  botCheckFieldsDrawn,
  choosePassword,
  enterCode,
  type FlowDeps,
} from './flows.ts';

const origin = 'http://127.0.0.1:3000';
/** The scratch folders this file made in the system's temp folder: removed after each test. */
const made: string[] = [];
afterEach(() => {
  for (const folder of made.splice(0)) rmSync(folder, { recursive: true, force: true });
});
const options = (log: (line: unknown) => void = () => {}) => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'be-made-up-'));
  made.push(folder);
  return {
    appEnv: 'test',
    publicBaseUrl: origin,
    log,
    emailFrom: 'hello@example.test',
    keptEmailsFolder: path.join(folder, 'captured-email'),
  };
};

function browser() {
  const cookies = new Map<string, string>();
  const jar: CookieJar = {
    get: (name) => cookies.get(name),
    set: (name, value, cookie) => {
      if (cookie.maxAge <= 0) cookies.delete(name);
      else cookies.set(name, value);
    },
    delete: (name) => {
      cookies.delete(name);
    },
  };
  const visit: Visit = { jar, networkAddress: '127.0.0.1', userAgent: 'made-up browser' };
  return { visit, cookies };
}

const flowDepsOf = (made: Pick<FlowDeps, 'signIn' | 'mail'>): FlowDeps => ({
  ...made,
  botCheck: createLocalBotCheck({ appEnv: 'test' }),
  secureCookies: false,
  siteOrigin: origin,
  now: () => new Date(),
});

async function onTheStandIn() {
  const ports = standInPorts(options());
  await ports.signUpMadeUpMember();
  await ports.signUpMadeUpStaff();
  ports.startKeeping();
  if (ports.localTools === null) throw new Error('the stand-in carries no local tools');
  return {
    ports,
    tools: ports.localTools,
    deps: flowDepsOf({ signIn: ports.signIn, mail: ports.signInMail }),
  };
}

describe('on the made-up stand-in', () => {
  it('signs the browser in as the made-up owner through the password sign-in', async () => {
    const { ports, tools, deps } = await onTheStandIn();
    const { visit, cookies } = browser();
    const answer = await beMadeUpPerson(
      { person: 'owner', next: '/north-valley/admin' },
      visit,
      deps,
      tools,
    );
    expect(answer).toEqual({ to: '/north-valley/admin' });
    const token = cookies.get(cookieNames.session);
    expect(token).toBeDefined();
    const who = await ports.identify(token ?? '');
    expect(who.ok && who.value.accountId).toBe(standInPeople.owner.accountId);
    // An ordinary session of the sign-in stand-in, with its renewing token beside it.
    expect(cookies.has(cookieNames.renew)).toBe(true);
    expect((await ports.signIn.identify({ accessToken: token ?? '' })).ok).toBe(true);
  });

  it('signs nobody in for a key that is no made-up person, and goes nowhere but our paths', async () => {
    const { tools, deps } = await onTheStandIn();
    for (const person of ['', 'nobody', 'stranger', 'owner@example.test', '__proto__']) {
      const { visit, cookies } = browser();
      expect(await beMadeUpPerson({ person }, visit, deps, tools)).toBeNull();
      expect(cookies.has(cookieNames.session)).toBe(false);
    }
    const { visit } = browser();
    const elsewhere = await beMadeUpPerson(
      { person: 'owner', next: 'https://elsewhere.example.com/' },
      visit,
      deps,
      tools,
    );
    expect(elsewhere).toEqual({ to: platformUrl('account') });
  });

  it('lists the made-up people with what they are in the leagues they may see', async () => {
    const { tools } = await onTheStandIn();
    const people = await tools.madeUpPeople();
    expect(people.map((p) => p.key)).toEqual([
      'owner',
      'scheduler',
      'scorekeeper',
      'coach',
      'member',
    ]);
    const owner = people.find((p) => p.key === 'owner');
    expect(owner?.places).toContainEqual({
      slug: 'north-valley',
      name: 'North Valley League',
      memberships: ['owner'],
    });
    const scorekeeper = people.find((p) => p.key === 'scorekeeper');
    expect(scorekeeper?.places.find((p) => p.slug === 'north-valley')?.memberships).toEqual([
      'scorekeeper',
    ]);
    // The draft league the made-up member plays in is not shown to them (U-9).
    const member = people.find((p) => p.key === 'member');
    expect(member?.places.map((p) => p.slug).sort()).toEqual(['harbor-city', 'north-valley']);
    // No password ever leaves the server: the choices carry none.
    expect(JSON.stringify(people)).not.toMatch(/password/);
  });
});

describe('on the made-up database', () => {
  it("lists the seed leagues' owners and staff, each signed in by an emailed code", async () => {
    const signIn = standInSignIn(options());
    await signIn.signUpMadeUpMember();
    signIn.startKeeping();
    const tools = madeUpDatabaseTools(seedLeagues, standInMember, signIn);
    const people = await tools.madeUpPeople();
    for (const league of seedLeagues) {
      expect(people.map((p) => p.email)).toContain(league.owner.email);
      for (const member of league.members)
        expect(people.map((p) => p.email)).toContain(member.email);
    }
    const owner = seedLeagues[0]?.owner.email ?? '';
    expect(tools.madeUpSignInOf(owner)).toEqual({ kind: 'code', email: owner });
    expect(tools.madeUpSignInOf('nobody@example.test')).toBeUndefined();

    const deps = flowDepsOf({ signIn: signIn.signIn, mail: signIn.signInMail });
    const { visit, cookies } = browser();
    const next = '/lakeside/admin';
    const answer = await beMadeUpPerson({ person: owner, next }, visit, deps, tools);
    // As after any sign-up: the code was proved, and a password is chosen next.
    expect(answer).toEqual({ to: platformUrl('choosePassword') });
    expect(await choosePassword({ password: 'a made-up chosen password' }, visit, deps)).toEqual({
      to: next,
    });
    const who = await signIn.signIn.identify({
      accessToken: cookies.get(cookieNames.session) ?? '',
    });
    expect(who.ok && who.value.email).toBe(owner);
    // The code email is kept for the page too.
    const kept = await signIn.keptEmails();
    expect(kept.some((m) => m.to === owner && m.code !== null)).toBe(true);
  });
});

// Review of step 2.96, L9: the code tried is the one this press asked for. An email that
// arrives late must never make an earlier code be sent, which would fail and use up an
// attempt; when none comes, the list says so in a plain sentence.
describe('the code of this ask only', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives no earlier email’s code: only one captured after the watch was made', async () => {
    const signIn = standInSignIn(options());
    signIn.startKeeping();
    const owner = seedLeagues[0]?.owner.email ?? '';
    // An earlier ask: its code is in the capture, as after an earlier press.
    const before = signIn.watchForCode(owner);
    expect(
      (await signIn.signIn.startSignUp({ email: owner, networkAddress: '127.0.0.1' })).ok,
    ).toBe(true);
    const earlier = await before.code();
    expect(earlier).toMatch(/^\d{6}$/);
    // Now nothing new comes: the watch gives nothing, never the earlier code.
    vi.useFakeTimers();
    const watch = signIn.watchForCode(owner);
    const waited = watch.code();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await waited).toBeUndefined();
    vi.useRealTimers();
    // And the next ask's code is the one given: the one the sign-in service now holds.
    const next = signIn.watchForCode(owner);
    await signIn.signIn.startSignUp({ email: owner, networkAddress: '127.0.0.1' });
    const fresh = await next.code();
    const proved = await signIn.signIn.verifyCode({
      email: owner,
      code: fresh ?? '',
      networkAddress: '127.0.0.1',
    });
    expect(proved.ok).toBe(true);
  });

  it('sends the browser back to the list with a plain sentence when no new code came', async () => {
    const signIn = standInSignIn(options());
    signIn.startKeeping();
    const real = madeUpDatabaseTools(seedLeagues, standInMember, signIn);
    // The code email comes, but only after the wait is over: it is never tried.
    let late: string | undefined;
    const tools = {
      ...real,
      watchForCode: (email: string) => {
        const watching = real.watchForCode(email);
        return {
          code: async () => {
            late = await watching.code();
            return undefined;
          },
          stop: watching.stop,
        };
      },
    };
    const owner = seedLeagues[0]?.owner.email ?? '';
    const deps = flowDepsOf({ signIn: signIn.signIn, mail: signIn.signInMail });
    const { visit, cookies } = browser();
    expect(
      await beMadeUpPerson({ person: owner, next: '/lakeside/admin' }, visit, deps, tools),
    ).toEqual({ to: `${platformUrl('madeUpPeople')}?problem=no-code` });
    expect(cookies.has(cookieNames.session)).toBe(false);
    // The code the ask did send still works on the code screen: no attempt was used on it.
    expect(late).toMatch(/^\d{6}$/);
    expect(await enterCode({ code: late }, visit, deps)).toEqual({
      to: platformUrl('choosePassword'),
    });
  });

  it('stops watching when the ask itself is refused', async () => {
    const signIn = standInSignIn(options());
    const real = madeUpDatabaseTools(seedLeagues, standInMember, signIn);
    const stopped = vi.fn();
    const code = vi.fn(async () => undefined);
    const tools = { ...real, watchForCode: () => ({ code, stop: stopped }) };
    const deps = flowDepsOf({
      signIn: {
        ...signIn.signIn,
        startSignUp: async () => ({
          ok: false,
          error: { code: 'too-many-attempts', retryAfterSeconds: 60 },
        }),
      },
      mail: signIn.signInMail,
    });
    const { visit } = browser();
    const owner = seedLeagues[0]?.owner.email ?? '';
    const answer = await beMadeUpPerson({ person: owner }, visit, deps, tools);
    expect(answer?.to).toMatch(/problem=tooManyAttempts/);
    expect(stopped).toHaveBeenCalledOnce();
    expect(code).not.toHaveBeenCalled();
  });
});

describe('no code in a log line (T4 §10)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a new address signs up by the code read from the kept emails; no log line holds it', async () => {
    const { sink, lines } = memorySink();
    const logger = createLogger({ sink, level: 'debug', base: { app: 'web' } });
    const printed: string[] = [];
    for (const name of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, name).mockImplementation((...args: unknown[]) => {
        printed.push(args.map(String).join(' '));
      });
    }
    // Wired as container.ts wires the app: the command lines and the warnings to the logger.
    const made = options((line) => logger.info('command', line as Record<string, unknown>));
    const ports = standInPorts({
      ...made,
      warn: (message, fields) => logger.warn(message, fields),
    });
    await ports.signUpMadeUpMember();
    await ports.signUpMadeUpStaff();
    ports.startKeeping();
    const deps = flowDepsOf({ signIn: ports.signIn, mail: ports.signInMail });
    const { visit, cookies } = browser();
    const email = 'brand-new-person@example.test';

    // As the sign-up page's form sends it: with the bot check's stand-in answer it draws.
    const drawn = botCheckFieldsDrawn(deps.botCheck.widget);
    expect(await askForCode('sign-up', { ...drawn, email }, visit, deps)).toEqual({
      to: platformUrl('enterCode'),
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const kept = await readKeptEmails(made.keptEmailsFolder, origin);
    const code = kept.find((m) => m.to === email)?.code;
    expect(code).toMatch(/^\d{6}$/);
    expect(await enterCode({ code: code ?? '' }, visit, deps)).toEqual({
      to: platformUrl('choosePassword'),
    });
    expect(await choosePassword({ password: 'a made-up chosen password' }, visit, deps)).toEqual({
      to: platformUrl('account'),
    });
    const token = cookies.get(cookieNames.session) ?? '';
    expect((await ports.identify(token)).ok).toBe(true);
    // A line that tries to log them, as a careless one might: the logger's redaction must
    // remove both, so the check below also looks at a real line.
    await ports.signInMail.newDevice(email, 'made-up', new Date());
    logger.info(`sign-up finished for ${email}`, { email, code });
    expect(lines.length).toBeGreaterThan(0);

    const everything = [...lines, ...printed].join('\n');
    expect(everything).not.toContain(code ?? 'no code');
    expect(everything).not.toContain(email);
    expect(everything).not.toContain(token);
  });
});
