// Generated from supabase/migrations by `npm run db:types`. Do not edit: a test
// fails when this file differs from a fresh generation.
import type { ColumnType, Generated, GeneratedAlways } from 'kysely';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
/** jsonb is written as an object: both dialects send an object as JSON, but pg sends an array as a PostgreSQL array. */
export type JsonObject = { [key: string]: JsonValue };

export interface AccountsTable {
  id: Generated<string>;
  email: string;
  display_name: string | null;
  phone: string | null;
  last_seen_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
  sign_in_id: string | null;
}

export interface ActivityLogTable {
  id: Generated<string>;
  league_id: string;
  actor_account_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  summary: string;
  details: ColumnType<JsonValue, JsonObject | undefined, JsonObject>;
  at: ColumnType<Date, Date | string | undefined, Date | string>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface CommandReceiptsTable {
  id: Generated<string>;
  league_id: string;
  command_id: string;
  command: string;
  account_id: string | null;
  result: ColumnType<JsonValue, JsonObject, JsonObject>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface CourtsTable {
  id: Generated<string>;
  league_id: string;
  venue_id: string;
  name: string;
  sort: Generated<number>;
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface DivisionsTable {
  id: Generated<string>;
  league_id: string;
  season_id: string;
  parent_division_id: string | null;
  name: string;
  color: string | null;
  sort: Generated<number>;
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface GameAssignmentsTable {
  id: Generated<string>;
  league_id: string;
  game_id: string;
  account_id: string;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface GameCorrectionsTable {
  id: Generated<string>;
  league_id: string;
  game_id: string;
  account_id: string;
  reason: string;
  before: ColumnType<JsonValue, JsonObject, JsonObject>;
  after: ColumnType<JsonValue, JsonObject, JsonObject>;
  at: ColumnType<Date, Date | string | undefined, Date | string>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  written_in: string | null;
}

export interface GameEventsTable {
  id: Generated<string>;
  league_id: string;
  game_id: string;
  seq: number;
  command_id: string;
  type: string;
  payload: ColumnType<JsonValue, JsonObject | undefined, JsonObject>;
  tapped_at: ColumnType<Date, Date | string, Date | string>;
  account_id: string | null;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface GameStatesTable {
  id: Generated<string>;
  league_id: string;
  game_id: string;
  seq: Generated<number>;
  state: ColumnType<JsonValue, JsonObject, JsonObject>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface GamesTable {
  id: Generated<string>;
  league_id: string;
  season_id: string;
  stage_id: string;
  division_id: string | null;
  round_id: string | null;
  game_number: number | null;
  home_team_id: string;
  away_team_id: string;
  starts_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  venue_id: string | null;
  court_id: string | null;
  status: Generated<string>;
  capture_mode: string;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: GeneratedAlways<string | null>;
  format: ColumnType<JsonValue | null, JsonObject | null, JsonObject | null>;
  format_fixed_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  finalized_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  external_ref: string | null;
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ImportsTable {
  id: Generated<string>;
  league_id: string;
  season_id: string | null;
  kind: string;
  status: Generated<string>;
  account_id: string;
  file_name: string | null;
  report: ColumnType<JsonValue, JsonObject | undefined, JsonObject>;
  created: ColumnType<JsonValue, JsonObject | undefined, JsonObject>;
  applied_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  undone_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface InvitationsTable {
  id: Generated<string>;
  league_id: string;
  email: string;
  role: string;
  scope_type: Generated<string>;
  scope_id: string | null;
  scope_program_id: GeneratedAlways<string | null>;
  token_hash: string;
  invited_by_account_id: string | null;
  expires_at: ColumnType<Date, Date | string, Date | string>;
  accepted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  accepted_by_account_id: string | null;
  cancelled_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
  scope_team_id: GeneratedAlways<string | null>;
}

export interface JobsTable {
  id: Generated<string>;
  league_id: string;
  type: string;
  ids: ColumnType<JsonValue, JsonObject | undefined, JsonObject>;
  dedupe_key: string | null;
  state: Generated<string>;
  run_after: ColumnType<Date, Date | string | undefined, Date | string>;
  attempts: Generated<number>;
  max_attempts: Generated<number>;
  lease_token: string | null;
  lease_expires_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  last_error: string | null;
  finished_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface LeagueFeaturesTable {
  id: Generated<string>;
  league_id: string;
  feature_key: string;
  enabled: Generated<boolean>;
  config: ColumnType<JsonValue, JsonObject | undefined, JsonObject>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface LeagueSlugHistoryTable {
  id: Generated<string>;
  league_id: string;
  old_slug: string;
  expires_at: ColumnType<Date, Date | string, Date | string>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface LeaguesTable {
  id: Generated<string>;
  slug: string;
  name: string;
  status: Generated<string>;
  time_zone: string;
  audience: string;
  contact_email: string | null;
  listed: boolean;
  owner_account_id: string;
  agreement: ColumnType<JsonValue | null, JsonObject | null, JsonObject | null>;
  wording: ColumnType<JsonValue, JsonObject | undefined, JsonObject>;
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface PeopleTable {
  id: Generated<string>;
  league_id: string;
  profile_id: string | null;
  first_name: Generated<string>;
  last_name: Generated<string>;
  public_name: string | null;
  contact_email: string | null;
  birth_date: string | null;
  is_minor: boolean | null;
  visibility: Generated<string>;
  merged_into_id: string | null;
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface PlayerGameStatsTable {
  id: Generated<string>;
  league_id: string;
  game_id: string;
  team_id: string;
  person_id: string;
  jersey_number: string | null;
  played: Generated<boolean>;
  seconds_played: number | null;
  stats: ColumnType<JsonValue, JsonObject | undefined, JsonObject>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ProfileAccessTable {
  id: Generated<string>;
  account_id: string;
  profile_id: string;
  relation: string;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ProfilesTable {
  id: Generated<string>;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ProgramsTable {
  id: Generated<string>;
  league_id: string;
  slug: string;
  name: string;
  sport_key: string;
  is_default: Generated<boolean>;
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface RoleGrantsTable {
  id: Generated<string>;
  league_id: string;
  account_id: string;
  role: string;
  scope_type: Generated<string>;
  scope_id: string | null;
  scope_program_id: GeneratedAlways<string | null>;
  granted_by_account_id: string | null;
  revoked_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  revoked_by_account_id: string | null;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
  scope_team_id: GeneratedAlways<string | null>;
}

export interface RosterEntriesTable {
  id: Generated<string>;
  league_id: string;
  team_id: string;
  person_id: string;
  jersey_number: string | null;
  role: Generated<string>;
  joined_on: string | null;
  left_on: string | null;
  sort: Generated<number>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
  added_at_game_id: string | null;
  needs_review: Generated<boolean>;
}

export interface RoundsTable {
  id: Generated<string>;
  league_id: string;
  season_id: string;
  number: number;
  label: string | null;
  date: string | null;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ScheduleDraftsTable {
  id: Generated<string>;
  league_id: string;
  season_id: string;
  changes: ColumnType<JsonValue, JsonObject | undefined, JsonObject>;
  based_on_revision: number | null;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ScheduleRevisionsTable {
  id: Generated<string>;
  league_id: string;
  season_id: string;
  number: number;
  published_by_account_id: string | null;
  published_at: ColumnType<Date, Date | string | undefined, Date | string>;
  summary: ColumnType<JsonValue, JsonObject | undefined, JsonObject>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ScoringSessionsTable {
  id: Generated<string>;
  league_id: string;
  game_id: string;
  account_id: string;
  device_id: string;
  held_until: ColumnType<Date, Date | string, Date | string>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface SeasonPlayerTotalsTable {
  id: Generated<string>;
  league_id: string;
  season_id: string;
  person_id: string;
  games_played: Generated<number>;
  seconds_played: Generated<number>;
  seconds_games: Generated<number>;
  stats: ColumnType<JsonValue, JsonObject | undefined, JsonObject>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface SeasonsTable {
  id: Generated<string>;
  league_id: string;
  program_id: string;
  slug: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  status: Generated<string>;
  is_current: Generated<boolean>;
  rules: ColumnType<JsonValue, JsonObject | undefined, JsonObject>;
  stat_keys: ColumnType<(string | null)[], string[] | undefined, string[]>;
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
  unique_jerseys: GeneratedAlways<boolean>;
}

export interface SettingValuesTable {
  id: Generated<string>;
  league_id: string;
  level: string;
  program_id: string | null;
  season_id: string | null;
  key: string;
  value: ColumnType<JsonValue, JsonObject, JsonObject>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface StagesTable {
  id: Generated<string>;
  league_id: string;
  season_id: string;
  type: Generated<string>;
  name: string;
  config: ColumnType<JsonValue, JsonObject | undefined, JsonObject>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface StandingsAdjustmentsTable {
  id: Generated<string>;
  league_id: string;
  season_id: string;
  team_id: string;
  wins: Generated<number>;
  losses: Generated<number>;
  ties: Generated<number>;
  points: Generated<number>;
  reason: string;
  account_id: string;
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface StandingsRowsTable {
  id: Generated<string>;
  league_id: string;
  season_id: string;
  division_id: string | null;
  team_id: string;
  rank: number;
  seed: number;
  games_played: Generated<number>;
  wins: Generated<number>;
  losses: Generated<number>;
  ties: Generated<number>;
  points_for: Generated<number>;
  points_against: Generated<number>;
  standings_points: number | null;
  streak_result: string | null;
  streak_length: number | null;
  decided_by: string | null;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface SupportAccessLogTable {
  id: Generated<string>;
  league_id: string;
  staff_account_id: string;
  reason: string;
  started_at: ColumnType<Date, Date | string | undefined, Date | string>;
  ended_at: ColumnType<Date, Date | string, Date | string>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface TeamsTable {
  id: Generated<string>;
  league_id: string;
  season_id: string;
  division_id: string | null;
  slug: string;
  name: string;
  color: string | null;
  stats_visibility: string;
  lineage_id: Generated<string>;
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface VenuesTable {
  id: Generated<string>;
  league_id: string;
  name: string;
  address: string | null;
  map_link: string | null;
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  version: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

/** Every table in the public schema, for Kysely. */
export interface Database {
  accounts: AccountsTable;
  activity_log: ActivityLogTable;
  command_receipts: CommandReceiptsTable;
  courts: CourtsTable;
  divisions: DivisionsTable;
  game_assignments: GameAssignmentsTable;
  game_corrections: GameCorrectionsTable;
  game_events: GameEventsTable;
  game_states: GameStatesTable;
  games: GamesTable;
  imports: ImportsTable;
  invitations: InvitationsTable;
  jobs: JobsTable;
  league_features: LeagueFeaturesTable;
  league_slug_history: LeagueSlugHistoryTable;
  leagues: LeaguesTable;
  people: PeopleTable;
  player_game_stats: PlayerGameStatsTable;
  profile_access: ProfileAccessTable;
  profiles: ProfilesTable;
  programs: ProgramsTable;
  role_grants: RoleGrantsTable;
  roster_entries: RosterEntriesTable;
  rounds: RoundsTable;
  schedule_drafts: ScheduleDraftsTable;
  schedule_revisions: ScheduleRevisionsTable;
  scoring_sessions: ScoringSessionsTable;
  season_player_totals: SeasonPlayerTotalsTable;
  seasons: SeasonsTable;
  setting_values: SettingValuesTable;
  stages: StagesTable;
  standings_adjustments: StandingsAdjustmentsTable;
  standings_rows: StandingsRowsTable;
  support_access_log: SupportAccessLogTable;
  teams: TeamsTable;
  venues: VenuesTable;
}

export interface SignInCodeRequestsTable {
  id: string;
  scope: string;
  subject: string;
  asked_at: ColumnType<Date, Date | string, Date | string>;
}

export interface SignInCodesTable {
  email: string;
  verify_type: string | null;
  expires_at: ColumnType<Date, Date | string, Date | string>;
  attempts_left: number;
}

export interface SignInDevicesTable {
  user_id: string;
  device_id: string;
  first_seen_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface SignInGuessLocksTable {
  scope: string;
  subject: string;
  locked_until: ColumnType<Date, Date | string, Date | string>;
  by_guess_id: string;
}

export interface SignInGuessesTable {
  id: string;
  ticket: string;
  scope: string;
  subject: string;
  counted_at: ColumnType<Date, Date | string, Date | string>;
}

export interface SignInProofsTable {
  proof_hash: string;
  email: string;
  user_id: string;
  expires_at: ColumnType<Date, Date | string, Date | string>;
  access_token: string;
  refresh_token: string;
  access_expires_at: ColumnType<Date, Date | string, Date | string>;
  vendor_session_id: string;
}

export interface SignInRefreshTokensTable {
  token_hash: string;
  session_id: string;
  used: Generated<boolean>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface SignInSessionsTable {
  session_id: string;
  user_id: string;
  device_label: string;
  signed_in_at: ColumnType<Date, Date | string, Date | string>;
  last_active_at: ColumnType<Date, Date | string, Date | string>;
  last_sign_in_at: ColumnType<Date, Date | string, Date | string>;
  password_entered_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  access_token_hash: string;
  access_expires_at: ColumnType<Date, Date | string, Date | string>;
  refresh_token_hash: string;
  ended: Generated<boolean>;
}

export interface SignInUsersTable {
  user_id: string;
  has_password: Generated<boolean>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

/** Every table in the sign_in schema, for Kysely. */
export interface SignInDatabase {
  'sign_in.code_requests': SignInCodeRequestsTable;
  'sign_in.codes': SignInCodesTable;
  'sign_in.devices': SignInDevicesTable;
  'sign_in.guess_locks': SignInGuessLocksTable;
  'sign_in.guesses': SignInGuessesTable;
  'sign_in.proofs': SignInProofsTable;
  'sign_in.refresh_tokens': SignInRefreshTokensTable;
  'sign_in.sessions': SignInSessionsTable;
  'sign_in.users': SignInUsersTable;
}
