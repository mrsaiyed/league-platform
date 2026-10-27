import { PGlite } from '@electric-sql/pglite';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { CreateGame, Envelope, RosterInput } from '../../../contracts/src/varsity.ts';
import type { Player } from '../../../contracts/src/varsity.ts';
import {
  currentGame,
  initialGame,
  reduceCommand,
  teamTotals,
} from '../../../sports/src/basketball/scorer.ts';
import type { GameState } from '../../../sports/src/basketball/scorer.ts';

export const WORKSPACE_ID = 'b1bda7b7-4a38-4795-92e0-dc6682610728';
export class StoreError extends Error {
  code: number;
  constructor(message: string, code = 409) {
    super(message);
    this.code = code;
  }
}
type GameRow = {
  id: string;
  workspace_id: string;
  opponent: string;
  tracked_side: 'home' | 'away';
  scheduled_at: string | null;
  venue: string;
  source_url: string;
  practice: boolean;
  revision: number;
  status: string;
  state: GameState;
  created_at: string;
  updated_at: string;
};
type RosterRow = { id: string; name: string; jersey: string };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const summary = (g: GameRow, now: number) => {
  const state = currentGame(g.state, now);
  return {
    id: g.id,
    opponent: g.opponent,
    trackedSide: g.tracked_side,
    scheduledAt: g.scheduled_at,
    venue: g.venue,
    sourceUrl: g.source_url,
    practice: g.practice,
    revision: g.revision,
    status: state.status,
    home: teamTotals(state, 'home'),
    away: teamTotals(state, 'away'),
    state,
    serverTime: now,
  };
};

/** Local single-process adapter. Production auth/RLS and remote connections are a separate gate. */
export class VarsityStore {
  db: PGlite;
  workspaceId: string;
  now: () => number;
  constructor(db: PGlite, workspaceId = WORKSPACE_ID, now: () => number = Date.now) {
    this.db = db;
    this.workspaceId = workspaceId;
    this.now = now;
  }
  async initialize() {
    await this.db.exec(await readFile(new URL('./001-preview.sql', import.meta.url), 'utf8'));
    await this.db.query(
      'INSERT INTO varsity_preview.workspace(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',
      [this.workspaceId, 'Al-Hadi Varsity'],
    );
  }
  async roster() {
    const root = await this.db.query<{ roster_revision: number }>(
      'SELECT roster_revision FROM varsity_preview.workspace WHERE id=$1',
      [this.workspaceId],
    );
    const rows = await this.db.query<RosterRow>(
      'SELECT id,name,jersey FROM varsity_preview.roster WHERE workspace_id=$1 AND active ORDER BY length(jersey),jersey',
      [this.workspaceId],
    );
    return { revision: root.rows[0]?.roster_revision ?? 0, players: rows.rows };
  }
  async saveRoster(raw: unknown) {
    const input = RosterInput.parse(raw);
    if (new Set(input.players.map((p) => p.jersey)).size !== input.players.length)
      throw new StoreError('Each player needs a different jersey number.', 422);
    const ids = input.players.flatMap((p) => (p.id ? [p.id] : []));
    if (new Set(ids).size !== ids.length) throw new StoreError('Duplicate player identity.', 422);
    await this.db.transaction(async (tx) => {
      const ws = await tx.query<{ roster_revision: number }>(
        'SELECT roster_revision FROM varsity_preview.workspace WHERE id=$1 FOR UPDATE',
        [this.workspaceId],
      );
      if (ws.rows[0]?.roster_revision !== input.expectedRevision)
        throw new StoreError('Roster changed in another window. Reload before saving.');
      const existing = await tx.query<{ id: string }>(
        'SELECT id FROM varsity_preview.roster WHERE workspace_id=$1',
        [this.workspaceId],
      );
      const owned = new Set(existing.rows.map((p) => p.id));
      if (ids.some((id) => !owned.has(id))) throw new StoreError('Unknown roster identity.', 422);
      await tx.query('UPDATE varsity_preview.roster SET active=false WHERE workspace_id=$1', [
        this.workspaceId,
      ]);
      for (const p of input.players)
        await tx.query(
          'INSERT INTO varsity_preview.roster(id,workspace_id,name,jersey,active) VALUES($1,$2,$3,$4,true) ON CONFLICT(id) DO UPDATE SET name=excluded.name,jersey=excluded.jersey,active=true',
          [p.id ?? randomUUID(), this.workspaceId, p.name, p.jersey],
        );
      await tx.query(
        'UPDATE varsity_preview.workspace SET roster_revision=roster_revision+1 WHERE id=$1',
        [this.workspaceId],
      );
      await tx.query(
        'INSERT INTO varsity_preview.roster_audit(id,workspace_id,revision,player_count) VALUES($1,$2,$3,$4)',
        [randomUUID(), this.workspaceId, input.expectedRevision + 1, input.players.length],
      );
    });
    return this.roster();
  }
  async game(id: string) {
    const found = await this.db.query<GameRow>(
      'SELECT * FROM varsity_preview.games WHERE workspace_id=$1 AND id=$2',
      [this.workspaceId, id],
    );
    if (!found.rows[0]) throw new StoreError('Game not found.', 404);
    return summary(found.rows[0], this.now());
  }
  async create(raw: unknown, practice = false) {
    const input = CreateGame.parse(raw);
    if (!practice && !input.rulesConfirmed)
      throw new StoreError(
        'Confirm the game format with the coach before creating a team record.',
        422,
      );
    const payloadHash = hash({ input, practice });
    const id = await this.db.transaction(async (tx) => {
      // Workspace lock serializes duplicate creation without a read-before-insert race.
      await tx.query('SELECT id FROM varsity_preview.workspace WHERE id=$1 FOR UPDATE', [
        this.workspaceId,
      ]);
      const previous = await tx.query<{ id: string; creation_hash: string }>(
        'SELECT id,creation_hash FROM varsity_preview.games WHERE workspace_id=$1 AND creation_command_id=$2',
        [this.workspaceId, input.commandId],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].creation_hash !== payloadHash)
          throw new StoreError('Creation ID reused with different input.');
        return previous.rows[0].id;
      }
      const side = input.trackedSide,
        other = side === 'home' ? 'away' : 'home';
      const roster = practice
        ? Array.from({ length: 6 }, (_, i) => ({
            id: randomUUID(),
            name: `Practice player ${i + 1}`,
            jersey: String(i + 1),
          }))
        : (
            await tx.query<RosterRow>(
              'SELECT id,name,jersey FROM varsity_preview.roster WHERE workspace_id=$1 AND active ORDER BY jersey',
              [this.workspaceId],
            )
          ).rows;
      if (!roster.length)
        throw new StoreError(
          'Add the Al-Hadi roster first, or use the separate practice game.',
          422,
        );
      const players: Player[] = [
        ...roster.map((p) => ({ ...p, side })),
        ...input.opponents.map((p) => ({
          id: randomUUID(),
          name: p.name || `Opponent #${p.jersey}`,
          jersey: p.jersey,
          side: other as 'home' | 'away',
        })),
      ];
      const state = initialGame(players, input.rules, side, this.now());
      const gameId = randomUUID();
      await tx.query(
        'INSERT INTO varsity_preview.games(id,workspace_id,creation_command_id,creation_hash,opponent,tracked_side,scheduled_at,venue,source_url,practice,status,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
        [
          gameId,
          this.workspaceId,
          input.commandId,
          payloadHash,
          input.opponent,
          side,
          input.scheduledAt,
          input.venue,
          input.sourceUrl,
          practice,
          state.status,
          JSON.stringify(state),
        ],
      );
      return gameId;
    });
    return this.game(id);
  }
  async command(gameId: string, raw: unknown) {
    const input = Envelope.parse(raw),
      payloadHash = hash(input);
    await this.db.transaction(async (tx) => {
      const rows = await tx.query<GameRow>(
        'SELECT * FROM varsity_preview.games WHERE workspace_id=$1 AND id=$2 FOR UPDATE',
        [this.workspaceId, gameId],
      );
      const game = rows.rows[0];
      if (!game) throw new StoreError('Game not found.', 404);
      const prior = await tx.query<{ request_hash: string }>(
        'SELECT request_hash FROM varsity_preview.game_events WHERE workspace_id=$1 AND game_id=$2 AND command_id=$3',
        [this.workspaceId, gameId, input.commandId],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== payloadHash)
          throw new StoreError('Command ID reused with different input.');
        return;
      }
      if (game.revision !== input.expectedRevision)
        throw new StoreError(
          'Another window changed this game. Reload and review before retrying.',
        );
      const now = this.now(),
        eventId = randomUUID(),
        next = reduceCommand(game.state, input.input, eventId, now);
      await tx.query(
        'INSERT INTO varsity_preview.game_events(id,workspace_id,game_id,sequence,command_id,request_hash,input,accepted_at,result_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          eventId,
          this.workspaceId,
          gameId,
          game.revision + 1,
          input.commandId,
          payloadHash,
          JSON.stringify(input.input),
          new Date(now).toISOString(),
          next.status,
        ],
      );
      await tx.query(
        'UPDATE varsity_preview.games SET state=$1,revision=revision+1,status=$2,updated_at=$3 WHERE workspace_id=$4 AND id=$5',
        [JSON.stringify(next), next.status, new Date(now).toISOString(), this.workspaceId, gameId],
      );
      for (const p of Object.values(next.players))
        await tx.query(
          'INSERT INTO varsity_preview.player_game_lines(workspace_id,game_id,player_id,name,jersey,tracked,appeared,points,ones,twos,threes,fouls,milliseconds,minutes_quality) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(workspace_id,game_id,player_id) DO UPDATE SET appeared=excluded.appeared,points=excluded.points,ones=excluded.ones,twos=excluded.twos,threes=excluded.threes,fouls=excluded.fouls,milliseconds=excluded.milliseconds,minutes_quality=excluded.minutes_quality',
          [
            this.workspaceId,
            gameId,
            p.id,
            p.name,
            p.jersey,
            p.side === next.trackedSide,
            p.appeared,
            p.points,
            p.ones,
            p.twos,
            p.threes,
            p.fouls,
            p.milliseconds,
            next.minutesQuality,
          ],
        );
    });
    return this.game(gameId);
  }
  async dashboard() {
    const rows = await this.db.query<GameRow>(
      'SELECT * FROM varsity_preview.games WHERE workspace_id=$1 ORDER BY practice,scheduled_at NULLS LAST,created_at DESC LIMIT 100',
      [this.workspaceId],
    );
    const stats = await this.db.query<{
      playerId: string;
      name: string;
      jersey: string;
      gp: number;
      points: number;
      fouls: number;
      ones: number;
      twos: number;
      threes: number;
      milliseconds: number;
      minutesGames: number;
    }>(
      `SELECT l.player_id AS "playerId", (array_agg(l.name ORDER BY g.created_at DESC))[1] AS name, (array_agg(l.jersey ORDER BY g.created_at DESC))[1] AS jersey,
      count(*)::int AS gp, sum(l.points)::int AS points, sum(l.fouls)::int AS fouls,
      sum(l.ones)::int AS ones, sum(l.twos)::int AS twos, sum(l.threes)::int AS threes,
      coalesce(sum(l.milliseconds) FILTER (WHERE l.minutes_quality='tracked'),0)::float8 AS milliseconds,
      count(*) FILTER (WHERE l.minutes_quality='tracked')::int AS "minutesGames"
      FROM varsity_preview.player_game_lines l JOIN varsity_preview.games g ON (g.workspace_id=l.workspace_id AND g.id=l.game_id)
      WHERE l.workspace_id=$1 AND l.tracked AND l.appeared AND g.status='final' AND NOT g.practice
      GROUP BY l.player_id ORDER BY sum(l.points) DESC,l.player_id`,
      [this.workspaceId],
    );
    return {
      roster: await this.roster(),
      games: rows.rows.map((g) => summary(g, this.now())).map(({ state: _state, ...g }) => g),
      stats: stats.rows,
      storage: 'Local PostgreSQL rehearsal',
      workspace: 'Al-Hadi Varsity',
    };
  }
  async exportGame(gameId: string) {
    const snapshot = await this.game(gameId);
    const events = await this.db.query(
      'SELECT id,sequence,command_id,input,accepted_at,result_status FROM varsity_preview.game_events WHERE workspace_id=$1 AND game_id=$2 ORDER BY sequence',
      [this.workspaceId, gameId],
    );
    return {
      format: 'league-platform-game-v1',
      exportedAt: new Date(this.now()).toISOString(),
      snapshot,
      events: events.rows,
    };
  }
}
