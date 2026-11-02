import { Envelope, PlayerInput } from '../../packages/contracts/src/live-stats.ts';
import {
  apply,
  derive,
  newGame,
  DEFAULT_RULES,
} from '../../packages/sports/src/basketball/live.ts';
import type { Command } from '../../packages/sports/src/basketball/live.ts';
import { byJersey } from '../../packages/database/src/live-stats/repository.ts';
import type {
  GameRecord,
  LineRecord,
  LiveStatsRepository,
  PlayerRecord,
  TeamRecord,
} from '../../packages/database/src/live-stats/repository.ts';

// Web Crypto, so this also runs in the browser for the static site (secure pages only).
const randomUUID = () => globalThis.crypto.randomUUID();

export class StatsError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

/** A season's fixtures as copied from the league's published schedule. */
export type ScheduleSeed = {
  season: string;
  source: string;
  team: { slug: string; name: string; school: string; sourceUrl: string };
  opponents: { slug: string; name: string; school: string }[];
  games: {
    number: number;
    startsAt: string;
    home: string;
    away: string;
    type: string;
    venue: string;
    address: string;
    sourceUrl: string;
  }[];
};

/**
 * What the live stats pages can do: the schedule, a game, scorer actions, rosters
 * and season totals. Validates input and applies the basketball rules; storage is
 * whichever repository it is given, so the database can change underneath.
 */
export class LiveStats {
  repo: LiveStatsRepository;
  now: () => number;
  constructor(repo: LiveStatsRepository, now: () => number = Date.now) {
    this.repo = repo;
    this.now = now;
  }

  /**
   * Add the season's teams and fixtures. Safe on every start: existing teams are
   * kept, and only fixtures nobody has tracked yet pick up changes.
   */
  async seed(seed: ScheduleSeed) {
    const ids = new Map<string, string>();
    for (const t of [
      { ...seed.team, tracked: true },
      ...seed.opponents.map((o) => ({ ...o, sourceUrl: '', tracked: false })),
    ])
      ids.set(t.slug, (await this.repo.ensureTeam(t)).id);
    const state = newGame(DEFAULT_RULES, this.now());
    for (const g of seed.games) {
      const home = ids.get(g.home),
        away = ids.get(g.away);
      if (!home || !away) throw new Error(`Seed game ${g.number} names an unknown team.`);
      await this.repo.upsertFixture({
        id: randomUUID(),
        season: seed.season,
        homeTeamId: home,
        awayTeamId: away,
        startsAt: new Date(g.startsAt).toISOString(),
        venue: g.venue,
        venueAddress: g.address,
        gameType: g.type,
        source: seed.source,
        sourceRef: `${seed.source.toLowerCase()}:${g.number}`,
        sourceUrl: g.sourceUrl,
        state,
      });
    }
  }

  async schedule() {
    const teams = await this.repo.teams();
    const now = this.now();
    return {
      team: teams.find((t) => t.tracked) ?? null,
      games: (await this.repo.games()).map((g) => summary(g, teams, now)),
      serverTime: now,
    };
  }

  /**
   * A game with its players and state. A final game also carries its saved box
   * score lines, with each player's name and number as they were in that game, so
   * its box score stays as played if a roster is edited later.
   */
  async game(id: string) {
    const g = await this.repo.game(id);
    if (!g) throw new StatsError('Game not found.', 404);
    const players = await this.repo.players([g.homeTeamId, g.awayTeamId]);
    const lines = g.status === 'final' ? await this.repo.gameLines(id) : [];
    return { ...summary(g, await this.repo.teams(), this.now()), players, state: g.state, lines };
  }

  /**
   * Apply one scorer action and save it, with the state, score and every
   * player's line it produces, all at once. An action id already recorded
   * changes nothing, so a retry after a lost response is safe.
   */
  async command(gameId: string, raw: unknown) {
    const envelope = Envelope.parse(raw);
    const input = envelope.input as Command;
    const before = await this.repo.game(gameId);
    if (!before) throw new StatsError('Game not found.', 404);
    // Players never change team and are never deleted, so this holds inside the transaction too.
    const players = new Map(
      (await this.repo.players([before.homeTeamId, before.awayTeamId])).map((p) => [p.id, p]),
    );
    checkPlayers(before, input, players);
    const serverNow = this.now();
    const at = Math.min(serverNow, envelope.at ?? serverNow);
    const result = await this.repo.record(gameId, envelope.commandId, (game) => {
      const next = apply(game.state, input, { id: envelope.commandId, now: at });
      const d = derive(next);
      const lines = Object.entries(d.players).flatMap(([playerId, l]): LineRecord[] => {
        const p = players.get(playerId);
        if (!p) return [];
        const { side: _side, ms, ...stats } = l;
        return [
          {
            playerId,
            teamId: p.teamId,
            name: p.name,
            jersey: p.jersey,
            ...stats,
            ms: Math.round(ms),
          },
        ];
      });
      return {
        state: next,
        status: next.status,
        homeScore: d.teams.home.score,
        awayScore: d.teams.away.score,
        lines,
        command: { at: envelope.at ?? null, input },
        acceptedAt: new Date(serverNow).toISOString(),
      };
    });
    if (result === 'missing') throw new StatsError('Game not found.', 404);
    return { changed: result === 'recorded', game: await this.game(gameId) };
  }

  async addPlayer(teamId: string, raw: unknown) {
    const input = PlayerInput.parse(raw);
    if (!(await this.repo.teams()).some((t) => t.id === teamId))
      throw new StatsError('Team not found.', 404);
    const player: PlayerRecord = { id: randomUUID(), teamId, ...input, active: true };
    await this.repo.addPlayer(player);
    return player;
  }

  async updatePlayer(id: string, raw: unknown) {
    const found = await this.repo.updatePlayer(id, PlayerInput.parse(raw));
    if (!found) throw new StatsError('Player not found.', 404);
    return found;
  }

  /** Off the roster for new lineups; lines already recorded stay. */
  async removePlayer(id: string) {
    const found = await this.repo.updatePlayer(id, { active: false });
    if (!found) throw new StatsError('Player not found.', 404);
    return found;
  }

  async player(id: string) {
    const found = await this.repo.player(id);
    if (!found) throw new StatsError('Player not found.', 404);
    return found;
  }

  /**
   * A team's roster, record, season totals and game log (one line per final game:
   * result, team totals and top scorer), all from its final games.
   */
  async team(id: string) {
    const teams = await this.repo.teams();
    const team = teams.find((t) => t.id === id);
    if (!team) throw new StatsError('Team not found.', 404);
    const everyone = await this.repo.players([id]);
    const finalLines = await this.repo.finalLines(id);
    const totals = new Map<string, Totals>();
    for (const l of finalLines) {
      const t = totals.get(l.playerId) ?? {
        gp: 0,
        points: 0,
        fg1: 0,
        fg2: 0,
        fg3: 0,
        fouls: 0,
        turnovers: 0,
        ms: 0,
      };
      if (l.appeared) t.gp += 1;
      t.points += l.points;
      t.fg1 += l.fg1;
      t.fg2 += l.fg2;
      t.fg3 += l.fg3;
      t.fouls += l.fouls;
      t.turnovers += l.turnovers;
      t.ms += l.ms;
      totals.set(l.playerId, t);
    }
    const stats = everyone
      .filter((p) => p.active || totals.has(p.id))
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        jersey: p.jersey,
        active: p.active,
        ...(totals.get(p.id) ?? {
          gp: 0,
          points: 0,
          fg1: 0,
          fg2: 0,
          fg3: 0,
          fouls: 0,
          turnovers: 0,
          ms: 0,
        }),
      }))
      .sort((a, b) => b.points - a.points || b.gp - a.gp || byJersey(a, b));
    const now = this.now();
    const games = (await this.repo.games({ teamId: id })).map((g) => summary(g, teams, now));
    const record = { wins: 0, losses: 0 };
    const byGame = groupBy(finalLines, (l) => l.gameId);
    const gameLog = [];
    for (const g of games) {
      if (g.status !== 'final') continue;
      const r = result(g, id);
      if (r.result === 'W') record.wins += 1;
      else if (r.result === 'L') record.losses += 1;
      const lines = byGame.get(g.id) ?? [];
      const sum = (key: 'fg1' | 'fg2' | 'fg3' | 'fouls' | 'turnovers') =>
        lines.reduce((total, l) => total + l[key], 0);
      const top = lines
        .filter((l) => l.points > 0)
        .sort((a, b) => b.points - a.points || byJersey(a, b))[0];
      gameLog.push({
        ...r,
        fg3: sum('fg3'),
        fg2: sum('fg2'),
        fg1: sum('fg1'),
        fouls: sum('fouls'),
        turnovers: sum('turnovers'),
        played: lines.filter((l) => l.appeared).length,
        top: top
          ? { playerId: top.playerId, name: top.name, jersey: top.jersey, points: top.points }
          : null,
      });
    }
    return { team, players: everyone.filter((p) => p.active), stats, games, record, gameLog };
  }

  /**
   * One player's game log: a line for each of their team's final games (DNP when
   * they did not get on the floor), with the name and number they wore, and totals.
   */
  async playerLog(id: string) {
    const player = await this.repo.player(id);
    if (!player) throw new StatsError('Player not found.', 404);
    const teams = await this.repo.teams();
    const now = this.now();
    const games = (await this.repo.games({ teamId: player.teamId })).map((g) =>
      summary(g, teams, now),
    );
    const mine = new Map(
      (await this.repo.finalLines(player.teamId))
        .filter((l) => l.playerId === id)
        .map((l) => [l.gameId, l]),
    );
    const totals: Totals = {
      gp: 0,
      points: 0,
      fg1: 0,
      fg2: 0,
      fg3: 0,
      fouls: 0,
      turnovers: 0,
      ms: 0,
    };
    const log = games
      .filter((g) => g.status === 'final')
      .map((g) => {
        const l = mine.get(g.id);
        const played = Boolean(l?.appeared);
        if (l) {
          if (played) totals.gp += 1;
          totals.points += l.points;
          totals.fg1 += l.fg1;
          totals.fg2 += l.fg2;
          totals.fg3 += l.fg3;
          totals.fouls += l.fouls;
          totals.turnovers += l.turnovers;
          totals.ms += l.ms;
        }
        return {
          ...result(g, player.teamId),
          played,
          jersey: l?.jersey ?? player.jersey,
          ms: l?.ms ?? 0,
          points: l?.points ?? 0,
          fg3: l?.fg3 ?? 0,
          fg2: l?.fg2 ?? 0,
          fg1: l?.fg1 ?? 0,
          fouls: l?.fouls ?? 0,
          turnovers: l?.turnovers ?? 0,
        };
      });
    const team = teams.find((t) => t.id === player.teamId);
    return { player, team: publicTeam(team), games: log, totals };
  }

  teams() {
    return this.repo.teams();
  }
}

type Totals = {
  gp: number;
  points: number;
  fg1: number;
  fg2: number;
  fg3: number;
  fouls: number;
  turnovers: number;
  ms: number;
};

/** Every player an action names must be on the roster of the team it is recorded for. */
function checkPlayers(g: GameRecord, input: Command, players: Map<string, PlayerRecord>) {
  if (!('side' in input)) return;
  const ids =
    input.type === 'lineup'
      ? input.playerIds
      : input.type === 'sub'
        ? [input.inId, input.outId]
        : [input.playerId];
  const teamId = input.side === 'home' ? g.homeTeamId : g.awayTeamId;
  if (ids.some((id) => players.get(id)?.teamId !== teamId))
    throw new StatsError('That player is not on this team. Reload the roster.', 422);
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

/** A final game from one team's side: who they played, where, and the result. */
function result(g: GameSummary, teamId: string) {
  const home = g.home.id === teamId;
  const score = home ? g.homeScore : g.awayScore;
  const opponentScore = home ? g.awayScore : g.homeScore;
  return {
    gameId: g.id,
    startsAt: g.startsAt,
    gameType: g.gameType,
    home,
    opponent: home ? g.away : g.home,
    score,
    opponentScore,
    result: score > opponentScore ? 'W' : score < opponentScore ? 'L' : 'T',
  };
}

const publicTeam = (t: TeamRecord | undefined) =>
  t ? { id: t.id, slug: t.slug, name: t.name, school: t.school, tracked: t.tracked } : null;

/** A game as the schedule shows it: teams, score and enough of the clock to show it live. */
function summary(g: GameRecord, teams: TeamRecord[], now: number) {
  const byId = new Map(teams.map((t) => [t.id, t]));
  return {
    id: g.id,
    season: g.season,
    startsAt: g.startsAt,
    venue: g.venue,
    venueAddress: g.venueAddress,
    gameType: g.gameType,
    source: g.source,
    sourceRef: g.sourceRef,
    sourceUrl: g.sourceUrl,
    status: g.status,
    revision: g.revision,
    home: publicTeam(byId.get(g.homeTeamId))!,
    away: publicTeam(byId.get(g.awayTeamId))!,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    period: derive(g.state).period,
    periods: g.state.rules.periods,
    clock: g.state.clock,
    serverTime: now,
  };
}

export type GameSummary = ReturnType<typeof summary>;
