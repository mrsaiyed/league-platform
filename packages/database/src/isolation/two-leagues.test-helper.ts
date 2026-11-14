// Two made-up leagues, A and B, for the two-league isolation harness (T-65). Each
// has a row in every league table and its own people (owner, member, the member's
// profile). Every text written for a league carries that league's marker word
// (`alpha` or `bravo`): names, short names, emails, reasons, summaries, so the
// harness can spot a leak of it even in a result that carries no id.
//
// One more account holds a role in both leagues, with its own profile and a
// child's. Its texts carry neither marker: it is not either league's to hide. The
// child is a person in both leagues, and each league's record of them is its own.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
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
  /** The member's grant (editor, whole league). */
  memberGrantId: string;
  /** A pending invitation, and the token of its link (only its hash is stored). */
  invitationId: string;
  invitationEmail: string;
  invitationToken: string;
  /** A job a worker holds, and the lease it holds it by. */
  jobId: string;
  jobLeaseToken: string;
  /** A top-level division of the season (it has one sub-division). */
  divisionId: string;
  subDivisionId: string;
  /** A venue and its court, and a venue with no court. */
  venueId: string;
  courtId: string;
  emptyVenueId: string;
  /** A team of the season in the division, with one person on its roster. */
  teamId: string;
  personId: string;
  /** A person who left the team (so not on a roster now): the child of the shared account. */
  formerPlayerId: string;
  rosterEntryId: string;
  /** The season's regular-season stage and its first round. */
  stageId: string;
  roundId: string;
  /** A second team of the season, the team's opponent. */
  opponentId: string;
  /** The schedule's first published revision, and a draft based on it. */
  scheduleRevisionId: string;
  scheduleDraftId: string;
  /** A final game (team at home), corrected once, at the venue's court. */
  gameId: string;
  /** A game still to play, with the member assigned to score it. */
  upcomingGameId: string;
  gameAssignmentId: string;
  /** The final game's two events, its state, the player's line in it, and a session scoring the upcoming game. */
  gameEventIds: string[];
  gameStateId: string;
  playerGameStatsId: string;
  scoringSessionId: string;
  /** When that session began (ms): what taking the game over from it names. */
  scoringSessionSince: number;
  /** A player added at the final game's scorer's table, waiting for the admin's review (S-6). */
  walkUpRosterEntryId: string;
  /** The team's standings row, an adjustment to it, and the player's season totals. */
  standingsRowId: string;
  standingsAdjustmentId: string;
  seasonPlayerTotalsId: string;
  /** A fixtures import, applied, with what it created. */
  importId: string;
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

/** When each league's seeded scoring session began; its lease runs two minutes from then. */
const seededSessionSince = Date.UTC(2026, 11, 13, 18, 0, 0);

/**
 * The harness's clock (T-116 leases): fixed half a minute into the seeded sessions'
 * leases, so whether a lease has run out never depends on when the tests run.
 */
export const harnessNow = seededSessionSince + 30_000;

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

async function seededLeague(
  pglite: PGlite,
  m: string,
  sharedAccountId: string,
  sharedChildProfileId: string,
) {
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
    [
      `insert into role_grants (league_id, account_id, role, granted_by_account_id)
       values ($1, $2, 'editor', $3)`,
      [leagueId, sharedAccountId, ownerId],
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
  const memberGrantId = await id(
    pglite,
    `insert into role_grants (league_id, account_id, role, granted_by_account_id)
     values ($1, $2, 'editor', $3)`,
    [leagueId, member.accountId, ownerId],
  );
  const invitationToken = randomBytes(32).toString('base64url');
  const invitationEmail = `${unique(m)}-invitee@example.test`;
  const invitationId = await id(
    pglite,
    `insert into invitations (league_id, email, role, token_hash, invited_by_account_id, expires_at)
     values ($1, $2, 'scheduler', $3, $4, now() + interval '7 days')`,
    [
      leagueId,
      invitationEmail,
      createHash('sha256').update(invitationToken).digest('hex'),
      ownerId,
    ],
  );
  // The season's structure: a division with a sub-division, a venue with a court,
  // and a setting value at each level.
  const divisionId = await id(
    pglite,
    'insert into divisions (league_id, season_id, name, color) values ($1, $2, $3, $4)',
    [leagueId, seasonId, `Division ${m}`, '#c8a84b'],
  );
  const subDivisionId = await id(
    pglite,
    `insert into divisions (league_id, season_id, parent_division_id, name)
     values ($1, $2, $3, $4)`,
    [leagueId, seasonId, divisionId, `Sub-division ${m}`],
  );
  const venueId = await id(
    pglite,
    'insert into venues (league_id, name, address) values ($1, $2, $3)',
    [leagueId, `Venue ${m}`, `1 ${m} Street`],
  );
  const courtId = await id(
    pglite,
    'insert into courts (league_id, venue_id, name) values ($1, $2, $3)',
    [leagueId, venueId, `Court ${m}`],
  );
  const emptyVenueId = await id(
    pglite,
    'insert into venues (league_id, name, address) values ($1, $2, $3)',
    [leagueId, `Empty venue ${m}`, `2 ${m} Street`],
  );
  for (const [level, programPlace, seasonPlace] of [
    ['league', null, null],
    ['program', programId, null],
    ['season', null, seasonId],
  ] as const) {
    await pglite.query(
      `insert into setting_values (league_id, level, program_id, season_id, key, value)
       values ($1, $2, $3, $4, 'members.startPage', $5)`,
      [leagueId, level, programPlace, seasonPlace, JSON.stringify({ version: 1, value: m })],
    );
  }
  // A team in the division with a player on its roster, the member as its coach and
  // an invitation to captain it. The shared account's child is a person in both
  // leagues, each league's own record of them (R-3).
  const teamId = await id(
    pglite,
    `insert into teams (league_id, season_id, division_id, slug, name, color, stats_visibility)
     values ($1, $2, $3, $4, $5, '#1a2b3c', 'staff')`,
    [leagueId, seasonId, divisionId, unique(`${m}-team`), `Team ${m}`],
  );
  const personId = await id(
    pglite,
    `insert into people (league_id, first_name, last_name, public_name, contact_email, birth_date, is_minor)
     values ($1, $2, 'Player', $3, $4, '2011-04-05', true)`,
    [leagueId, m, `Number ${m}`, `${unique(m)}-parent@example.test`],
  );
  const rosterEntryId = await id(
    pglite,
    `insert into roster_entries (league_id, team_id, person_id, jersey_number, role, joined_on)
     values ($1, $2, $3, '23', 'captain', '2026-11-01')`,
    [leagueId, teamId, personId],
  );
  const childPersonId = await id(
    pglite,
    `insert into people (league_id, profile_id, first_name, last_name) values ($1, $2, $3, 'Child')`,
    [leagueId, sharedChildProfileId, m],
  );
  await pglite.query(
    `insert into roster_entries (league_id, team_id, person_id, jersey_number, left_on)
     values ($1, $2, $3, '23', '2026-11-30')`,
    [leagueId, teamId, childPersonId],
  );
  await pglite.query(
    `insert into role_grants (league_id, account_id, role, scope_type, scope_id, granted_by_account_id)
     values ($1, $2, 'coach', 'team', $3, $4)`,
    [leagueId, member.accountId, teamId, ownerId],
  );
  await pglite.query(
    `insert into invitations
       (league_id, email, role, scope_type, scope_id, token_hash, invited_by_account_id, expires_at)
     values ($1, $2, 'captain', 'team', $3, $4, $5, now() + interval '7 days')`,
    [
      leagueId,
      `${unique(m)}-captain@example.test`,
      teamId,
      createHash('sha256').update(randomBytes(32)).digest('hex'),
      ownerId,
    ],
  );
  // The season's schedule: its regular-season stage, a round, a second team, one
  // published revision with a draft on top of it, a game decided and then corrected
  // (with its correction), a game still to play with the member assigned to score it.
  const stageId = await id(
    pglite,
    'insert into stages (league_id, season_id, name) values ($1, $2, $3)',
    [leagueId, seasonId, `Regular season ${m}`],
  );
  const roundId = await id(
    pglite,
    `insert into rounds (league_id, season_id, number, label, date)
     values ($1, $2, 1, $3, '2026-12-06')`,
    [leagueId, seasonId, `Week 1 ${m}`],
  );
  const opponentId = await id(
    pglite,
    `insert into teams (league_id, season_id, division_id, slug, name, stats_visibility)
     values ($1, $2, $3, $4, $5, 'everyone')`,
    [leagueId, seasonId, divisionId, unique(`${m}-opponent`), `Opponent ${m}`],
  );
  const scheduleRevisionId = await id(
    pglite,
    `insert into schedule_revisions (league_id, season_id, number, published_by_account_id, summary)
     values ($1, $2, 1, $3, '{"version": 1, "gamesAdded": 2}')`,
    [leagueId, seasonId, ownerId],
  );
  const scheduleDraftId = await id(
    pglite,
    `insert into schedule_drafts (league_id, season_id, based_on_revision, changes)
     values ($1, $2, 1, $3)`,
    [
      leagueId,
      seasonId,
      JSON.stringify({
        version: 1,
        changes: [{ kind: 'rename-round', roundId, label: `Week 1 ${m}` }],
      }),
    ],
  );
  const gameId = await id(
    pglite,
    `insert into games (league_id, season_id, stage_id, division_id, round_id, game_number,
       home_team_id, away_team_id, starts_at, venue_id, court_id, status, capture_mode,
       home_score, away_score, format, finalized_at, external_ref)
     values ($1, $2, $3, $4, $5, 1, $6, $7, '2026-12-06T18:00:00Z', $8, $9, 'final', 'live',
       52, 48, '{"version": 1, "periods": 2}', '2026-12-06T19:30:00Z', $10)`,
    [
      leagueId,
      seasonId,
      stageId,
      divisionId,
      roundId,
      teamId,
      opponentId,
      venueId,
      courtId,
      `${m}-fixture-1`,
    ],
  );
  await pglite.query(
    `insert into game_corrections (league_id, game_id, account_id, reason, before, after)
     values ($1, $2, $3, $4, '{"version": 1, "homeScore": 50}', '{"version": 1, "homeScore": 52}')`,
    [leagueId, gameId, ownerId, `A basket for ${m} was missed`],
  );
  const upcomingGameId = await id(
    pglite,
    `insert into games (league_id, season_id, stage_id, round_id, game_number, home_team_id,
       away_team_id, starts_at, venue_id, capture_mode)
     values ($1, $2, $3, $4, 2, $5, $6, '2026-12-13T18:00:00Z', $7, 'final')`,
    [leagueId, seasonId, stageId, roundId, opponentId, teamId, venueId],
  );
  const gameAssignmentId = await id(
    pglite,
    'insert into game_assignments (league_id, game_id, account_id) values ($1, $2, $3)',
    [leagueId, upcomingGameId, member.accountId],
  );
  // The live game: the final game's events, state and the player's line; a session
  // scoring the upcoming game; a walk-up player added at the final game's table.
  const gameEventIds: string[] = [];
  for (const [seq, type, payload] of [
    [1, 'start', {}],
    [2, 'score', { side: 'home', playerId: personId, points: 2 }],
  ] as const) {
    gameEventIds.push(
      await id(
        pglite,
        `insert into game_events (league_id, game_id, seq, command_id, type, payload, tapped_at, account_id)
         values ($1, $2, $3, $4, $5, $6, '2026-12-06T18:05:00Z', $7)`,
        [leagueId, gameId, seq, randomUUID(), type, JSON.stringify(payload), member.accountId],
      ),
    );
  }
  const gameStateId = await id(
    pglite,
    'insert into game_states (league_id, game_id, seq, state) values ($1, $2, 2, $3)',
    [leagueId, gameId, JSON.stringify({ version: 1, status: 'final', plays: [] })],
  );
  const playerGameStatsId = await id(
    pglite,
    `insert into player_game_stats
       (league_id, game_id, team_id, person_id, jersey_number, played, seconds_played, stats)
     values ($1, $2, $3, $4, '23', true, 1200, '{"points": 2, "fg2": 1}')`,
    [leagueId, gameId, teamId, personId],
  );
  // Begun and held at set moments, so a takeover can name it and, by the harness's
  // fixed clock (harnessNow), its lease has not run out, whatever the time of day.
  const scoringSessionSince = seededSessionSince;
  const scoringSessionId = await id(
    pglite,
    `insert into scoring_sessions (league_id, game_id, account_id, device_id, created_at, held_until)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      leagueId,
      upcomingGameId,
      member.accountId,
      `${m}-tablet`,
      new Date(scoringSessionSince).toISOString(),
      new Date(scoringSessionSince + 120_000).toISOString(),
    ],
  );
  const walkUpPersonId = await id(
    pglite,
    `insert into people (league_id, first_name, last_name) values ($1, $2, 'Walk-up')`,
    [leagueId, m],
  );
  const walkUpRosterEntryId = await id(
    pglite,
    `insert into roster_entries (league_id, team_id, person_id, jersey_number, added_at_game_id, needs_review)
     values ($1, $2, $3, '7', $4, true)`,
    [leagueId, teamId, walkUpPersonId, gameId],
  );
  // The calculated tables: the team's standings row with an adjustment, and the
  // player's season totals.
  const standingsRowId = await id(
    pglite,
    `insert into standings_rows (league_id, season_id, division_id, team_id, rank, seed,
       games_played, wins, points_for, points_against, streak_result, streak_length)
     values ($1, $2, $3, $4, 1, 1, 1, 1, 52, 48, 'won', 1)`,
    [leagueId, seasonId, divisionId, teamId],
  );
  const standingsAdjustmentId = await id(
    pglite,
    `insert into standings_adjustments (league_id, season_id, team_id, points, reason, account_id)
     values ($1, $2, $3, -1, $4, $5)`,
    [leagueId, seasonId, teamId, `Late roster for ${m}`, ownerId],
  );
  const seasonPlayerTotalsId = await id(
    pglite,
    `insert into season_player_totals (league_id, season_id, person_id, games_played,
       seconds_played, seconds_games, stats)
     values ($1, $2, $3, 1, 1200, 1, $4)`,
    [
      leagueId,
      seasonId,
      personId,
      JSON.stringify({ version: 1, stats: { points: { total: 2, gamesRecorded: 1 } } }),
    ],
  );
  const importId = await id(
    pglite,
    `insert into imports (league_id, season_id, kind, status, account_id, file_name, report,
       created, applied_at)
     values ($1, $2, 'fixtures', 'applied', $3, $4, '{"version": 1, "rows": 2}', $5, now())`,
    [
      leagueId,
      seasonId,
      ownerId,
      `${m}-fixtures.csv`,
      JSON.stringify({ version: 1, games: [upcomingGameId] }),
    ],
  );
  // A job a worker holds. It carries ids only (T-131), so no marker: its ids are the league's.
  const jobLeaseToken = randomUUID();
  const jobId = await id(
    pglite,
    `insert into jobs (league_id, type, ids, dedupe_key, state, attempts, lease_token, lease_expires_at)
     values ($1, 'notify.event', $2, $3, 'running', 1, $4, now() + interval '1 hour')`,
    [leagueId, JSON.stringify({ seasonId }), seasonId, jobLeaseToken],
  );
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
    memberGrantId,
    invitationId,
    invitationEmail,
    invitationToken,
    jobId,
    jobLeaseToken,
    divisionId,
    subDivisionId,
    venueId,
    courtId,
    emptyVenueId,
    teamId,
    personId,
    formerPlayerId: childPersonId,
    rosterEntryId,
    stageId,
    roundId,
    opponentId,
    scheduleRevisionId,
    scheduleDraftId,
    gameId,
    upcomingGameId,
    gameAssignmentId,
    gameEventIds,
    gameStateId,
    playerGameStatsId,
    scoringSessionId,
    scoringSessionSince,
    walkUpRosterEntryId,
    standingsRowId,
    standingsAdjustmentId,
    seasonPlayerTotalsId,
    importId,
  };
}

/** A fresh database holding leagues A and B. Close it when done. */
export async function openTwoLeagues(): Promise<TwoLeagues> {
  const pglite = await freshSchema();
  const shared = await person(pglite, `${unique('both')}@example.test`, 'Shared', 'Person');
  const childProfileId = await profile(pglite, shared.accountId, 'Shared', 'Child', 'guardian');
  const a = await seededLeague(pglite, 'alpha', shared.accountId, childProfileId);
  const b = await seededLeague(pglite, 'bravo', shared.accountId, childProfileId);
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
