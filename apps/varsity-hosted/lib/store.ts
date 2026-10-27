import { CreateGame, Envelope, RosterInput } from '../shared/contracts/src/varsity.ts';
import type { Player } from '../shared/contracts/src/varsity.ts';
import {
  currentGame,
  initialGame,
  reduceCommand,
  teamTotals,
} from '../shared/sports/src/basketball/scorer.ts';
import type { GameState } from '../shared/sports/src/basketball/scorer.ts';

// Hosted pilot scope, not the production tenant model. Site access is owner-private.
export const WORKSPACE_ID = 'b1bda7b7-4a38-4795-92e0-dc6682610728';
export class StoreError extends Error {
  code: number;
  constructor(message: string, code = 409) {
    super(message);
    this.code = code;
  }
}
type Row = {
  id: string;
  workspace_id: string;
  creation_hash: string;
  opponent: string;
  tracked_side: 'home' | 'away';
  scheduled_at: string | null;
  venue: string;
  source_url: string;
  practice: number;
  revision: number;
  status: string;
  state: string;
  created_at: string;
  updated_at: string;
};
type RosterPlayer = { id: string; name: string; jersey: string };
const hash = async (value: unknown) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))),
    ),
  )
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
const summary = (g: Row, now: number) => {
  const state = currentGame(JSON.parse(g.state) as GameState, now);
  return {
    id: g.id,
    opponent: g.opponent,
    trackedSide: g.tracked_side,
    scheduledAt: g.scheduled_at,
    venue: g.venue,
    sourceUrl: g.source_url,
    practice: !!g.practice,
    revision: g.revision,
    status: state.status,
    home: teamTotals(state, 'home'),
    away: teamTotals(state, 'away'),
    state,
    serverTime: now,
  };
};

/** D1 batch statements are atomic. CAS fences every dependent insert/update. */
export class HostedStore {
  db: D1Database;
  actor: string;
  now: () => number;
  constructor(db: D1Database, actor: string, now: () => number = Date.now) {
    this.db = db;
    this.actor = actor;
    this.now = now;
  }
  async initialize() {
    await this.db
      .prepare('INSERT OR IGNORE INTO varsity_workspace(id) VALUES(?)')
      .bind(WORKSPACE_ID)
      .run();
  }
  async roster() {
    const row = await this.db
      .prepare('SELECT roster_revision,roster FROM varsity_workspace WHERE id=?')
      .bind(WORKSPACE_ID)
      .first<{ roster_revision: number; roster: string }>();
    return {
      revision: row?.roster_revision ?? 0,
      players: JSON.parse(row?.roster ?? '[]') as RosterPlayer[],
    };
  }
  async saveRoster(raw: unknown) {
    const input = RosterInput.parse(raw),
      previous = await this.roster(),
      owned = new Set(previous.players.map((p) => p.id));
    if (new Set(input.players.map((p) => p.jersey)).size !== input.players.length)
      throw new StoreError('Each player needs a different jersey.', 422);
    const ids = input.players.flatMap((p) => (p.id ? [p.id] : []));
    if (new Set(ids).size !== ids.length || ids.some((id) => !owned.has(id)))
      throw new StoreError('Unknown or duplicate player identity.', 422);
    const players = input.players.map((p) => ({ ...p, id: p.id ?? crypto.randomUUID() })),
      id = crypto.randomUUID();
    const result = await this.db.batch([
      this.db
        .prepare(
          'UPDATE varsity_workspace SET roster=?,roster_revision=roster_revision+1,last_command=? WHERE id=? AND roster_revision=?',
        )
        .bind(JSON.stringify(players), id, WORKSPACE_ID, input.expectedRevision),
      this.db
        .prepare(
          'INSERT INTO varsity_roster_audit(id,workspace_id,revision,actor,accepted_at,player_count) SELECT ?,id,roster_revision,?,?,? FROM varsity_workspace WHERE id=? AND last_command=?',
        )
        .bind(id, this.actor, new Date(this.now()).toISOString(), players.length, WORKSPACE_ID, id),
    ]);
    if (result[0]?.meta.changes !== 1)
      throw new StoreError('Roster changed. Reload and review before saving.');
    return this.roster();
  }
  async game(id: string) {
    const row = await this.db
      .prepare('SELECT * FROM varsity_games WHERE workspace_id=? AND id=?')
      .bind(WORKSPACE_ID, id)
      .first<Row>();
    if (!row) throw new StoreError('Game not found.', 404);
    return summary(row, this.now());
  }
  async create(raw: unknown, practice = false) {
    const input = CreateGame.parse(raw),
      fingerprint = await hash({ input, practice });
    if (!practice && !input.rulesConfirmed)
      throw new StoreError('Confirm the game format before creating the team record.', 422);
    const previous = await this.db
      .prepare('SELECT id,creation_hash FROM varsity_games WHERE workspace_id=? AND creation_id=?')
      .bind(WORKSPACE_ID, input.commandId)
      .first<{ id: string; creation_hash: string }>();
    if (previous) {
      if (previous.creation_hash !== fingerprint)
        throw new StoreError('Creation ID reused with different input.');
      return this.game(previous.id);
    }
    const roster = practice
      ? Array.from({ length: 6 }, (_, i) => ({
          id: crypto.randomUUID(),
          name: `Practice player ${i + 1}`,
          jersey: String(i + 1),
        }))
      : (await this.roster()).players;
    if (!roster.length)
      throw new StoreError('Save the Al-Hadi roster first, or try a practice game.', 422);
    const side = input.trackedSide,
      other = side === 'home' ? 'away' : 'home';
    const players: Player[] = [
      ...roster.map((p) => ({ ...p, side })),
      ...input.opponents.map((p) => ({
        id: crypto.randomUUID(),
        name: p.name || `Opponent #${p.jersey}`,
        jersey: p.jersey,
        side: other as 'home' | 'away',
      })),
    ];
    const state = initialGame(players, input.rules, side, this.now()),
      id = crypto.randomUUID(),
      at = new Date(this.now()).toISOString();
    await this.db
      .prepare(
        'INSERT OR IGNORE INTO varsity_games(id,workspace_id,creation_id,creation_hash,opponent,tracked_side,scheduled_at,venue,source_url,practice,status,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        WORKSPACE_ID,
        input.commandId,
        fingerprint,
        input.opponent,
        side,
        input.scheduledAt,
        input.venue,
        input.sourceUrl,
        practice ? 1 : 0,
        state.status,
        JSON.stringify(state),
        at,
        at,
      )
      .run();
    const accepted = await this.db
      .prepare('SELECT id,creation_hash FROM varsity_games WHERE workspace_id=? AND creation_id=?')
      .bind(WORKSPACE_ID, input.commandId)
      .first<{ id: string; creation_hash: string }>();
    if (!accepted || accepted.creation_hash !== fingerprint)
      throw new StoreError('Creation ID conflict.');
    return this.game(accepted.id);
  }
  async command(gameId: string, raw: unknown) {
    const input = Envelope.parse(raw),
      fingerprint = await hash(input);
    const receipt = () =>
      this.db
        .prepare(
          'SELECT request_hash FROM varsity_events WHERE workspace_id=? AND game_id=? AND command_id=?',
        )
        .bind(WORKSPACE_ID, gameId, input.commandId)
        .first<{ request_hash: string }>();
    const prior = await receipt();
    if (prior) {
      if (prior.request_hash !== fingerprint)
        throw new StoreError('Command ID reused with different input.');
      return this.game(gameId);
    }
    const game = await this.game(gameId);
    if (game.revision !== input.expectedRevision)
      throw new StoreError('Another window changed this game. Reload and review.');
    const now = this.now(),
      eventId = crypto.randomUUID();
    // Reduce the persisted anchor, not a projected read snapshot, to preserve duration arithmetic.
    const row = await this.db
      .prepare('SELECT * FROM varsity_games WHERE workspace_id=? AND id=?')
      .bind(WORKSPACE_ID, gameId)
      .first<Row>();
    if (!row || row.revision !== input.expectedRevision)
      throw new StoreError('Another window changed this game. Reload and review.');
    const next = reduceCommand(JSON.parse(row.state), input.input, eventId, now),
      at = new Date(now).toISOString();
    const lineData = Object.values(next.players).map((p) => ({
      ...p,
      tracked: p.side === next.trackedSide ? 1 : 0,
      appeared: p.appeared ? 1 : 0,
      minutesQuality: next.minutesQuality,
    }));
    try {
      const result = await this.db.batch([
        this.db
          .prepare(
            'UPDATE varsity_games SET state=?,status=?,revision=revision+1,last_command=?,updated_at=? WHERE workspace_id=? AND id=? AND revision=?',
          )
          .bind(
            JSON.stringify(next),
            next.status,
            input.commandId,
            at,
            WORKSPACE_ID,
            gameId,
            input.expectedRevision,
          ),
        this.db
          .prepare(
            'INSERT INTO varsity_events(id,workspace_id,game_id,sequence,command_id,request_hash,input,accepted_at,actor,result_status) SELECT ?,workspace_id,id,revision,?,?,?,?,?,? FROM varsity_games WHERE workspace_id=? AND id=? AND last_command=? AND revision=?',
          )
          .bind(
            eventId,
            input.commandId,
            fingerprint,
            JSON.stringify(input.input),
            at,
            this.actor,
            next.status,
            WORKSPACE_ID,
            gameId,
            input.commandId,
            input.expectedRevision + 1,
          ),
        this.db
          .prepare(
            `INSERT INTO varsity_lines(workspace_id,game_id,player_id,name,jersey,tracked,appeared,points,ones,twos,threes,fouls,milliseconds,minutes_quality)
          SELECT ?,?,json_extract(value,'$.id'),json_extract(value,'$.name'),json_extract(value,'$.jersey'),json_extract(value,'$.tracked'),json_extract(value,'$.appeared'),json_extract(value,'$.points'),json_extract(value,'$.ones'),json_extract(value,'$.twos'),json_extract(value,'$.threes'),json_extract(value,'$.fouls'),json_extract(value,'$.milliseconds'),json_extract(value,'$.minutesQuality')
          FROM json_each(?) WHERE EXISTS(SELECT 1 FROM varsity_games WHERE workspace_id=? AND id=? AND last_command=? AND revision=?)
          ON CONFLICT(workspace_id,game_id,player_id) DO UPDATE SET appeared=excluded.appeared,points=excluded.points,ones=excluded.ones,twos=excluded.twos,threes=excluded.threes,fouls=excluded.fouls,milliseconds=excluded.milliseconds,minutes_quality=excluded.minutes_quality`,
          )
          .bind(
            WORKSPACE_ID,
            gameId,
            JSON.stringify(lineData),
            WORKSPACE_ID,
            gameId,
            input.commandId,
            input.expectedRevision + 1,
          ),
      ]);
      if (result[0]?.meta.changes !== 1) {
        const saved = await receipt();
        if (!saved || saved.request_hash !== fingerprint)
          throw new StoreError('Concurrent edit rejected. Reload and review.');
      }
    } catch (error) {
      const saved = await receipt();
      if (!saved || saved.request_hash !== fingerprint) throw error;
    }
    return this.game(gameId);
  }
  async dashboard() {
    const rows = await this.db
      .prepare(
        'SELECT * FROM varsity_games WHERE workspace_id=? ORDER BY practice,scheduled_at IS NULL,scheduled_at,created_at DESC LIMIT 100',
      )
      .bind(WORKSPACE_ID)
      .all<Row>();
    const stats = await this.db
      .prepare(
        `SELECT l.player_id AS playerId,l.name,l.jersey,count(*) AS gp,sum(l.points) AS points,sum(l.fouls) AS fouls,sum(l.ones) AS ones,sum(l.twos) AS twos,sum(l.threes) AS threes,coalesce(sum(CASE WHEN l.minutes_quality='tracked' THEN l.milliseconds ELSE 0 END),0) AS milliseconds,sum(CASE WHEN l.minutes_quality='tracked' THEN 1 ELSE 0 END) AS minutesGames
      FROM varsity_lines l JOIN varsity_games g ON g.workspace_id=l.workspace_id AND g.id=l.game_id WHERE l.workspace_id=? AND l.tracked=1 AND l.appeared=1 AND g.status='final' AND g.practice=0 GROUP BY l.player_id ORDER BY sum(l.points) DESC,l.player_id`,
      )
      .bind(WORKSPACE_ID)
      .all();
    return {
      roster: await this.roster(),
      games: rows.results.map((r) => summary(r, this.now())).map(({ state: _state, ...g }) => g),
      stats: stats.results,
      storage: 'Shared SQL database',
      workspace: 'Al-Hadi Varsity',
    };
  }
  async exportGame(id: string) {
    const snapshot = await this.game(id),
      events = await this.db
        .prepare(
          'SELECT id,sequence,command_id,input,accepted_at,actor,result_status FROM varsity_events WHERE workspace_id=? AND game_id=? ORDER BY sequence',
        )
        .bind(WORKSPACE_ID, id)
        .all();
    return {
      format: 'league-platform-game-v1',
      exportedAt: new Date(this.now()).toISOString(),
      snapshot,
      events: events.results.map((e) => ({ ...e, input: JSON.parse(e.input as string) })),
    };
  }
}
