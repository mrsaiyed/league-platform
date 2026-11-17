// Step 2.46 on the made-up database: the signed-in read for the numbers a public page leaves
// out, role by role (the read's rows in the role tests). The seed league's Otters are made
// staff only and every role is given to a made-up account of its own; then each asks about
// the statistics page, the Otters' page and the Otters' game. Only the league's owner and
// admins of the whole league, and the Otters' coach and captain, are given the Otters'
// player lines; everyone else, an admin of the other seed league among them, gets exactly the
// answer of a page with nothing kept back. Roles are read on each request (T-75): a coach
// whose role is taken back gets nothing on the next.
import { leagueApiUrl, fail, ok, type Role, type Scope } from '@srleagues/core';
import * as database from '@srleagues/database';
import type { SessionIdentity, SignInService } from '@srleagues/providers';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databasePorts } from './database-ports.ts';
import { resolveLeagueApi } from './league-api.ts';
import type { WebPorts } from './ports.ts';
import type { SignInMail } from './sign-in/sign-in-mail.ts';
import {
  askedStaffNumbers,
  nothingMore,
  staffNumbersParts,
  staffNumbersRequest,
} from './staff-numbers-endpoint.ts';

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
let ports: WebPorts;
const sessions = new Map<string, SessionIdentity>();

const seed = (slug: string) => {
  const found = made.leagues.find((l) => l.slug === slug);
  if (found === undefined) throw new Error(`the seed has no ${slug} league`);
  return found;
};
const lakeside = () => seed('lakeside');

/** A made-up person signed in: their session's token. */
const signedIn = (email: string) => {
  const token = `token-${randomUUID()}`;
  sessions.set(token, {
    accountId: randomUUID(),
    email,
    emailConfirmed: true,
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

/** The owner gives an account a role in the league, as the seed does (seed-leagues.ts). */
async function give(
  leagueId: string,
  ownerId: string,
  accountId: string,
  role: Role,
  scope: Scope,
) {
  return database.withTransaction(db, { leagueId, accountId: ownerId }, (s) =>
    database.accessStore(s).createGrant({ accountId, role, scope, grantedByAccountId: ownerId }),
  );
}

type Facts = {
  seasonId: string;
  otters: string;
  herons: string;
  game: string;
};
let facts: Facts;
/** Each kind of person, by their session's token. */
const people = new Map<string, string>();

beforeAll(async () => {
  made = await database.madeUpDatabase({ underWay: true });
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
    warn: () => {},
    now: () => new Date(),
  });
  const { leagueId, ownerAccountId } = lakeside();
  const [season] = await ports.publicStats.seasonsOf(leagueId);
  if (season === undefined) throw new Error('lakeside has no public season');
  const store = ports.publicStats.readStoreOf(leagueId);
  const teams = await store.teams(season.id);
  const idOf = (slug: string) => {
    const team = teams.find((t) => t.slug === slug);
    if (team === undefined) throw new Error(`no ${slug}`);
    return team.id;
  };
  const otters = idOf('otters');
  const herons = idOf('herons');
  const game = (await store.decidedGames(season.id)).find((g) =>
    [g.homeTeamId, g.awayTeamId].includes(otters),
  );
  if (game === undefined) throw new Error("no Otters' game");
  const camp = (
    await database.withTransaction(db, { leagueId }, (s) => database.listPrograms(s))
  ).find((p) => p.slug === 'summer-camp');
  if (camp === undefined) throw new Error('no summer camp');
  facts = { seasonId: season.id, otters, herons, game: game.gameId };
  // The Otters keep their players' numbers to their staff, as their admin may choose.
  await database.withTransaction(db, { leagueId, accountId: ownerAccountId }, async (s) => {
    const teamsOf = database.teamsStore(s);
    const team = await teamsOf.find(otters);
    if (team === undefined) throw new Error('no Otters');
    await teamsOf.update(otters, { statsVisibility: 'staff' }, team.version);
  });
  people.set('owner', signedIn('owner@lakeside.example.test'));
  people.set('admin', signedIn('admin@lakeside.example.test'));
  people.set('scheduler', signedIn('scheduler@lakeside.example.test'));
  people.set('scorekeeper', signedIn('scorer@lakeside.example.test'));
  people.set('program scheduler', signedIn('camp-scheduler@lakeside.example.test'));
  // Maple Street's admin: an admin, of the other seed league.
  people.set("another league's admin", signedIn('admin@maple.example.test'));
  people.set('member with no role', signedIn(`fan-${randomUUID()}@example.test`));
  const roles: readonly [string, Role, Scope][] = [
    ["the Otters' coach", 'coach', { type: 'team', id: otters }],
    ["the Otters' captain", 'captain', { type: 'team', id: otters }],
    ["the Herons' coach", 'coach', { type: 'team', id: herons }],
    ['an admin of one program', 'admin', { type: 'program', id: camp.id }],
    ['a registrar', 'registrar', { type: 'league' }],
    ['an editor', 'editor', { type: 'league' }],
    ['a coach taken back', 'coach', { type: 'team', id: otters }],
  ];
  for (const [who, role, scope] of roles) {
    const token = signedIn(`${role}-${randomUUID()}@example.test`);
    people.set(who, token);
    await give(leagueId, ownerAccountId, await accountOf(token), role, scope);
  }
  // Taken back: the role is not in force on any request after.
  const takenBack = await accountOf(people.get('a coach taken back') ?? '');
  await database.withTransaction(db, { leagueId, accountId: ownerAccountId }, async (s) => {
    const access = database.accessStore(s);
    const [grant] = await access.activeGrantsOf(takenBack);
    if (grant === undefined) throw new Error('no grant to take back');
    await access.revokeGrant(grant.id, ownerAccountId);
  });
}, 180_000);

afterAll(async () => {
  await db.close();
  await made.close();
});

async function ask(who: string | 'visitor', query: Record<string, string>) {
  const token = who === 'visitor' ? undefined : people.get(who);
  if (who !== 'visitor' && token === undefined) throw new Error(`no ${who}`);
  const resolved = await resolveLeagueApi(
    {
      host: 'localhost:3000',
      path: leagueApiUrl({ id: lakeside().leagueId }, staffNumbersParts),
      session: token === undefined ? null : await ports.identify(token),
    },
    staffNumbersParts,
    { ...ports, siteOrigin: 'http://localhost:3000' },
    'visitor',
  );
  const read = { accessOf: ports.accessOf, publicStats: ports.publicStats, tracker: ports.tracker };
  return staffNumbersRequest(
    resolved.ok ? { ...resolved, ports: read } : resolved,
    askedStaffNumbers(new URLSearchParams(query)),
  );
}

const questions = () => ({
  stats: { page: 'stats', season: facts.seasonId, by: 'total' },
  team: { page: 'team', season: facts.seasonId, team: facts.otters },
  game: { page: 'game', game: facts.game },
});
/** The Otters' player of the seed's season under way: the adult league's child, Quinn S. */
const ottersPlayer = 'Quinn S.';

describe('the staff numbers read on the database, role by role (S-22, T-87, T-287)', () => {
  const allowed = ['owner', 'admin', "the Otters' coach", "the Otters' captain"];
  const notAllowed = [
    'visitor',
    'member with no role',
    "the Herons' coach",
    'an admin of one program',
    'a registrar',
    'an editor',
    'scheduler',
    'scorekeeper',
    'program scheduler',
    "another league's admin",
    'a coach taken back',
  ];

  it("gives the league's admins and the Otters' coach and captain the Otters' players, on every page", async () => {
    for (const who of allowed) {
      for (const [page, question] of Object.entries(questions())) {
        const answer = await ask(who, question);
        expect(answer.headers, `${who} ${page}`).toEqual({ 'Cache-Control': 'private, no-store' });
        const body = answer.body as { more: { page: string; notice: { text: string } } | null };
        expect(body.more?.page, `${who} ${page}`).toBe(page);
        expect(body.more?.notice.text, `${who} ${page}`).toContain('Lakeside Otters');
        expect(JSON.stringify(answer), `${who} ${page}`).toContain(ottersPlayer);
      }
    }
  });

  it('names no person by their id: a line is keyed by its place (audit 2.108, D-M4)', async () => {
    const teams = await ports.publicStats.readStoreOf(lakeside().leagueId).teams(facts.seasonId);
    // The only ids an answer may hold: the season's teams, the season and the game.
    const known = new Set([...teams.map((team) => team.id), facts.seasonId, facts.game]);
    for (const [page, question] of Object.entries(questions())) {
      const text = JSON.stringify(await ask('owner', question));
      const ids = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];
      expect(
        ids.filter((id) => !known.has(id)),
        page,
      ).toEqual([]);
      expect(text, page).toMatch(/"id":"(away-|home-)?player-0"/);
    }
  });

  it('answers everyone else exactly as for a page with nothing kept back', async () => {
    for (const who of notAllowed) {
      for (const [page, question] of Object.entries(questions())) {
        expect(await ask(who, question), `${who} ${page}`).toEqual(nothingMore);
      }
    }
    // A team with nothing kept back: the very same answer, the owner's too.
    expect(
      await ask('owner', { page: 'team', season: facts.seasonId, team: facts.herons }),
    ).toEqual(nothingMore);
  });

  it("never sends another team's hidden players with a team's page", async () => {
    // The Herons' page asked by the Otters' coach: nothing, so not the Otters' either.
    expect(
      await ask("the Otters' coach", { page: 'team', season: facts.seasonId, team: facts.herons }),
    ).toEqual(nothingMore);
  });
});
