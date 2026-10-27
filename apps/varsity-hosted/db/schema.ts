import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  primaryKey,
  check,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const workspace = sqliteTable('varsity_workspace', {
  id: text('id').primaryKey(),
  rosterRevision: integer('roster_revision').notNull().default(0),
  roster: text('roster').notNull().default('[]'),
  lastCommand: text('last_command'),
});
export const games = sqliteTable(
  'varsity_games',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id),
    creationId: text('creation_id').notNull(),
    creationHash: text('creation_hash').notNull(),
    opponent: text('opponent').notNull(),
    trackedSide: text('tracked_side').notNull(),
    scheduledAt: text('scheduled_at'),
    venue: text('venue').notNull(),
    sourceUrl: text('source_url').notNull(),
    practice: integer('practice').notNull(),
    revision: integer('revision').notNull().default(0),
    status: text('status').notNull(),
    state: text('state').notNull(),
    lastCommand: text('last_command'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('varsity_game_creation').on(t.workspaceId, t.creationId),
    uniqueIndex('varsity_game_scope').on(t.workspaceId, t.id),
    check('varsity_game_revision', sql`${t.revision} >= 0`),
  ],
);
export const events = sqliteTable(
  'varsity_events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id),
    sequence: integer('sequence').notNull(),
    commandId: text('command_id').notNull(),
    requestHash: text('request_hash').notNull(),
    input: text('input').notNull(),
    acceptedAt: text('accepted_at').notNull(),
    actor: text('actor').notNull(),
    resultStatus: text('result_status').notNull(),
  },
  (t) => [
    uniqueIndex('varsity_event_sequence').on(t.gameId, t.sequence),
    uniqueIndex('varsity_event_command').on(t.gameId, t.commandId),
  ],
);
export const lines = sqliteTable(
  'varsity_lines',
  {
    workspaceId: text('workspace_id').notNull(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id),
    playerId: text('player_id').notNull(),
    name: text('name').notNull(),
    jersey: text('jersey').notNull(),
    tracked: integer('tracked').notNull(),
    appeared: integer('appeared').notNull(),
    points: integer('points').notNull(),
    ones: integer('ones').notNull(),
    twos: integer('twos').notNull(),
    threes: integer('threes').notNull(),
    fouls: integer('fouls').notNull(),
    milliseconds: integer('milliseconds').notNull(),
    minutesQuality: text('minutes_quality').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.gameId, t.playerId] }),
    check('varsity_line_points', sql`${t.points} = ${t.ones} + 2 * ${t.twos} + 3 * ${t.threes}`),
    check(
      'varsity_line_nonnegative',
      sql`${t.ones} >= 0 AND ${t.twos} >= 0 AND ${t.threes} >= 0 AND ${t.fouls} >= 0 AND ${t.milliseconds} >= 0`,
    ),
  ],
);
export const rosterAudit = sqliteTable('varsity_roster_audit', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  revision: integer('revision').notNull(),
  actor: text('actor').notNull(),
  acceptedAt: text('accepted_at').notNull(),
  playerCount: integer('player_count').notNull(),
});
