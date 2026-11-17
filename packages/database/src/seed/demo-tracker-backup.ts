// Development-only (T-195, T-201): a made-up backup of the current live tracker, as
// `npm run stats:copy` would leave one, holding the games one team of the seed's
// demo-shaped league scored live (step 2.59). The transfer (step 2.58) brings it in, as it
// would bring in a real one. Made-up data only: every team and player comes from
// demo-league-data.ts, and nothing is read from any other database.
//
// Each game is made up the way a scorer taps a school game: both starting fives, four
// eight-minute quarters with the clock running whole (it stops for fouls and free throws
// and runs again, and each quarter ends at 0:00), a bench rotation at each half quarter and
// the deepest bench in the last two minutes, baskets shared out as a team's are (its best
// player far ahead), fouls and turnovers at a school game's rate. How well each side
// shoots follows the two schools' strengths, and a game is played again from the next
// seed until its winner and margin are the ones the strengths give, so the season reads
// as the fixtures file's does. The same backup comes out every time: nothing here reads a
// clock or a random source but its own seeds.
//
// The actions are played through the tracker's own engine one by one, as its server does:
// an action the engine refuses is not kept, and the game's state, every action and every
// player's line are written as the server writes its rows. The database is built in
// memory and its folder written out once.
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
  /** How good the team is, from -1 to 1. */
  readonly strength: number;
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
  /** Each team's players, its five starters first. */
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

/**
 * Ids made from a seed, in the shape of a uuid (version 4): the same backup every time.
 * The transfer reads the tracker's ids as they are; nothing needs them to be random.
 */
function idsFrom(seed: number): () => string {
  const random = randomFrom(seed);
  return () => {
    const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16));
    hex[12] = '4';
    hex[16] = ((Number.parseInt(hex[16]!, 16) & 3) | 8).toString(16);
    const h = hex.join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
}

/** The home side's points over the away side's that two strengths give. */
export const expectedMargin = (home: number, away: number) => 3 + 14 * (home - away);

/** Seconds in a quarter, as the high-school rules and the tracker's quarters have it. */
const quarterSeconds = 480;
/**
 * How likely a player is to take a side's shot while on the floor, by their place in the
 * roster: the five starters first, the best of them far ahead, the last two least of all.
 */
const shotWeights = [2.8, 1.6, 1.4, 1.2, 1, 1.7, 1.5, 1.4, 1.2, 1.1, 0.12, 0.12];

type Tap = { readonly input: Input; readonly at: number; readonly commandId: string };

/**
 * One game's actions, played through the engine as they are made, so each one is judged
 * against the game as it stands: what the engine refuses is left out.
 */
export function playGame(
  game: BackupGameData,
  rosters: { readonly home: readonly string[]; readonly away: readonly string[] },
  strengths: { readonly home: number; readonly away: number },
  seed: number,
): { state: ReturnType<typeof basketball.newGame>; taps: Tap[] } {
  const random = randomFrom(seed);
  const nextId = idsFrom(seed * 7919 + 1);
  let state = basketball.newGame(basketball.DEFAULT_RULES, game.startsAt - 3_600_000);
  let at = game.startsAt;
  const taps: Tap[] = [];
  const tap = (input: Input) => {
    const commandId = nextId();
    try {
      state = basketball.apply(state, input, { id: commandId, now: at });
      taps.push({ input, at, commandId });
    } catch (error) {
      if (!(error instanceof basketball.TrackerError)) throw error;
    }
  };
  const derived = () => basketball.derive(state);
  const onCourt = (side: Side) => derived().teams[side].onCourt;
  const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');
  const weighted = (ids: readonly string[], weight: (id: string) => number) => {
    const total = ids.reduce((sum, id) => sum + weight(id), 0);
    let roll = random() * total;
    for (const id of ids) {
      roll -= weight(id);
      if (roll <= 0) return id;
    }
    return ids[ids.length - 1]!;
  };
  const shooter = (side: Side) =>
    weighted(onCourt(side), (id) => shotWeights[rosters[side].indexOf(id)] ?? 0.5);
  /** Someone on the floor without four fouls yet, if there is one. */
  const fouler = (side: Side) => {
    const standing = derived().standing;
    const clean = onCourt(side).filter((id) => (standing[id]?.length ?? 0) < 4);
    return weighted(clean.length > 0 ? clean : onCourt(side), () => 1);
  };
  /** Points a side scores for each shot it takes: the better school shoots better. */
  const shooting = (side: Side) =>
    0.74 + 0.07 * (strengths[side] - strengths[other(side)]) + (side === 'home' ? 0.025 : 0);
  /** Who is on the floor for a stretch: starters, or three of them resting for the bench. */
  const sendIn = (side: Side, wanted: readonly string[]) => {
    const now = onCourt(side);
    const coming = wanted.filter((id) => !now.includes(id));
    const going = now.filter((id) => !wanted.includes(id));
    for (const [n, inId] of coming.entries()) {
      const outId = going[n];
      if (outId !== undefined) tap({ type: 'sub', side, inId, outId });
    }
  };
  const lineupFor = (side: Side, period: number, half: 0 | 1) => {
    const roster = rosters[side];
    const starters = roster.slice(0, 5);
    const bench = roster.slice(5, 10);
    if (half === 0) {
      // From the second quarter on, one of the four besides the best player sits out the
      // first half of the quarter too.
      if (period === 1 || bench.length === 0) return starters;
      const sits = 1 + ((period + 3) % 4);
      return starters.map((id, n) => (n === sits ? bench[period % bench.length]! : id));
    }
    // The best player never rests in the middle of a quarter; three of the other four do.
    const resting = [0, 1, 2].map((n) => 1 + ((period + n) % 4));
    const fresh = [0, 1, 2].map((n) => bench[(period * 3 + n) % bench.length]);
    const lineup = starters.map((id, n) => (resting.includes(n) ? undefined : id));
    let k = 0;
    return lineup.map((id) => id ?? fresh[k++] ?? starters[0]!) as string[];
  };

  tap({ type: 'lineup', side: 'home', playerIds: rosters.home.slice(0, 5) });
  tap({ type: 'lineup', side: 'away', playerIds: rosters.away.slice(0, 5) });
  for (let period = 1; period <= 4; period += 1) {
    if (period > 1) {
      tap({ type: 'period', period });
      for (const side of ['home', 'away'] as const) sendIn(side, lineupFor(side, period, 0));
    }
    tap({ type: 'start' });
    let clock = 0;
    let stopped = 0;
    const quarterStart = at;
    const run = (seconds: number) => {
      clock += seconds;
      at = quarterStart + (clock + stopped) * 1000;
    };
    const dead = (seconds: number) => {
      stopped += seconds;
      at = quarterStart + (clock + stopped) * 1000;
    };
    let half: 0 | 1 = 0;
    let lastMinutes = false;
    for (let p = 0; ; p += 1) {
      const seconds = 12 + Math.floor(random() * 9);
      if (clock + seconds >= quarterSeconds - 2) break;
      run(seconds);
      if (half === 0 && clock >= quarterSeconds / 2) {
        half = 1;
        for (const side of ['home', 'away'] as const) sendIn(side, lineupFor(side, period, 1));
      }
      if (period === 4 && !lastMinutes && clock >= quarterSeconds - 120) {
        lastMinutes = true;
        // The end of the bench gets the last two minutes, for the five who started.
        for (const side of ['home', 'away'] as const) {
          const deep = rosters[side].slice(10);
          if (deep.length > 0) sendIn(side, [...onCourt(side).slice(0, 5 - deep.length), ...deep]);
        }
      }
      const side: Side = (p + period) % 2 === 0 ? 'home' : 'away';
      const k = shooting(side);
      const roll = random();
      const by = shooter(side);
      if (roll < 0.36 * k) tap({ type: 'score', side, playerId: by, points: 2 });
      else if (roll < 0.48 * k) tap({ type: 'score', side, playerId: by, points: 3 });
      else if (roll < 0.48 * k + 0.1) {
        // A shooting foul: two free throws with the clock stopped, then it runs again.
        tap({ type: 'foul', side: other(side), playerId: fouler(other(side)) });
        for (let shot = 0; shot < 2; shot += 1) {
          dead(4);
          if (random() < 0.68) tap({ type: 'score', side, playerId: by, points: 1 });
        }
        dead(3);
        tap({ type: 'start' });
      } else if (roll < 0.48 * k + 0.25) {
        tap({ type: 'foul', side: other(side), playerId: fouler(other(side)) });
        dead(5);
        tap({ type: 'start' });
      } else if (roll < 0.48 * k + 0.38) tap({ type: 'turnover', side, playerId: by });
      // Otherwise a miss: the time goes by and nothing is tapped.
    }
    // The clock runs out: the quarter ends at 0:00, and the next tap finds it stopped there.
    run(quarterSeconds - clock + 1);
  }
  tap({ type: 'end' });
  return { state, taps };
}

/**
 * A game played from its first seed on until it ends with the winner, and near the
 * margin, that the two schools' strengths give.
 */
export function playToForm(
  game: BackupGameData,
  rosters: { readonly home: readonly string[]; readonly away: readonly string[] },
  strengths: { readonly home: number; readonly away: number },
): ReturnType<typeof playGame> {
  const expected = expectedMargin(strengths.home, strengths.away);
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const played = playGame(game, rosters, strengths, (game.number ?? 1) * 1000 + attempt);
    const { home, away } = basketball.derive(played.state).teams;
    const margin = home.score - away.score;
    const fouls = (n: number) => n >= 12 && n <= 18;
    if (
      played.state.status === 'final' &&
      fouls(home.fouls) &&
      fouls(away.fouls) &&
      margin !== 0 &&
      Math.sign(margin) === (expected >= 0 ? 1 : -1) &&
      Math.abs(margin - expected) <= 10
    ) {
      return played;
    }
  }
  throw new Error("A made-up tracker game could not be played to its schools' form.");
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
  const nextId = idsFrom(2526);
  const teamIds = new Map(backup.teams.map((team) => [team.key, nextId()]));
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
  const players = backup.players.map((player) => ({ ...player, id: nextId() }));
  for (const p of players) {
    await db.query(
      'INSERT INTO live_stats.players(id, team_id, name, jersey, active) VALUES ($1, $2, $3, $4, true)',
      [p.id, idOf(p.team), p.name, p.jersey],
    );
  }
  const byId = new Map<string, (typeof players)[number]>(players.map((p) => [p.id, p]));
  const rosterOf = (team: string) => players.filter((p) => p.team === team).map((p) => p.id);
  for (const game of backup.games) {
    const strengthOf = (key: string) => backup.teams.find((t) => t.key === key)?.strength ?? 0;
    const { state, taps } = playToForm(
      game,
      { home: rosterOf(game.home), away: rosterOf(game.away) },
      { home: strengthOf(game.home), away: strengthOf(game.away) },
    );
    const derived = basketball.derive(state);
    const gameId = nextId();
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
