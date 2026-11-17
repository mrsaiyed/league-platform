// Development-only (T-195, T-201): a made-up backup of the current live tracker, as
// `npm run stats:copy` would leave one, holding the games one team of the seed's
// demo-shaped league scored live (step 2.59). The transfer (step 2.58) brings it in, as it
// would bring in a real one. Made-up data only: every team and player comes from
// demo-league-data.ts, and nothing is read from any other database.
//
// Each game's actions are made up the way a scorer taps them (lineups, baskets, free
// throws, fouls, turnovers, substitutions, four quarters, End game), from a fixed seed per
// game, so the same backup comes out every time. They are played through the tracker's
// own engine one by one, as its server does: an action the engine refuses is not kept,
// and the game's state, every action and every player's line are written as the server
// writes its rows. The database is built in memory and its folder written out once.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { basketball } from '@srleagues/sports';
import { writeDataFolder } from '../transfers/data-folder.ts';

const schemaFile = fileURLToPath(new URL('../live-stats/001-schema.sql', import.meta.url));

type Input = Parameters<typeof basketball.apply>[1];
type Side = 'home' | 'away';

export type BackupTeamData = {
  readonly key: string;
  readonly name: string;
  readonly tracked: boolean;
};
export type BackupPlayerData = {
  readonly team: string;
  readonly jersey: string;
  readonly name: string;
};
export type BackupGameData = {
  /** The league's game number, as the tracker keeps it (`source_ref`). */
  readonly number: number | null;
  readonly home: string;
  readonly away: string;
  /** When it starts, in milliseconds since 1970. */
  readonly startsAt: number;
};
export type MadeUpBackup = {
  readonly season: string;
  readonly teams: readonly BackupTeamData[];
  readonly players: readonly BackupPlayerData[];
  readonly games: readonly BackupGameData[];
};

/** A small, fixed random number source (mulberry32), so a game is made the same each time. */
function randomFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seconds between a scorer's taps, so a quarter's taps fit in its eight minutes. */
const tapSeconds = 14;
/** Possessions each side has in a quarter. */
const possessions = 12;

type Tap = { readonly input: Input; readonly at: number; readonly commandId: string };

/**
 * One game's actions, played through the engine as they are made, so each one is
 * judged against the game as it stands: what the engine refuses is left out.
 */
export function playGame(
  game: BackupGameData,
  rosters: { readonly home: readonly string[]; readonly away: readonly string[] },
  seed: number,
): { state: ReturnType<typeof basketball.newGame>; taps: Tap[] } {
  const random = randomFrom(seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  let state = basketball.newGame(basketball.DEFAULT_RULES, game.startsAt - 3_600_000);
  let at = game.startsAt;
  const taps: Tap[] = [];
  const tap = (input: Input) => {
    at += tapSeconds * 1000;
    const commandId = randomUUID();
    try {
      state = basketball.apply(state, input, { id: commandId, now: at });
      taps.push({ input, at, commandId });
    } catch (error) {
      if (!(error instanceof basketball.TrackerError)) throw error;
    }
  };
  const onCourt = (side: Side) => basketball.derive(state).teams[side].onCourt;
  const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');

  tap({ type: 'lineup', side: 'home', playerIds: rosters.home.slice(0, 5) });
  tap({ type: 'lineup', side: 'away', playerIds: rosters.away.slice(0, 5) });
  for (let period = 1; period <= 4; period += 1) {
    if (period > 1) tap({ type: 'period', period });
    // Each quarter after the first, two of the bench come on for two on the floor.
    if (period > 1) {
      for (const side of ['home', 'away'] as const) {
        const bench = rosters[side].filter((id) => !onCourt(side).includes(id));
        for (let n = 0; n < 2 && bench.length > 0; n += 1) {
          const inId = bench.splice(Math.floor(random() * bench.length), 1)[0]!;
          tap({ type: 'sub', side, inId, outId: pick(onCourt(side)) });
        }
      }
    }
    tap({ type: 'start' });
    for (let p = 0; p < possessions * 2; p += 1) {
      const side: Side = (p + period) % 2 === 0 ? 'home' : 'away';
      const shooter = pick(onCourt(side));
      const roll = random();
      if (roll < 0.4) tap({ type: 'score', side, playerId: shooter, points: 2 });
      else if (roll < 0.52) tap({ type: 'score', side, playerId: shooter, points: 3 });
      else if (roll < 0.62) {
        // A shooting foul: the free throws are taken with the clock stopped, then it runs.
        tap({ type: 'foul', side: other(side), playerId: pick(onCourt(other(side))) });
        tap({ type: 'score', side, playerId: shooter, points: 1 });
        if (random() < 0.7) tap({ type: 'score', side, playerId: shooter, points: 1 });
        tap({ type: 'start' });
      } else if (roll < 0.74) tap({ type: 'turnover', side, playerId: shooter });
      else if (roll < 0.8) {
        tap({ type: 'foul', side: other(side), playerId: pick(onCourt(other(side))) });
        tap({ type: 'start' });
      } else at += tapSeconds * 1000; // a miss: time goes by, nothing is tapped
    }
    // No tie at the end of regulation: the home side makes one more basket.
    if (period === 4) {
      const { home, away } = basketball.derive(state).teams;
      if (home.score === away.score) {
        tap({ type: 'score', side: 'home', playerId: pick(onCourt('home')), points: 2 });
      }
    }
    tap({ type: 'pause' });
  }
  tap({ type: 'end' });
  return { state, taps };
}

/** Writes the made-up backup to `dir` (made here): a tracker's database folder. */
export async function writeMadeUpTrackerBackup(dir: string, backup: MadeUpBackup): Promise<void> {
  const db = new PGlite();
  try {
    await fillBackup(db, backup);
    await writeDataFolder(db, dir);
  } finally {
    await db.close();
  }
}

async function fillBackup(db: PGlite, backup: MadeUpBackup): Promise<void> {
  await db.exec(await readFile(schemaFile, 'utf8'));
  const teamIds = new Map(backup.teams.map((team) => [team.key, randomUUID()]));
  const idOf = (key: string) => {
    const id = teamIds.get(key);
    if (id === undefined) throw new Error(`The made-up backup has no team ${key}.`);
    return id;
  };
  for (const team of backup.teams) {
    await db.query(
      `INSERT INTO live_stats.teams(id, slug, name, school, tracked) VALUES ($1, $2, $3, '', $4)`,
      [idOf(team.key), team.key, team.name, team.tracked],
    );
  }
  const players = backup.players.map((player) => ({ ...player, id: randomUUID() }));
  for (const p of players) {
    await db.query(
      'INSERT INTO live_stats.players(id, team_id, name, jersey, active) VALUES ($1, $2, $3, $4, true)',
      [p.id, idOf(p.team), p.name, p.jersey],
    );
  }
  const byId = new Map<string, (typeof players)[number]>(players.map((p) => [p.id, p]));
  const rosterOf = (team: string) => players.filter((p) => p.team === team).map((p) => p.id);
  for (const [g, game] of backup.games.entries()) {
    const { state, taps } = playGame(
      game,
      { home: rosterOf(game.home), away: rosterOf(game.away) },
      (game.number ?? g) + 1,
    );
    const derived = basketball.derive(state);
    if (state.status !== 'final' || derived.teams.home.score === derived.teams.away.score) {
      throw new Error('A made-up tracker game did not end with a winner.');
    }
    const gameId = randomUUID();
    await db.query(
      `INSERT INTO live_stats.games(id, season, home_team_id, away_team_id, starts_at, source,
         source_ref, status, home_score, away_score, revision, state)
       VALUES ($1, $2, $3, $4, $5, 'Made-up league', $6, $7, $8, $9, $10, $11)`,
      [
        gameId,
        backup.season,
        idOf(game.home),
        idOf(game.away),
        new Date(game.startsAt).toISOString(),
        game.number === null ? null : `made-up:${game.number}`,
        state.status,
        derived.teams.home.score,
        derived.teams.away.score,
        taps.length,
        JSON.stringify(state),
      ],
    );
    for (const [k, { input, at, commandId }] of taps.entries()) {
      await db.query(
        `INSERT INTO live_stats.game_events(game_id, sequence, command_id, command, accepted_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [gameId, k + 1, commandId, JSON.stringify({ at, input }), new Date(at + 150).toISOString()],
      );
    }
    for (const [playerId, line] of Object.entries(derived.players)) {
      const p = byId.get(playerId);
      if (p === undefined) continue;
      await db.query(
        `INSERT INTO live_stats.player_game_lines(game_id, player_id, team_id, name, jersey,
           appeared, points, fg1, fg2, fg3, fouls, turnovers, ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          gameId,
          playerId,
          idOf(p.team),
          p.name,
          p.jersey,
          line.appeared,
          line.points,
          line.fg1,
          line.fg2,
          line.fg3,
          line.fouls,
          line.turnovers,
          Math.round(line.ms),
        ],
      );
    }
  }
}
