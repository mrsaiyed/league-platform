import { randomUUID } from 'node:crypto';
import { byJersey } from './repository.ts';
import type {
  Fixture,
  GameRecord,
  LineRecord,
  LiveStatsRepository,
  PlayerChange,
  PlayerRecord,
  Recorded,
  TeamRecord,
} from './repository.ts';

/**
 * Everything held in memory as documents: one per team, player and game, with
 * each game's lines and recorded actions kept alongside it. It stands in for a
 * document database (Firestore, MongoDB, DynamoDB) and shows the tracker needs
 * nothing SQL-specific. Documents are copied in and out, so no caller ever
 * shares an object with the store. Lost when the process stops: for tests and
 * quick demos (LIVE_STATS_STORE=memory).
 */
export class MemoryRepository implements LiveStatsRepository {
  #teams = new Map<string, TeamRecord>();
  #players = new Map<string, PlayerRecord>();
  #games = new Map<string, { game: GameRecord; created: number }>();
  #lines = new Map<string, LineRecord[]>();
  #commands = new Map<string, Map<string, unknown>>();
  #created = 0;

  async initialize() {}
  async close() {}

  async ensureTeam(t: Omit<TeamRecord, 'id'>) {
    const found = [...this.#teams.values()].find((x) => x.slug === t.slug);
    if (found) return structuredClone(found);
    const stored = { id: randomUUID(), ...t };
    this.#teams.set(stored.id, stored);
    return structuredClone(stored);
  }

  async teams() {
    return [...this.#teams.values()]
      .sort((a, b) => Number(b.tracked) - Number(a.tracked) || compare(a.name, b.name))
      .map((t) => structuredClone(t));
  }

  async upsertFixture(f: Fixture) {
    const existing = [...this.#games.values()].find((x) => x.game.sourceRef === f.sourceRef);
    if (!existing) {
      const game: GameRecord = {
        ...structuredClone(f),
        status: 'scheduled',
        homeScore: 0,
        awayScore: 0,
        revision: 0,
      };
      this.#games.set(f.id, { game, created: this.#created++ });
      return;
    }
    const g = existing.game;
    if (g.status !== 'scheduled' || g.revision !== 0) return;
    Object.assign(g, {
      startsAt: f.startsAt,
      venue: f.venue,
      venueAddress: f.venueAddress,
      gameType: f.gameType,
      sourceUrl: f.sourceUrl,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
    });
  }

  async games(filter: { teamId?: string } = {}) {
    const { teamId } = filter;
    return [...this.#games.values()]
      .filter(({ game: g }) => !teamId || g.homeTeamId === teamId || g.awayTeamId === teamId)
      .sort(
        (a, b) =>
          (a.game.startsAt === null ? 1 : 0) - (b.game.startsAt === null ? 1 : 0) ||
          compare(a.game.startsAt ?? '', b.game.startsAt ?? '') ||
          a.created - b.created,
      )
      .map(({ game }) => structuredClone(game));
  }

  async game(id: string) {
    const found = this.#games.get(id);
    return found ? structuredClone(found.game) : null;
  }

  async players(teamIds: string[]) {
    return [...this.#players.values()]
      .filter((p) => teamIds.includes(p.teamId))
      .sort(byJersey)
      .map((p) => structuredClone(p));
  }

  async player(id: string) {
    const p = this.#players.get(id);
    return p ? structuredClone(p) : null;
  }

  async addPlayer(p: PlayerRecord) {
    if (this.#players.has(p.id)) throw new Error('Player already exists.');
    if (!this.#teams.has(p.teamId)) throw new Error('Team not found.');
    this.#players.set(p.id, structuredClone(p));
  }

  async updatePlayer(id: string, change: PlayerChange) {
    const p = this.#players.get(id);
    if (!p) return null;
    const next = { ...p };
    if (change.name !== undefined) next.name = change.name;
    if (change.jersey !== undefined) next.jersey = change.jersey;
    if (change.active !== undefined) next.active = change.active;
    this.#players.set(id, next);
    return structuredClone(next);
  }

  // No await between reading the game and writing it, so nothing else can run in
  // between: the whole action is saved or, if `decide` throws, none of it.
  async record(gameId: string, commandId: string, decide: (game: GameRecord) => Recorded) {
    const found = this.#games.get(gameId);
    if (!found) return 'missing' as const;
    const commands = this.#commands.get(gameId) ?? new Map<string, unknown>();
    if (commands.has(commandId)) return 'duplicate' as const;
    const r = structuredClone(decide(structuredClone(found.game)));
    commands.set(commandId, { command: r.command, acceptedAt: r.acceptedAt });
    this.#commands.set(gameId, commands);
    Object.assign(found.game, {
      state: r.state,
      status: r.status,
      homeScore: r.homeScore,
      awayScore: r.awayScore,
      revision: found.game.revision + 1,
    });
    this.#lines.set(gameId, r.lines);
    return 'recorded' as const;
  }

  async finalLines(teamId: string) {
    return [...this.#games.values()]
      .filter(({ game }) => game.status === 'final')
      .flatMap(({ game }) => this.#lines.get(game.id) ?? [])
      .filter((l) => l.teamId === teamId)
      .map((l) => structuredClone(l));
  }
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
