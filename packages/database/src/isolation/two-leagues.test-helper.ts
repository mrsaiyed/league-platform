// Two made-up leagues, A and B, for the two-league isolation harness (T-65). Each
// has a row in every league table and its own people (owner, member, the member's
// profile). Every text written for a league carries that league's marker word
// (`alpha` or `bravo`): names, short names, emails, reasons, summaries, so the
// harness can spot a leak of it even in a result that carries no id.
//
// One more account holds a role in both leagues, with its own profile and a
// child's. Its texts carry neither marker: it is not either league's to hide.
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  one,
  unique,
  type MadeLeague,
  type Sql,
} from '../schema/schema.test-helper.ts';

/** One league of the pair, and the records a case can aim at. */
export type LeagueRecords = MadeLeague & {
  /** A word in every text written for this league and no other. */
  marker: string;
  slug: string;
  /** A program besides the default one, with a short name only this league uses. */
  programId: string;
  programSlug: string;
  seasonId: string;
  seasonSlug: string;
  /** An account holding a role in this league only, and its own profile. */
  memberId: string;
  memberProfileId: string;
  /** A short name the league used to have (it still forwards). */
  formerSlug: string;
};

export type TwoLeagues = {
  pglite: PGlite;
  db: DatabaseHandle;
  a: LeagueRecords;
  b: LeagueRecords;
  /** An account with a role in both leagues. */
  sharedAccountId: string;
  close: () => Promise<void>;
};

const id = async (db: Sql, text: string, params: unknown[]) =>
  (await one<{ id: string }>(db, `${text} returning id`, params)).id;

/** An account with its own (self) profile. */
async function person(db: Sql, email: string, first: string, last: string) {
  const accountId = await id(db, 'insert into accounts (email, display_name) values ($1, $2)', [
    email,
    `${first} ${last}`,
  ]);
  const profileId = await profile(db, accountId, first, last, 'self');
  return { accountId, profileId };
}

async function profile(db: Sql, accountId: string, first: string, last: string, relation: string) {
  const profileId = await id(db, 'insert into profiles (first_name, last_name) values ($1, $2)', [
    first,
    last,
  ]);
  await db.query(
    'insert into profile_access (account_id, profile_id, relation) values ($1, $2, $3)',
    [accountId, profileId, relation],
  );
  return profileId;
}

async function seededLeague(pglite: PGlite, m: string, sharedAccountId: string) {
  const owner = await person(pglite, `${unique(m)}-owner@example.test`, m, 'Owner');
  const ownerId = owner.accountId;
  const slug = unique(m);
  // The league and its default program in one transaction, as the leagues command will.
  const { leagueId, defaultProgramId } = await pglite.transaction(async (tx) => {
    const leagueId = await id(
      tx,
      `insert into leagues (slug, name, time_zone, audience, listed, owner_account_id, contact_email)
       values ($1, $2, 'America/Chicago', 'adult', true, $3, $4)`,
      [slug, `League ${m}`, ownerId, `${m}-contact@example.test`],
    );
    const defaultProgramId = await id(
      tx,
      `insert into programs (league_id, slug, name, sport_key, is_default)
       values ($1, 'main', $2, 'basketball', true)`,
      [leagueId, `Main ${m}`],
    );
    return { leagueId, defaultProgramId };
  });
  const programSlug = unique(`${m}-program`);
  const programId = await id(
    pglite,
    `insert into programs (league_id, slug, name, sport_key) values ($1, $2, $3, 'volleyball')`,
    [leagueId, programSlug, `Program ${m}`],
  );
  const seasonSlug = unique(`${m}-season`);
  const seasonId = await id(
    pglite,
    'insert into seasons (league_id, program_id, slug, name) values ($1, $2, $3, $4)',
    [leagueId, programId, seasonSlug, `Season ${m}`],
  );
  const member = await person(pglite, `${unique(m)}-member@example.test`, m, 'Member');
  const formerSlug = unique(`${m}-former`);
  const rows: [string, unknown[]][] = [
    [
      `insert into league_slug_history (league_id, old_slug, expires_at)
       values ($1, $2, now() + interval '1 year')`,
      [leagueId, formerSlug],
    ],
    [
      'insert into league_features (league_id, feature_key, enabled) values ($1, $2, true)',
      [leagueId, `${m}_feature`],
    ],
    ...[member.accountId, sharedAccountId].map((account): [string, unknown[]] => [
      `insert into role_grants (league_id, account_id, role, granted_by_account_id)
       values ($1, $2, 'editor', $3)`,
      [leagueId, account, ownerId],
    ]),
    [
      `insert into invitations (league_id, email, role, token_hash, invited_by_account_id, expires_at)
       values ($1, $2, 'scheduler', encode(sha256(convert_to($2, 'UTF8')), 'hex'), $3,
               now() + interval '7 days')`,
      [leagueId, `${unique(m)}-invitee@example.test`, ownerId],
    ],
    [
      `insert into activity_log (league_id, actor_account_id, action, summary)
       values ($1, $2, 'league.renamed', $3)`,
      [leagueId, ownerId, `Renamed ${m}`],
    ],
    [
      `insert into support_access_log (league_id, staff_account_id, reason, ended_at)
       values ($1, $2, $3, now() + interval '1 hour')`,
      [leagueId, ownerId, `Asked for help with ${m}`],
    ],
    [
      `insert into command_receipts (league_id, command_id, command, account_id, result)
       values ($1, $2, 'leagues.rename', $3, $4)`,
      [leagueId, randomUUID(), ownerId, JSON.stringify({ ok: true, marker: m })],
    ],
  ];
  for (const [text, params] of rows) await pglite.query(text, params);
  return {
    leagueId,
    ownerId,
    defaultProgramId,
    marker: m,
    slug,
    programId,
    programSlug,
    seasonId,
    seasonSlug,
    memberId: member.accountId,
    memberProfileId: member.profileId,
    formerSlug,
  };
}

/** A fresh database holding leagues A and B. Close it when done. */
export async function openTwoLeagues(): Promise<TwoLeagues> {
  const pglite = await freshSchema();
  const shared = await person(pglite, `${unique('both')}@example.test`, 'Shared', 'Person');
  await profile(pglite, shared.accountId, 'Shared', 'Child', 'guardian');
  const a = await seededLeague(pglite, 'alpha', shared.accountId);
  const b = await seededLeague(pglite, 'bravo', shared.accountId);
  const db = createDatabase({ kind: 'pglite', pglite });
  return {
    pglite,
    db,
    a,
    b,
    sharedAccountId: shared.accountId,
    close: async () => {
      await db.close();
      await pglite.close();
    },
  };
}
