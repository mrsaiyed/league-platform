import { randomUUID } from 'node:crypto';
import type { Db, Sql } from './postgres.ts';

/**
 * Copy live stats from one PostgreSQL database to another: games tracked on this
 * computer up to Supabase once it exists, or a hosted database down to a folder as
 * a backup. Safe to run again and again.
 *
 *  - Teams are matched by slug and players by id, or by team, number and name, so
 *    nothing is doubled when the other side already has the schedule or a roster.
 *  - Every tracked game comes across whole: its state, every recorded action (the
 *    game's history) and every box score line, in one transaction.
 *  - A game the other side has not tracked takes the copy. One it has tracked is
 *    only brought up to date when its actions are the start of these (the same game,
 *    further along); otherwise it is a conflict and left alone unless `replace`.
 *  - Nothing is deleted from the other side.
 */
export type CopyOptions = { apply: boolean; replace?: boolean };

export type GameAction = 'add' | 'update' | 'same' | 'newer-there' | 'conflict' | 'replace';
export type CopyReport = {
  teams: { add: number; same: number };
  players: { add: number; update: number; same: number };
  games: {
    id: string;
    /** ISO 8601, or null when the game has no date. */
    startsAt: string | null;
    /** "Al-Hadi at KIPP Academy West · final 52–48" */
    label: string;
    actions: number;
    action: GameAction;
  }[];
  applied: boolean;
};

type TeamRow = {
  id: string;
  slug: string;
  name: string;
  school: string;
  tracked: boolean;
  source_url: string;
};
type PlayerRow = {
  id: string;
  team_id: string;
  name: string;
  jersey: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};
type GameRow = {
  id: string;
  season: string;
  home_team_id: string;
  away_team_id: string;
  starts_at: string | null;
  venue: string;
  venue_address: string;
  game_type: string;
  source: string;
  source_ref: string | null;
  source_url: string;
  status: string;
  home_score: number;
  away_score: number;
  revision: number;
  state: unknown;
  created_at: string;
  updated_at: string;
};
type EventRow = {
  game_id: string;
  sequence: number;
  command_id: string;
  command: unknown;
  accepted_at: string;
};
type LineRow = {
  game_id: string;
  player_id: string;
  team_id: string;
  name: string;
  jersey: string;
  appeared: boolean;
  points: number;
  fg1: number;
  fg2: number;
  fg3: number;
  fouls: number;
  ms: number;
};
type Snapshot = {
  teams: TeamRow[];
  players: PlayerRow[];
  games: GameRow[];
  events: Map<string, EventRow[]>;
  lines: Map<string, LineRow[]>;
};

const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());

/** Does this database have the live stats tables? */
export async function hasLiveStats(db: Sql) {
  const rows = await db.query<{ found: string | null }>(
    "SELECT to_regclass('live_stats.games')::text AS found",
  );
  return Boolean(rows.rows[0]?.found);
}

async function snapshot(db: Sql, { full }: { full: boolean }): Promise<Snapshot> {
  const teams = (
    await db.query<TeamRow>(
      'SELECT id, slug, name, school, tracked, source_url FROM live_stats.teams',
    )
  ).rows;
  const players = (
    await db.query<PlayerRow>(
      'SELECT id, team_id, name, jersey, active, created_at, updated_at FROM live_stats.players',
    )
  ).rows.map((p) => ({ ...p, created_at: iso(p.created_at)!, updated_at: iso(p.updated_at)! }));
  const games = (
    await db.query<GameRow>('SELECT * FROM live_stats.games ORDER BY starts_at NULLS LAST, id')
  ).rows.map((g) => ({
    ...g,
    starts_at: iso(g.starts_at),
    created_at: iso(g.created_at)!,
    updated_at: iso(g.updated_at)!,
  }));
  const events = new Map<string, EventRow[]>();
  for (const e of (
    await db.query<EventRow>(
      `SELECT game_id, sequence, command_id${full ? ', command, accepted_at' : ''}
       FROM live_stats.game_events ORDER BY game_id, sequence`,
    )
  ).rows)
    events.set(e.game_id, [
      ...(events.get(e.game_id) ?? []),
      { ...e, accepted_at: full ? iso(e.accepted_at)! : '' },
    ]);
  const lines = new Map<string, LineRow[]>();
  if (full)
    for (const l of (await db.query<LineRow>('SELECT * FROM live_stats.player_game_lines')).rows)
      lines.set(l.game_id, [...(lines.get(l.game_id) ?? []), { ...l, ms: Number(l.ms) }]);
  return { teams, players, games, events, lines };
}

const startsWith = (list: string[], prefix: string[]) => prefix.every((id, i) => list[i] === id);

/** Replace every string that is a key of `ids` with its value, anywhere in a JSON value. */
function remap<T>(value: T, ids: Map<string, string>): T {
  if (!ids.size) return value;
  return JSON.parse(JSON.stringify(value), (_key, v: unknown) =>
    typeof v === 'string' ? (ids.get(v) ?? v) : v,
  ) as T;
}

type Plan = {
  report: CopyReport;
  newTeams: TeamRow[];
  newPlayers: PlayerRow[];
  updatedPlayers: PlayerRow[];
  /** Source player id → id on the other side, where they differ. */
  playerIds: Map<string, string>;
  teamIds: Map<string, string>;
  games: { from: GameRow; to: GameRow | null; action: GameAction }[];
};

function plan(src: Snapshot, dst: Snapshot, replace: boolean): Plan {
  const report: CopyReport = {
    teams: { add: 0, same: 0 },
    players: { add: 0, update: 0, same: 0 },
    games: [],
    applied: false,
  };

  const teamIds = new Map<string, string>();
  const newTeams: TeamRow[] = [];
  const takenTeamIds = new Set(dst.teams.map((t) => t.id));
  for (const t of src.teams) {
    const found = dst.teams.find((x) => x.slug === t.slug);
    if (found) {
      teamIds.set(t.id, found.id);
      report.teams.same += 1;
      continue;
    }
    const id = takenTeamIds.has(t.id) ? randomUUID() : t.id;
    takenTeamIds.add(id);
    newTeams.push({ ...t, id });
    teamIds.set(t.id, id);
    report.teams.add += 1;
  }

  const playerIds = new Map<string, string>();
  const newPlayers: PlayerRow[] = [];
  const updatedPlayers: PlayerRow[] = [];
  const dstById = new Map(dst.players.map((p) => [p.id, p]));
  const matched = new Set<string>();
  for (const p of src.players) {
    const teamId = teamIds.get(p.team_id) ?? p.team_id;
    const same = dstById.get(p.id);
    if (same) {
      matched.add(same.id);
      const differs = same.name !== p.name || same.jersey !== p.jersey || same.active !== p.active;
      if (differs && p.updated_at > same.updated_at) {
        updatedPlayers.push(p);
        report.players.update += 1;
      } else report.players.same += 1;
      continue;
    }
    // Entered separately on both sides: same team, number and name is the same player.
    const twin = dst.players.find(
      (x) =>
        !matched.has(x.id) &&
        x.team_id === teamId &&
        x.jersey === p.jersey &&
        x.name.trim().toLowerCase() === p.name.trim().toLowerCase(),
    );
    if (twin) {
      matched.add(twin.id);
      playerIds.set(p.id, twin.id);
      report.players.same += 1;
      continue;
    }
    newPlayers.push({ ...p, team_id: teamId });
    report.players.add += 1;
  }

  const teamName = new Map(src.teams.map((t) => [t.id, t.name]));
  const games: Plan['games'] = [];
  for (const g of src.games) {
    if (g.revision === 0) continue; // never tracked: nothing to copy
    const to = g.source_ref
      ? (dst.games.find((x) => x.source_ref === g.source_ref) ?? null)
      : (dst.games.find((x) => x.id === g.id) ?? null);
    const mine = (src.events.get(g.id) ?? []).map((e) => e.command_id);
    let action: GameAction;
    if (!to || to.revision === 0) action = 'add';
    else {
      const theirs = (dst.events.get(to.id) ?? []).map((e) => e.command_id);
      if (theirs.length === mine.length && startsWith(mine, theirs)) action = 'same';
      else if (theirs.length < mine.length && startsWith(mine, theirs)) action = 'update';
      else if (theirs.length > mine.length && startsWith(theirs, mine)) action = 'newer-there';
      else action = replace ? 'replace' : 'conflict';
    }
    games.push({ from: g, to, action });
    report.games.push({
      id: g.id,
      startsAt: g.starts_at,
      label: `${teamName.get(g.away_team_id)} at ${teamName.get(g.home_team_id)} · ${g.status} ${g.away_score}–${g.home_score}`,
      actions: mine.length,
      action,
    });
  }
  return { report, newTeams, newPlayers, updatedPlayers, playerIds, teamIds, games };
}

/** Work out the copy and, with `apply`, make it in one transaction on the target. */
export async function copyLiveStats(
  source: Sql,
  target: Db,
  { apply, replace = false }: CopyOptions,
): Promise<CopyReport> {
  if (!(await hasLiveStats(source))) throw new Error('The source has no live stats to copy.');
  const src = await snapshot(source, { full: true });
  if (!apply) return plan(src, await snapshot(target, { full: false }), replace).report;

  return target.transaction(async (tx) => {
    // Hold every game while copying, so a stats server using the target waits rather than interleaves.
    await tx.query('SELECT id FROM live_stats.games FOR UPDATE');
    const p = plan(src, await snapshot(tx, { full: false }), replace);
    const json = (rows: unknown[]) => JSON.stringify(rows);

    if (p.newTeams.length)
      await tx.query(
        `INSERT INTO live_stats.teams(id, slug, name, school, tracked, source_url)
         SELECT x.id, x.slug, x.name, x.school, x.tracked, x.source_url
         FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, slug text, name text, school text,
           tracked boolean, source_url text)`,
        [json(p.newTeams)],
      );
    if (p.newPlayers.length)
      await tx.query(
        `INSERT INTO live_stats.players(id, team_id, name, jersey, active, created_at, updated_at)
         SELECT x.id, x.team_id, x.name, x.jersey, x.active, x.created_at, x.updated_at
         FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, team_id uuid, name text, jersey text,
           active boolean, created_at timestamptz, updated_at timestamptz)`,
        [json(p.newPlayers)],
      );
    for (const u of p.updatedPlayers)
      await tx.query(
        `UPDATE live_stats.players SET name = $2, jersey = $3, active = $4, updated_at = $5
         WHERE id = $1`,
        [u.id, u.name, u.jersey, u.active, u.updated_at],
      );

    const takenGameIds = new Set(
      (await tx.query<{ id: string }>('SELECT id FROM live_stats.games')).rows.map((r) => r.id),
    );
    for (const { from: g, to, action } of p.games) {
      if (action === 'same' || action === 'newer-there' || action === 'conflict') continue;
      const state = remap(g.state, p.playerIds);
      let gameId: string;
      if (to) {
        gameId = to.id;
        await tx.query('DELETE FROM live_stats.player_game_lines WHERE game_id = $1', [gameId]);
        await tx.query('DELETE FROM live_stats.game_events WHERE game_id = $1', [gameId]);
        await tx.query(
          `UPDATE live_stats.games SET state = $2, status = $3, home_score = $4, away_score = $5,
             revision = $6, updated_at = $7 WHERE id = $1`,
          [
            gameId,
            JSON.stringify(state),
            g.status,
            g.home_score,
            g.away_score,
            g.revision,
            g.updated_at,
          ],
        );
      } else {
        gameId = takenGameIds.has(g.id) ? randomUUID() : g.id;
        takenGameIds.add(gameId);
        await tx.query(
          `INSERT INTO live_stats.games(id, season, home_team_id, away_team_id, starts_at, venue,
             venue_address, game_type, source, source_ref, source_url, status, home_score,
             away_score, revision, state, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            gameId,
            g.season,
            p.teamIds.get(g.home_team_id) ?? g.home_team_id,
            p.teamIds.get(g.away_team_id) ?? g.away_team_id,
            g.starts_at,
            g.venue,
            g.venue_address,
            g.game_type,
            g.source,
            g.source_ref,
            g.source_url,
            g.status,
            g.home_score,
            g.away_score,
            g.revision,
            JSON.stringify(state),
            g.created_at,
            g.updated_at,
          ],
        );
      }
      const events = (src.events.get(g.id) ?? []).map((e) => ({
        sequence: e.sequence,
        command_id: e.command_id,
        command: remap(e.command, p.playerIds),
        accepted_at: e.accepted_at,
      }));
      if (events.length)
        await tx.query(
          `INSERT INTO live_stats.game_events(game_id, sequence, command_id, command, accepted_at)
           SELECT $1, x.sequence, x.command_id, x.command, x.accepted_at
           FROM jsonb_to_recordset($2::jsonb) AS x(sequence integer, command_id uuid,
             command jsonb, accepted_at timestamptz)`,
          [gameId, json(events)],
        );
      const lines = (src.lines.get(g.id) ?? []).map((l) => ({
        ...l,
        player_id: p.playerIds.get(l.player_id) ?? l.player_id,
        team_id: p.teamIds.get(l.team_id) ?? l.team_id,
      }));
      if (lines.length)
        await tx.query(
          `INSERT INTO live_stats.player_game_lines(game_id, player_id, team_id, name, jersey,
             appeared, points, fg1, fg2, fg3, fouls, ms)
           SELECT $1, x.player_id, x.team_id, x.name, x.jersey, x.appeared, x.points, x.fg1,
             x.fg2, x.fg3, x.fouls, x.ms
           FROM jsonb_to_recordset($2::jsonb) AS x(player_id uuid, team_id uuid, name text,
             jersey text, appeared boolean, points integer, fg1 integer, fg2 integer,
             fg3 integer, fouls integer, ms bigint)`,
          [gameId, json(lines)],
        );
    }
    return { ...p.report, applied: true };
  });
}
