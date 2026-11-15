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
/** The ports' clock, moved on by hand. */
let clock = new Date('2026-11-14T10:00:00Z');

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
    now: () => clock,
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
    expect(await ports.findLeagueById(leagueId.toUpperCase())).toMatchObject({ id: leagueId });
  });

  it('finds nothing, and does not fail, for an id that is not a UUID', async () => {
    for (const id of ['', 'lakeside', 'not-a-uuid', `${lakeside().leagueId}x`, "1' or '1'='1"]) {
      expect(await ports.findLeagueById(id)).toBeUndefined();
    }
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
    expect(await ports.identify(token)).toEqual(refused);
    // Logged once an hour per sign-in user, not on every request.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.fields).toEqual({ signInUserId: again });
    clock = new Date(clock.getTime() + 61 * 60 * 1000);
    expect(await ports.identify(token)).toEqual(refused);
    expect(warnings).toHaveLength(2);
    expect(warnings[1]?.fields).toEqual({ signInUserId: again });
    for (const { message } of warnings) {
      expect(message).not.toContain(email);
      expect(message).not.toContain(token);
    }
    // The first user keeps their account.
    expect(await accountOf(signedIn(email, firstSignIn))).toBe(first);
  });

  it('refuses, without throwing, an address the database refuses, and logs only the id', async () => {
    const refused = fail({ code: 'account-problem', problem: 'address-refused' });
    for (const email of [`${randomUUID()}@erased.invalid`, 'no-at-sign.example.test']) {
      const signInId = randomUUID();
      const token = signedIn(email, signInId);
      warnings.length = 0;
      // Every page answers the same refusal, which the account page explains.
      expect(await ports.identify(token)).toEqual(refused);
      expect(await ports.identify(token)).toEqual(refused);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.fields).toEqual({ signInUserId: signInId });
      expect(warnings[0]?.message).not.toContain(email);
    }
  });

  it('still throws when the database cannot be reached: a fault is not a refusal', async () => {
    const unreachable = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const faulty = databasePorts({
      database: {
        ...database,
        accountForSignIn: () => Promise.reject(unreachable),
      },
      db,
      signIn: {
        identify: async ({ accessToken }: { accessToken: string }) => {
          const who = sessions.get(accessToken);
          return who === undefined ? fail({ code: 'session-ended' as const }) : ok(who);
        },
      } as unknown as SignInService,
      signInMail: {} as SignInMail,
      log: () => {},
      warn: () => {},
    });
    await expect(faulty.identify(signedIn(`new-${randomUUID()}@example.test`))).rejects.toBe(
      unreachable,
    );
  });

  it('links a pre-made account only to the same plain ASCII address (record 055)', async () => {
    const { leagueId } = lakeside();
    const holds = async (accountId: string) =>
      (await ports.accessOf({ leagueId, accountId, requestId: randomUUID() }))?.grants.length ?? 0;
    // The seed's scorekeeper, made before they signed in: scorer@lakeside.example.test.
    // U+212A, the Kelvin sign, which lower() and toLowerCase() fold into k: a mailbox at
    // that address is another mailbox, and is never handed the scorekeeper's account.
    const kelvin = String.fromCharCode(0x212a);
    const refused = fail({ code: 'account-problem', problem: 'address-refused' });
    warnings.length = 0;
    const lookAlike = randomUUID();
    expect(
      await ports.identify(signedIn(`scorer@la${kelvin}eside.example.test`, lookAlike)),
    ).toEqual(refused);
    expect(warnings).toEqual([
      { message: expect.any(String), fields: { signInUserId: lookAlike } },
    ]);
    // Nor is an account made for any other address that is not plain ASCII.
    const accented = `zo${String.fromCharCode(0xeb)}-${randomUUID()}@example.test`;
    expect(await ports.identify(signedIn(accented))).toEqual(refused);
    // The scorekeeper's account was not linked: their own address, in any capitals,
    // still gets it, with their role in the league.
    const scorer = await accountOf(signedIn('SCORER@Lakeside.example.test'));
    expect(await holds(scorer)).toBeGreaterThan(0);
  });

  it('makes one account, not two, for two first sign-ins at once of one address', async () => {
    const email = `at-once-${randomUUID()}@example.test`;
    const signInId = randomUUID();
    // The same new user twice at once (two tabs): one account.
    const [first, second] = await Promise.all([
      accountOf(signedIn(email, signInId)),
      accountOf(signedIn(email.toUpperCase(), signInId)),
    ]);
    expect(first).toBe(second);
    expect(await accountOf(signedIn(email, signInId))).toBe(first);
    // Two different users at once for one new address: one account, the other refused.
    const other = `at-once-${randomUUID()}@example.test`;
    const answers = await Promise.all([
      ports.identify(signedIn(other)),
      ports.identify(signedIn(other)),
    ]);
    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.filter((answer) => !answer.ok)).toEqual([
      fail({ code: 'account-problem', problem: 'sign-in-link-conflict' }),
    ]);
    // A pre-made account (the seed's scheduler), two first sign-ins at once: linked
    // once, to that account, which holds the scheduler's role.
    const scheduler = randomUUID();
    const both = await Promise.all([
      accountOf(signedIn('scheduler@lakeside.example.test', scheduler)),
      accountOf(signedIn('scheduler@lakeside.example.test', scheduler)),
    ]);
    expect(both[0]).toBe(both[1]);
    expect(both[0]).not.toBe(scheduler);
    const held = await ports.accessOf({
      leagueId: lakeside().leagueId,
      accountId: both[0] ?? '',
      requestId: randomUUID(),
    });
    expect(held?.grants.length ?? 0).toBeGreaterThan(0);
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

  it('gives one league’s owner nothing in another league', async () => {
    const lake = lakeside();
    const maple = seedLeague('maple-street');
    expect(lake.ownerAccountId).not.toBe(maple.ownerAccountId);
    const inMaple = await ports.accessOf({
      leagueId: maple.leagueId,
      accountId: lake.ownerAccountId,
      requestId: randomUUID(),
    });
    expect(inMaple?.isOwner ?? false).toBe(false);
    expect(inMaple?.grants ?? []).toEqual([]);
    // Each owner holds their own league, and only it.
    expect(
      await ports.accessOf({
        leagueId: maple.leagueId,
        accountId: maple.ownerAccountId,
        requestId: randomUUID(),
      }),
    ).toMatchObject({ isOwner: true });
  });

  it('finds a league in the bin only as in the bin, and gives no one anything in it', async () => {
    const binnedMade = await database.madeUpDatabase({ inBin: ['maple-street'] });
    const binnedDb = database.createDatabase(binnedMade.source);
    try {
      const binnedPorts = databasePorts({
        database,
        db: binnedDb,
        signIn: {
          identify: async ({ accessToken }: { accessToken: string }) => {
            const who = sessions.get(accessToken);
            return who === undefined ? fail({ code: 'session-ended' as const }) : ok(who);
          },
        } as unknown as SignInService,
        signInMail: {} as SignInMail,
        log: () => {},
        warn: () => {},
      });
      const maple = binnedMade.leagues.find((l) => l.slug === 'maple-street');
      if (maple === undefined) throw new Error('the seed has no maple-street league');
      expect(await binnedPorts.findLeague('maple-street')).toMatchObject({
        leagueId: maple.leagueId,
        inBin: true,
      });
      expect(await binnedPorts.findLeagueById(maple.leagueId)).toBeUndefined();
      // Every person the seed gives a role in the league: its owner and each member.
      const seeded = database.seedLeagues.find((l) => l.slug === 'maple-street');
      if (seeded === undefined) throw new Error('the seed has no maple-street league');
      expect(seeded.members.length).toBeGreaterThan(0);
      const holders = [maple.ownerAccountId];
      for (const member of seeded.members) {
        const who = await binnedPorts.identify(signedIn(member.email));
        if (!who.ok) throw new Error(`${member.role} not signed in: ${who.error.code}`);
        holders.push(who.value.accountId);
        // Outside the bin the same member holds their role, so the bin is what ends it.
        const inPlace = await ports.accessOf({
          leagueId: seedLeague('maple-street').leagueId,
          accountId: await accountOf(signedIn(member.email)),
          requestId: randomUUID(),
        });
        expect(inPlace?.grants.length ?? 0, member.role).toBeGreaterThan(0);
      }
      expect(new Set(holders).size).toBe(seeded.members.length + 1);
      for (const accountId of holders) {
        expect(
          await binnedPorts.accessOf({
            leagueId: maple.leagueId,
            accountId,
            requestId: randomUUID(),
          }),
        ).toBeUndefined();
      }
      // The other league is untouched.
      expect(await binnedPorts.findLeague('lakeside')).toMatchObject({ inBin: false });
    } finally {
      await binnedDb.close();
      await binnedMade.close();
    }
  }, 120_000);

  it('refuses each area not yet on the database when it is reached, not before', async () => {
    const areas = [
      ports.games,
      ports.fixtureImport,
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
    // The statistics (part 3) refuse within the standings' ports, which have moved.
    await expect(ports.publicStats.settingsOf(lakeside().leagueId)).rejects.toThrow(
      NotOnTheDatabaseYet,
    );
  });

  it('reads the public schedule and standings from the database (part 2)', async () => {
    // The seed's season is still being set up here, so a visitor is offered none, as a
    // season in set-up is hidden on the stand-in too.
    expect(await ports.publicStats.seasonsOf(lakeside().leagueId)).toEqual([]);
    expect((await ports.publicSchedule.clockOf(lakeside().leagueId)).timeZone).toBe(
      'America/Chicago',
    );
  });
});
