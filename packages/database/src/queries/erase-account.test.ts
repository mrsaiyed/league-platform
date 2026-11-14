// eraseAccount (record 052, T-52, T-220): the account set for the transaction is
// emptied in place; its own profiles, grants, game assignments, scoring sessions and
// sign-in rows go, its accepted invitations lose the address; nothing else changes.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  freshSchema,
  newAccount,
  newGame,
  newLeague,
  newPerson,
  newSeason,
  newStage,
  newTeam,
  one,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { eraseAccount } from './erase-account.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let b: MadeLeague;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  a = await newLeague(pglite);
  b = await newLeague(pglite);
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const erase = (accountId: string) =>
  withTransaction(db, { accountId }, (scope) => eraseAccount(scope));

async function profileFor(accountId: string, relation: 'self' | 'guardian', profileId?: string) {
  const id =
    profileId ??
    (
      await one<{ id: string }>(
        pglite,
        "insert into profiles (first_name, last_name) values ('Made', 'Up') returning id",
      )
    ).id;
  await pglite.query(
    'insert into profile_access (account_id, profile_id, relation) values ($1, $2, $3)',
    [accountId, id, relation],
  );
  return id;
}

const count = async (sql: string, params: unknown[]) =>
  (await one<{ n: number }>(pglite, `select count(*)::int as n from (${sql}) as rows`, params)).n;

/** A live game in the league, ready to be assigned and scored. */
async function liveGame(league: MadeLeague) {
  const seasonId = await newSeason(pglite, league.leagueId, league.defaultProgramId);
  return newGame(pglite, {
    leagueId: league.leagueId,
    seasonId,
    stageId: await newStage(pglite, league.leagueId, seasonId),
    homeTeamId: await newTeam(pglite, league.leagueId, seasonId),
    awayTeamId: await newTeam(pglite, league.leagueId, seasonId),
    columns: { status: 'live', capture_mode: 'live', home_score: 0, away_score: 0 },
  });
}

/** Assigns the account to the game and lets it hold the game's scoring session. */
async function scoring(league: MadeLeague, gameId: string, accountId: string) {
  await pglite.query(
    'insert into game_assignments (league_id, game_id, account_id) values ($1, $2, $3)',
    [league.leagueId, gameId, accountId],
  );
  await pglite.query(
    `insert into scoring_sessions (league_id, game_id, account_id, device_id, held_until)
     values ($1, $2, $3, 'tablet-1', now() + interval '2 minutes')`,
    [league.leagueId, gameId, accountId],
  );
}

let tokens = 0;
const tokenHash = () => (++tokens).toString(16).padStart(64, '0');

/** An invitation in the league to `email`, accepted by `acceptedBy` if given. */
async function invitation(league: MadeLeague, email: string, acceptedBy?: string) {
  return (
    await one<{ id: string }>(
      pglite,
      `insert into invitations (league_id, email, role, token_hash, expires_at,
         accepted_at, accepted_by_account_id)
       values ($1, $2, 'scorekeeper', $3, now() + interval '7 days',
         case when $4::uuid is null then null else now() end, $4::uuid)
       returning id`,
      [league.leagueId, email, tokenHash(), acceptedBy ?? null],
    )
  ).id;
}

/** The sign-in store's rows for one sign-in user and address, as the store would write them. */
async function signInRows(signInId: string, email: string, sessionId: string) {
  const [requestId, guessId, ticket] = [
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  ];
  await pglite.query(`insert into sign_in.users (user_id) values ($1)`, [signInId]);
  await pglite.query(`insert into sign_in.devices (user_id, device_id) values ($1, 'device-1')`, [
    signInId,
  ]);
  await pglite.query(
    `insert into sign_in.sessions (session_id, user_id, device_label, signed_in_at,
       last_active_at, last_sign_in_at, access_token_hash, access_expires_at, refresh_token_hash)
     values ($1, $2, 'Phone', now(), now(), now(), $1 || '-access', now(), $1 || '-refresh')`,
    [sessionId, signInId],
  );
  await pglite.query(
    `insert into sign_in.refresh_tokens (token_hash, session_id) values ($1 || '-refresh', $1)`,
    [sessionId],
  );
  await pglite.query(
    `insert into sign_in.codes (email, verify_type, expires_at, attempts_left)
     values ($1, 'recovery', now() + interval '10 minutes', 5)`,
    [email],
  );
  await pglite.query(
    `insert into sign_in.proofs (proof_hash, email, user_id, expires_at, access_token,
       refresh_token, access_expires_at, vendor_session_id)
     values ($1 || '-proof', $2, $3, now() + interval '15 minutes', 'a', 'r', now(), 'v')`,
    [sessionId, email, signInId],
  );
  await pglite.query(
    `insert into sign_in.code_requests (id, scope, subject, asked_at) values ($1, 'email', $2, now())`,
    [requestId, email],
  );
  await pglite.query(
    `insert into sign_in.guesses (id, ticket, scope, subject, counted_at)
     values ($1, $2, 'email', $3, now())`,
    [guessId, ticket, email],
  );
  await pglite.query(
    `insert into sign_in.guess_locks (scope, subject, locked_until, by_guess_id)
     values ('email', $1, now() + interval '15 minutes', $2)`,
    [email, guessId],
  );
}

/** How many rows the sign-in store holds for the sign-in user, its session or the address. */
async function signInRowsLeft(signInId: string, email: string, sessionId: string) {
  const byUser = ['users', 'devices', 'sessions', 'proofs'].map((table) =>
    count(`select 1 from sign_in.${table} where user_id = $1`, [signInId]),
  );
  const byEmail = ['codes', 'proofs'].map((table) =>
    count(`select 1 from sign_in.${table} where lower(email) = lower($1)`, [email]),
  );
  const bySubject = ['code_requests', 'guesses', 'guess_locks'].map((table) =>
    count(`select 1 from sign_in.${table} where scope = 'email' and lower(subject) = lower($1)`, [
      email,
    ]),
  );
  const tokensLeft = count('select 1 from sign_in.refresh_tokens where session_id = $1', [
    sessionId,
  ]);
  return (await Promise.all([...byUser, ...byEmail, ...bySubject, tokensLeft])).reduce(
    (sum, n) => sum + n,
    0,
  );
}

describe('eraseAccount (record 052)', () => {
  it('empties the row in place and removes what is the account’s alone', async () => {
    const signInId = crypto.randomUUID();
    const account = await newAccount(pglite, 'erase-me@example.test');
    await pglite.query(
      "update accounts set sign_in_id = $1, phone = '555-0100', last_seen_at = now() where id = $2",
      [signInId, account],
    );
    const self = await profileFor(account, 'self');
    const child = await profileFor(account, 'guardian');
    const otherParent = await newAccount(pglite);
    const shared = await profileFor(account, 'guardian');
    await profileFor(otherParent, 'guardian', shared);
    // Another account with the same kinds of rows, which must all stay.
    const otherSignInId = crypto.randomUUID();
    await pglite.query('update accounts set sign_in_id = $1 where id = $2', [
      otherSignInId,
      otherParent,
    ]);
    for (const league of [a, b]) {
      for (const holder of [account, otherParent]) {
        await pglite.query(
          "insert into role_grants (league_id, account_id, role) values ($1, $2, 'scorekeeper')",
          [league.leagueId, holder],
        );
        await scoring(league, await liveGame(league), holder);
      }
    }
    // The address it was invited at need not be its account's address.
    const accepted = await invitation(a, 'invited-at@example.test', account);
    const othersAccepted = await invitation(b, 'other-parent@example.test', otherParent);
    const pending = await invitation(b, 'erase-me@example.test');
    // The store's rows by address may be in any case (lower() in erase_account).
    await signInRows(signInId, 'Erase-Me@Example.test', 's-erase');
    await signInRows(otherSignInId, 'other-parent@example.test', 's-other');
    await pglite.query(
      `insert into sign_in.code_requests (id, scope, subject, asked_at)
       values ($1, 'network', '203.0.113.7', now())`,
      [crypto.randomUUID()],
    );

    expect(await erase(account)).toBe('erased');

    expect(
      await one(
        pglite,
        'select email, display_name, phone, last_seen_at, sign_in_id from accounts where id = $1',
        [account],
      ),
    ).toEqual({
      email: `${account}@erased.invalid`,
      display_name: null,
      phone: null,
      last_seen_at: null,
      sign_in_id: null,
    });
    expect(await count('select 1 from profile_access where account_id = $1', [account])).toBe(0);
    expect(await count('select 1 from profiles where id = any($1)', [[self, child]])).toBe(0);
    // A child another account also acts for stays with that account.
    expect(await count('select 1 from profile_access where profile_id = $1', [shared])).toBe(1);
    expect(
      await count('select 1 from role_grants where account_id = $1 and revoked_at is null', [
        account,
      ]),
    ).toBe(0);
    expect(
      await count(
        'select 1 from role_grants where account_id = $1 and revoked_by_account_id = $1',
        [account],
      ),
    ).toBe(2);
    for (const table of ['game_assignments', 'scoring_sessions']) {
      expect(await count(`select 1 from ${table} where account_id = $1`, [account])).toBe(0);
    }
    expect(await one(pglite, 'select email from invitations where id = $1', [accepted])).toEqual({
      email: `${account}@erased.invalid`,
    });
    // An invitation not yet accepted is the league's, sent to an address, not an account's.
    expect(await one(pglite, 'select email from invitations where id = $1', [pending])).toEqual({
      email: 'erase-me@example.test',
    });
    // Its proofs, by sign-in user and by address, its sessions, codes, code requests,
    // guesses and locks are gone; the network's counts stay.
    expect(await signInRowsLeft(signInId, 'erase-me@example.test', 's-erase')).toBe(0);
    expect(await count("select 1 from sign_in.code_requests where scope = 'network'", [])).toBe(1);

    // The other parent's account and everything of theirs is untouched.
    expect(
      await count('select 1 from accounts where id = $1 and email like $2 and sign_in_id = $3', [
        otherParent,
        '%@example.test',
        otherSignInId,
      ]),
    ).toBe(1);
    expect(
      await count('select 1 from role_grants where account_id = $1 and revoked_at is null', [
        otherParent,
      ]),
    ).toBe(2);
    for (const table of ['game_assignments', 'scoring_sessions']) {
      expect(await count(`select 1 from ${table} where account_id = $1`, [otherParent])).toBe(2);
    }
    expect(
      await one(pglite, 'select email from invitations where id = $1', [othersAccepted]),
    ).toEqual({ email: 'other-parent@example.test' });
    expect(await signInRowsLeft(otherSignInId, 'other-parent@example.test', 's-other')).toBe(10);
    expect(
      await count('select 1 from sign_in.sessions where user_id = $1 and not ended', [
        otherSignInId,
      ]),
    ).toBe(1);
  });

  it('refuses, changing nothing, while the account owns a league', async () => {
    expect(await erase(a.ownerId)).toBe('owns-a-league');
    expect(
      await count("select 1 from accounts where id = $1 and email like '%@example.test'", [
        a.ownerId,
      ]),
    ).toBe(1);
  });

  it('refuses while one of its profiles is still linked to a league’s person', async () => {
    const account = await newAccount(pglite);
    const self = await profileFor(account, 'self');
    await newPerson(pglite, a.leagueId, { profileId: self });
    expect(await erase(account)).toBe('profile-in-a-league');
    expect(await count('select 1 from profile_access where account_id = $1', [account])).toBe(1);
  });

  it('needs the account set for the transaction', async () => {
    await expect(
      withTransaction(db, { leagueId: a.leagueId }, (scope) => eraseAccount(scope)),
    ).rejects.toThrow('needs a transaction opened for an account');
  });
});
