// Admin → Games and "My games to score" on the database ports (step 2.93 part 6, half 1):
// every command and read those screens send, run through the web app's own database ports
// (databasePorts: games.deps, games.namesOf) on the made-up database with its season under
// way, as each of the people the step names: the owner, an admin, a scheduler, a
// scorekeeper assigned to the game and one who is not (under "any scorekeeper" and under
// "assigned games only"), a coach, a signed-in stranger, another league's admin and someone
// signed out. Who may do what is written out here from the spec (P4 §4: Games is the
// owner's, the admins' and the schedulers'; a scorekeeper scores, any game or their
// assigned ones by the league's setting; deciding a game otherwise than by its score, and
// correcting one, are not a scorekeeper's), not read from core, so a port that ran a
// command on the wrong transaction or let a role through would fail. A result moves the
// public standings in the command's own transaction, and a correction moves them back.
import {
  cancelGame,
  getBoxScoreSheet,
  listEarlierGames,
  listGamesNeedingResult,
  listMyGames,
  postponeGame,
  readReopenOffer,
  recordFinalScore,
  recordForfeit,
  reopenGame,
  setBoxScore,
  setSetting,
  whoMayScore,
  type CommandContext,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actors, gamesWorld, type Actor, type GamesWorld } from './database-games.test-helper.ts';

let w: GamesWorld;

beforeAll(async () => {
  w = await gamesWorld({ byHand: 64, live: 0 });
}, 300_000);

afterAll(async () => {
  await w.close();
});

const refused = { ok: false, error: { code: 'not-allowed' } };

/** Who scores a game, by the league's rule (P4 §4): all of Games, and the scorekeepers. */
const scorersUnder = {
  anyScorekeeper: ['owner', 'admin', 'scheduler', 'scorekeeper', 'unassignedScorekeeper'],
  // The seed scorekeeper is assigned to every game made here; the other one to none.
  assignedOnly: ['owner', 'admin', 'scheduler', 'scorekeeper'],
} as const satisfies Record<string, readonly Actor[]>;
type Rule = keyof typeof scorersUnder;
/** Who reads the lists of games to score: whoever scores somewhere, under either rule. */
const listReaders: readonly Actor[] = scorersUnder.anyScorekeeper;
/** Who decides a game otherwise than by its score, and corrects one: Games, not a scorekeeper. */
const gamesPeople: readonly Actor[] = ['owner', 'admin', 'scheduler'];

async function setRule(rule: Rule) {
  const rows = await w.ports.adminSettings.deps.transaction(w.asOwner, (tx) =>
    tx.leagues.settingRows(whoMayScore.key, {}),
  );
  const saved = rows.find((row) => row.level === 'league');
  const result = await setSetting(
    w.asOwner,
    { level: 'league', key: whoMayScore.key, value: rule, version: saved?.version ?? null },
    w.ports.adminSettings.deps,
  );
  expect(result).toMatchObject({ ok: true });
}

/** The box score of a Herons–Otters game: every player played, with their points. */
const boxLines = (home: number, away: number) => [
  ...w.players.herons.map((personId, n) => ({
    teamId: w.herons,
    personId,
    played: true,
    secondsPlayed: null,
    stats: { points: n === 0 ? home : 0 },
  })),
  ...w.players.otters.map((personId, n) => ({
    teamId: w.otters,
    personId,
    played: true,
    secondsPlayed: null,
    stats: { points: n === 0 ? away : 0 },
  })),
];

/** Decided by the owner, so it can be corrected. */
async function decided(gameId: string) {
  const result = await recordFinalScore(
    w.asOwner,
    { gameId, version: await w.versionOf(gameId), homeScore: 70, awayScore: 64 },
    w.ports.games.deps,
  );
  expect(result).toMatchObject({ ok: true });
  return gameId;
}

const plus = (line: readonly number[] | undefined, by: readonly number[]) =>
  (line ?? []).map((n, k) => n + (by[k] ?? 0));

describe('the games area on the database ports', () => {
  it('a typed final score moves the public standings at once, and a correction moves them back', async () => {
    const gameId = w.take(w.byHand);
    const before = await w.standings();
    // The game needs a result: it started two days ago.
    const needs = await listGamesNeedingResult(w.contextOf('owner'), {}, w.ports.games.deps);
    expect(JSON.stringify(needs)).toContain(gameId);
    // The scorekeeper types the final score.
    const saved = await recordFinalScore(
      w.contextOf('scorekeeper'),
      { gameId, version: await w.versionOf(gameId), homeScore: 61, awayScore: 55 },
      w.ports.games.deps,
    );
    expect(saved).toMatchObject({ ok: true });
    const after = await w.standings();
    expect(after['Lakeside Herons']).toEqual(plus(before['Lakeside Herons'], [1, 1, 0, 61, 55]));
    expect(after['Lakeside Otters']).toEqual(plus(before['Lakeside Otters'], [1, 0, 1, 55, 61]));
    expect(after['Lakeside Gulls']).toEqual(before['Lakeside Gulls']);
    expect(await w.gameOf(gameId)).toMatchObject({ status: 'final', homeScore: 61, awayScore: 55 });
    // It no longer needs one.
    const needsNow = await listGamesNeedingResult(w.contextOf('owner'), {}, w.ports.games.deps);
    expect(JSON.stringify(needsNow)).not.toContain(gameId);
    // An admin corrects it: the standings go back as they were.
    const reopened = await reopenGame(
      w.contextOf('admin'),
      { gameId, version: await w.versionOf(gameId), reason: 'Scores swapped on the sheet' },
      w.ports.games.deps,
    );
    expect(reopened).toMatchObject({ ok: true });
    expect(await w.standings()).toEqual(before);
    expect(await w.gameOf(gameId)).toMatchObject({ status: 'scheduled', homeScore: null });
    // And the right score is typed.
    await recordFinalScore(
      w.contextOf('admin'),
      { gameId, version: await w.versionOf(gameId), homeScore: 55, awayScore: 61 },
      w.ports.games.deps,
    );
    const corrected = await w.standings();
    expect(corrected['Lakeside Herons']).toEqual(
      plus(before['Lakeside Herons'], [1, 0, 1, 55, 61]),
    );
    expect(corrected['Lakeside Otters']).toEqual(
      plus(before['Lakeside Otters'], [1, 1, 0, 61, 55]),
    );
  });

  it('a box score moves the standings and the season totals; a forfeit moves the standings too', async () => {
    const box = w.take(w.byHand);
    const before = await w.standings();
    const saved = await setBoxScore(
      w.contextOf('scheduler'),
      {
        gameId: box,
        version: await w.versionOf(box),
        homeScore: 48,
        awayScore: 52,
        lines: boxLines(48, 52),
      },
      w.ports.games.deps,
    );
    expect(saved).toMatchObject({ ok: true });
    expect((await w.standings())['Lakeside Otters']).toEqual(
      plus(before['Lakeside Otters'], [1, 1, 0, 52, 48]),
    );
    // The sheet reads back what was saved.
    const sheet = await getBoxScoreSheet(
      w.contextOf('scorekeeper'),
      { gameId: box },
      w.ports.games.deps,
    );
    expect(sheet.ok && sheet.value.lines.length).toBe(10);
    // The statistics follow in the same transaction: the Herons' first player's 48 points.
    const statistics = await w.ports.publicStats.statisticsOf(w.leagueId, async (read) =>
      read.store.playerTotals(w.seasonId),
    );
    expect(statistics.find((t) => t.personId === w.players.herons[0])).toMatchObject({
      gamesPlayed: 1,
    });
    const forfeit = w.take(w.byHand);
    const beforeForfeit = await w.standings();
    expect(
      await recordForfeit(
        w.contextOf('owner'),
        { gameId: forfeit, version: await w.versionOf(forfeit), forfeitingTeamId: w.otters },
        w.ports.games.deps,
      ),
    ).toMatchObject({ ok: true });
    const afterForfeit = await w.standings();
    expect(afterForfeit['Lakeside Herons']?.slice(0, 3)).toEqual(
      plus(beforeForfeit['Lakeside Herons'], [1, 1, 0]).slice(0, 3),
    );
  });

  it("names each game's teams, season and scorekeepers from the league's own rows", async () => {
    const names = await w.ports.games.namesOf(w.leagueId);
    expect(Object.values(names.teams)).toContain('Lakeside Herons');
    expect(Object.keys(names.seasons)).toContain(w.seasonId);
    // The seed scorekeeper's display name, on every game assigned to them.
    expect(names.scorekeepers[w.byHand[0] ?? '']).toEqual(['Sky Scorer']);
    // Nothing of the other league's.
    const other = await w.ports.games.namesOf(w.otherLeagueId);
    expect(Object.values(other.teams)).not.toContain('Lakeside Herons');
    expect(Object.values(names.teams)).not.toContain('Maple Comets');
    expect(Object.keys(other.scorekeepers)).not.toContain(w.byHand[0]);
  });
});

/** A command of the games area, run as one person on a game prepared for it. */
type Case = {
  readonly name: string;
  /** Who may run it, under each rule. */
  readonly who: (rule: Rule) => readonly Actor[];
  /** A game in the state the command needs: a fresh one for each run that may change it. */
  readonly game: () => Promise<string>;
  readonly run: (context: CommandContext, gameId: string) => Promise<unknown>;
  /** Whether it writes: then a refusal must leave everything as it was. */
  readonly writes: boolean;
};

const scorers = (rule: Rule) => scorersUnder[rule];
const fresh = async () => w.take(w.byHand);
/** One game for every read: a read changes nothing. */
let readGame: string | undefined;
const shared = async () => (readGame ??= w.take(w.byHand));

const cases: readonly Case[] = [
  {
    name: 'listGamesNeedingResult',
    who: () => listReaders,
    game: shared,
    run: (c) => listGamesNeedingResult(c, {}, w.ports.games.deps),
    writes: false,
  },
  {
    name: 'listEarlierGames',
    who: () => listReaders,
    game: shared,
    run: (c) => listEarlierGames(c, {}, w.ports.games.deps),
    writes: false,
  },
  {
    name: 'listMyGames',
    who: () => listReaders,
    game: shared,
    run: (c) => listMyGames(c, {}, w.ports.games.deps),
    writes: false,
  },
  {
    name: 'getBoxScoreSheet',
    who: scorers,
    game: shared,
    run: (c, gameId) => getBoxScoreSheet(c, { gameId }, w.ports.games.deps),
    writes: false,
  },
  {
    name: 'readReopenOffer',
    who: scorers,
    game: shared,
    run: (c, gameId) => readReopenOffer(c, { gameId }, w.ports.games.deps),
    writes: false,
  },
  {
    name: 'recordFinalScore',
    who: scorers,
    game: fresh,
    run: async (c, gameId) =>
      recordFinalScore(
        c,
        { gameId, version: await w.versionOf(gameId), homeScore: 40, awayScore: 38 },
        w.ports.games.deps,
      ),
    writes: true,
  },
  {
    name: 'setBoxScore',
    who: scorers,
    game: fresh,
    run: async (c, gameId) =>
      setBoxScore(
        c,
        {
          gameId,
          version: await w.versionOf(gameId),
          homeScore: 40,
          awayScore: 38,
          lines: boxLines(40, 38),
        },
        w.ports.games.deps,
      ),
    writes: true,
  },
  {
    name: 'recordForfeit',
    who: () => gamesPeople,
    game: fresh,
    run: async (c, gameId) =>
      recordForfeit(
        c,
        { gameId, version: await w.versionOf(gameId), forfeitingTeamId: w.herons },
        w.ports.games.deps,
      ),
    writes: true,
  },
  {
    name: 'postponeGame',
    who: () => gamesPeople,
    game: fresh,
    run: async (c, gameId) =>
      postponeGame(c, { gameId, version: await w.versionOf(gameId) }, w.ports.games.deps),
    writes: true,
  },
  {
    name: 'cancelGame',
    who: () => gamesPeople,
    game: fresh,
    run: async (c, gameId) =>
      cancelGame(c, { gameId, version: await w.versionOf(gameId) }, w.ports.games.deps),
    writes: true,
  },
  {
    name: 'reopenGame',
    who: () => gamesPeople,
    game: async () => decided(await fresh()),
    run: async (c, gameId) =>
      reopenGame(
        c,
        { gameId, version: await w.versionOf(gameId), reason: 'A correction' },
        w.ports.games.deps,
      ),
    writes: true,
  },
];

describe.each(['anyScorekeeper', 'assignedOnly'] as const)(
  'the games area on the database ports, role by role, with "%s"',
  (rule) => {
    beforeAll(async () => {
      await setRule(rule);
    });

    describe.each(cases)('$name', (c) => {
      // One game for every refusal of a command that writes: a refusal changes nothing.
      let refusedGame: string | undefined;
      it.each(actors)('as %s', async (actor) => {
        const allowed = c.who(rule).includes(actor);
        const gameId = allowed ? await c.game() : (refusedGame ??= await c.game());
        const before = c.writes ? await w.everything(w.leagueId, [gameId]) : undefined;
        const standingsBefore = await w.standings();
        const result = await c.run(w.contextOf(actor), gameId);
        if (allowed) {
          expect(result, actor).toMatchObject({ ok: true });
          if (c.writes && c.name !== 'postponeGame' && c.name !== 'cancelGame') {
            // Deciding a game, or taking its result back, moves the standings at once.
            expect(await w.standings()).not.toEqual(standingsBefore);
          }
        } else {
          expect(result, actor).toEqual(refused);
          if (c.writes) expect(await w.everything(w.leagueId, [gameId])).toEqual(before);
          expect(await w.standings()).toEqual(standingsBefore);
        }
      });
    });
  },
);

describe('a game of another league, through either league', () => {
  /** What each command answers, as Lakeside's owner, for Maple Street's game. */
  const expected: Record<string, string> = {
    getBoxScoreSheet: 'game-not-found',
    readReopenOffer: 'game-not-found',
    recordFinalScore: 'game-not-found',
    setBoxScore: 'game-not-found',
    recordForfeit: 'game-not-found',
    postponeGame: 'game-not-found',
    cancelGame: 'game-not-found',
    reopenGame: 'game-not-found',
  };
  const onAGame = cases.filter((c) => c.name in expected);

  it.each(onAGame)(
    "$name: another league's game is not found, and nothing of it changes",
    async (c) => {
      const theirs = await w.everything(w.otherLeagueId, [w.otherGameId]);
      const ours = await w.everything(w.leagueId, []);
      // Lakeside's owner, through Lakeside, with Maple Street's game.
      expect(await c.run(w.asOwner, w.otherGameId)).toEqual({
        ok: false,
        error: { code: expected[c.name] },
      });
      // Lakeside's owner through Maple Street, where they hold nothing.
      expect(await c.run(w.contextOf('owner', w.otherLeagueId), w.otherGameId)).toEqual(refused);
      // Maple Street's own admin, through Maple Street, with a game of Lakeside's.
      expect(
        await c.run(w.contextOf('otherLeagueAdmin', w.otherLeagueId), w.byHand[0] ?? ''),
      ).toEqual({
        ok: false,
        error: { code: expected[c.name] },
      });
      expect(await w.everything(w.otherLeagueId, [w.otherGameId])).toEqual(theirs);
      expect(await w.everything(w.leagueId, [])).toEqual(ours);
    },
  );
});
