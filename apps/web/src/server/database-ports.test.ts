// The web app's ports on the made-up database (step 2.93, record 055): leagues found
// by short name and id, the sign-in service's users turned into our accounts, and
// what they hold, read through packages/database as the app's login role. The
// sign-in service is a fake here: only who each token belongs to matters.
import { fail, ok } from '@srleagues/core';
import * as database from '@srleagues/database';
import type { SessionIdentity, SignInService } from '@srleagues/providers';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databasePorts, NotOnTheDatabaseYet } from './database-ports.ts';
import type { WebPorts } from './ports.ts';
import type { SignInMail } from './sign-in/sign-in-mail.ts';

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
let ports: WebPorts;
/** Who each made-up access token is, as the sign-in service would say. */
const sessions = new Map<string, SessionIdentity>();
/** The lines warn was given. */
const warnings: { message: string; fields: { signInUserId: string } }[] = [];

const signedIn = (email: string, signInId: string = randomUUID(), emailConfirmed = true) => {
  const token = `token-${randomUUID()}`;
  sessions.set(token, {
    accountId: signInId,
    email,
    emailConfirmed,
    sessionId: `session-${token}`,
    hasPassword: true,
    passwordEnteredAt: null,
    lastSignInAt: new Date('2026-11-01T10:00:00Z'),
  });
  return token;
};

const accountOf = async (token: string) => {
  const who = await ports.identify(token);
  if (!who.ok) throw new Error(`not signed in: ${who.error.code}`);
  return who.value.accountId;
};

const seedLeague = (slug: string) => {
  const found = made.leagues.find((l) => l.slug === slug);
  if (found === undefined) throw new Error(`the seed has no ${slug} league`);
  return found;
};
const lakeside = () => seedLeague('lakeside');

beforeAll(async () => {
  made = await database.madeUpDatabase();
  db = database.createDatabase(made.source);
  const signIn = {
    identify: async ({ accessToken }: { accessToken: string }) => {
      const who = sessions.get(accessToken);
      return who === undefined ? fail({ code: 'session-ended' as const }) : ok(who);
    },
  } as unknown as SignInService;
  ports = databasePorts({
    database,
    db,
    signIn,
    signInMail: {} as SignInMail,
    log: () => {},
    warn: (message, fields) => warnings.push({ message, fields }),
  });
}, 120_000);

afterAll(async () => {
  await db.close();
  await made.close();
});

describe('databasePorts (record 055)', () => {
  it('finds a seed league by its short name, and nothing for an unknown one', async () => {
    expect(await ports.findLeague('lakeside')).toMatchObject({
      leagueId: lakeside().leagueId,
      slug: 'lakeside',
      inBin: false,
      forwarded: false,
    });
    expect(await ports.findLeague('north-valley')).toBeUndefined();
  });

  it('finds a seed league by its id, and nothing for an unknown one', async () => {
    const { leagueId } = lakeside();
    expect(await ports.findLeagueById(leagueId)).toMatchObject({ id: leagueId, slug: 'lakeside' });
    expect(await ports.findLeagueById(randomUUID())).toBeUndefined();
  });

  it('links the sign-in user to the account already made for its address (record 052)', async () => {
    const signInId = randomUUID();
    const owner = await accountOf(signedIn('OWNER@lakeside.example.test', signInId));
    expect(owner).toBe(lakeside().ownerAccountId);
    expect(owner).not.toBe(signInId);
    // A second session of the same user: the same account, found by its link.
    expect(await accountOf(signedIn('owner@lakeside.example.test', signInId))).toBe(owner);
  });

  it('makes an account of our own for a new address, never the service’s id', async () => {
    const signInId = randomUUID();
    const account = await accountOf(signedIn(`new-${randomUUID()}@example.test`, signInId));
    expect(account).not.toBe(signInId);
    expect(account).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('passes the service’s refusal on', async () => {
    expect(await ports.identify('no-such-token')).toEqual(fail({ code: 'session-ended' }));
  });

  it('refuses, without throwing, an address linked to another sign-in user, and logs its id', async () => {
    const email = `twice-${randomUUID()}@example.test`;
    const firstSignIn = randomUUID();
    const first = await accountOf(signedIn(email, firstSignIn));
    const again = randomUUID();
    const token = signedIn(email, again);
    warnings.length = 0;
    const refused = fail({ code: 'account-problem', problem: 'sign-in-link-conflict' });
    // Every request answers the same, and never with the other user's account.
    expect(await ports.identify(token)).toEqual(refused);
    expect(await ports.identify(token)).toEqual(refused);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]?.fields).toEqual({ signInUserId: again });
    for (const { message } of warnings) {
      expect(message).not.toContain(email);
      expect(message).not.toContain(token);
    }
    // The first user keeps their account.
    expect(await accountOf(signedIn(email, firstSignIn))).toBe(first);
  });

  it('links or makes no account for an address the service has not confirmed (record 055)', async () => {
    const { ownerAccountId } = seedLeague('maple-street');
    const owner = 'owner@maple.example.test';
    const signInId = randomUUID();
    const refused = fail({ code: 'account-problem', problem: 'address-not-confirmed' });
    // An account made for the address before its owner signed in is not handed over.
    expect(await ports.identify(signedIn(owner, signInId, false))).toEqual(refused);
    const fresh = `unconfirmed-${randomUUID()}@example.test`;
    const freshId = randomUUID();
    expect(await ports.identify(signedIn(fresh, freshId, false))).toEqual(refused);
    // Nothing was linked or made: once confirmed, the owner's account is linked, and the
    // new address gets an account of its own.
    expect(await accountOf(signedIn(owner, signInId))).toBe(ownerAccountId);
    const made = await accountOf(signedIn(fresh, freshId));
    expect(made).not.toBe(ownerAccountId);
    // A user already linked keeps their account whatever the service says later.
    expect(await accountOf(signedIn(owner, signInId, false))).toBe(ownerAccountId);
  });

  it('reads what the account holds in the league through the access module', async () => {
    const { leagueId, ownerAccountId } = lakeside();
    const context = { leagueId, accountId: ownerAccountId, requestId: randomUUID() };
    expect(await ports.accessOf(context)).toMatchObject({
      accountId: ownerAccountId,
      isOwner: true,
    });
    const stranger = await accountOf(signedIn(`stranger-${randomUUID()}@example.test`));
    const held = await ports.accessOf({ ...context, accountId: stranger });
    expect(held?.isOwner ?? false).toBe(false);
    expect(held?.grants ?? []).toEqual([]);
    expect(await ports.accessOf({ ...context, accountId: null })).toBeUndefined();
  });

  it('refuses each area not yet on the database when it is reached, not before', async () => {
    const areas = [
      ports.publicStats,
      ports.games,
      ports.fixtureImport,
      ports.publicSchedule,
      ports.scheduleAdmin,
      ports.publicTeams,
      ports.adminTeams,
      ports.adminSettings,
      ports.tracker,
    ];
    for (const area of areas) {
      expect(await Promise.resolve(area)).toBe(area);
      expect(() => Reflect.get(area, 'deps')).toThrow(NotOnTheDatabaseYet);
    }
    await expect(ports.publishPlays(lakeside().leagueId, randomUUID())).rejects.toThrow(
      NotOnTheDatabaseYet,
    );
    expect(ports.liveFeed).toBeNull();
  });
});
