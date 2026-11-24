// The tracker on the database ports (step 2.93 part 6, half 2): a game scored live through
// the web app's own database ports (databasePorts: tracker.deps, the snapshot read, the
// endpoints' ports) on the made-up database with its season under way. The scorekeeper
// takes the game, sends the lineups and plays (one of them twice), a visitor reads the
// snapshot with the names the league's settings allow, the game ends and the standings
// move in the same transaction, it is reopened within the allowed time (they move back)
// and ended again. Then every command the tracker's endpoints send, role by role, written
// out from the spec (P4 §4, T6 §5) as in database-games.test.ts; a tap by one league's
// scorekeeper never reaches another league's game; and a season hidden again takes its
// games off the public snapshot while its scorekeeper still scores.
import {
  applyTrackerCommands,
  getSeason,
  listScoringOffers,
  markNotStarted,
  openScoringSession,
  publicNames,
  publicViewer,
  readGamePage,
  readGameSnapshot,
  readTrackerRosters,
  readTrackerState,
  releaseScoringSession,
  renewScoringSession,
  reopenTrackedGame,
  setSetting,
  takeOverScoring,
  updateSeason,
  whoMayScore,
  type CommandContext,
} from '@srleagues/core';
import * as database from '@srleagues/database';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actors, gamesWorld, type Actor, type GamesWorld } from './database-games.test-helper.ts';
import { commandsSince } from '../features/tracker/commands-since.ts';
import { databaseTracker, GameNamesOnlyWithSettings } from './database-tracker.ts';
import { gameSnapshot } from './game-snapshot-endpoint.ts';

let w: GamesWorld;

beforeAll(async () => {
  w = await gamesWorld({ byHand: 0, live: 96 });
}, 300_000);

afterAll(async () => {
  await w.close();
});

const refused = { ok: false, error: { code: 'not-allowed' } };
/** The answer to taps for a game this league does not have: each refused, nothing saved. */
const unknownGame = (taps: readonly { readonly commandId: string }[]) => ({
  ok: true,
  value: {
    protocolVersion: 1,
    results: taps.map((t) => ({
      commandId: t.commandId,
      status: 'refused',
      reason: { code: 'unknown-game', message: 'There is no such game.' },
    })),
    sequence: 0,
  },
});

/** Who scores a game, by the league's rule (P4 §4): all of Games, and the scorekeepers. */
const scorersUnder = {
  anyScorekeeper: ['owner', 'admin', 'scheduler', 'scorekeeper', 'unassignedScorekeeper'],
  // The seed scorekeeper is assigned to every game made here; the other one to none.
  assignedOnly: ['owner', 'admin', 'scheduler', 'scorekeeper'],
} as const satisfies Record<string, readonly Actor[]>;
type Rule = keyof typeof scorersUnder;

async function saveSetting(key: string, value: unknown) {
  const rows = await w.ports.adminSettings.deps.transaction(w.asOwner, (tx) =>
    tx.leagues.settingRows(key, {}),
  );
  const saved = rows.find((row) => row.level === 'league');
  const result = await setSetting(
    w.asOwner,
    { level: 'league', key, value, version: saved?.version ?? null },
    w.ports.adminSettings.deps,
  );
  expect(result).toMatchObject({ ok: true });
}

let tapNumber = 0;
/** A tap with a fresh id, a moment before the server's now. */
const tap = (input: unknown) => {
  tapNumber += 1;
  return { commandId: randomUUID(), at: w.clock.at - 60_000 + tapNumber, input };
};
const tipOff = () => [
  tap({ type: 'lineup', side: 'home', playerIds: w.players.herons }),
  tap({ type: 'lineup', side: 'away', playerIds: w.players.otters }),
  tap({ type: 'start' }),
];

/** Takes the game on `deviceId`: its session id, or a made-up one when refused. */
async function open(context: CommandContext, gameId: string, deviceId = 'tablet') {
  const opened = await openScoringSession(context, { gameId, deviceId }, w.ports.tracker.deps);
  return opened.ok && opened.value.status === 'held-by-you' ? opened.value.sessionId : randomUUID();
}
const send = (
  context: CommandContext,
  gameId: string,
  sessionId: string,
  commands: readonly unknown[],
) =>
  applyTrackerCommands(
    context,
    { gameId, protocolVersion: 1, sessionId, commands },
    w.ports.tracker.deps,
  );
/** Opens the game as `context`, tips off, scores 2 for the Herons and ends it. */
async function playAndEnd(context: CommandContext, gameId: string) {
  const sessionId = await open(context, gameId);
  return send(context, gameId, sessionId, [
    ...tipOff(),
    tap({ type: 'score', side: 'home', playerId: w.players.herons[0], points: 2 }),
    tap({ type: 'end' }),
  ]);
}

/** The game as a visitor's snapshot reads it, through the snapshot endpoint's own code. */
async function watched(gameId: string) {
  const answer = await gameSnapshot(
    {
      context: {
        kind: 'league',
        requestId: randomUUID(),
        account: null,
        league: { id: w.leagueId, slug: 'lakeside', status: 'live' },
      },
      holder: undefined,
      carriesSignIn: false,
    },
    gameId,
    w.ports.tracker,
  );
  return answer;
}

const plus = (line: readonly number[] | undefined, by: readonly number[]) =>
  (line ?? []).map((n, k) => n + (by[k] ?? 0));

describe('a game scored live on the database ports', () => {
  it('takes the session, saves the plays once each, ends, reopens and ends again', async () => {
    const gameId = w.take(w.live);
    const scorer = w.contextOf('scorekeeper');
    const before = await w.standings();
    const sessionId = await open(scorer, gameId);
    // Another scorekeeper is shown who holds it: the holder's own name, in this league.
    const other = await openScoringSession(
      w.contextOf('admin'),
      { gameId, deviceId: 'laptop' },
      w.ports.tracker.deps,
    );
    expect(other).toMatchObject({ ok: true, value: { status: 'held-by-other' } });
    expect(await w.ports.tracker.displayNameOf(w.leagueId, scorer.accountId ?? '')).toBe(
      'Sky Scorer',
    );
    // The device reads the rosters, in full: a staff read (T6 §4).
    const rosters = await readTrackerRosters(scorer, { gameId }, w.ports.tracker.deps);
    expect(rosters.ok && rosters.value.players.map((p) => p.lastName)).toContain('Heronfamily');
    expect(await send(scorer, gameId, sessionId, tipOff())).toMatchObject({ ok: true });
    const basket = tap({ type: 'score', side: 'home', playerId: w.players.herons[0], points: 3 });
    const first = await send(scorer, gameId, sessionId, [basket]);
    expect(first.ok && first.value.results.map((r) => r.status)).toEqual(['accepted']);
    // The same tap again (a retry after a dropped connection): applied once.
    const again = await send(scorer, gameId, sessionId, [basket]);
    expect(again.ok && again.value.results.map((r) => r.status)).toEqual(['duplicate']);
    const state = await readTrackerState(scorer, { gameId }, w.ports.tracker.deps);
    expect(state.ok && state.value.sequence).toBe(4);
    // A visitor's snapshot: the score, and the players by the league's names setting.
    const live = await watched(gameId);
    expect(live.status).toBe(200);
    expect(live.headers?.['Cache-Control']).toBe('public, max-age=0, s-maxage=2');
    expect(live.body).toMatchObject({ status: 'live', score: { home: 3, away: 0 } });
    expect(JSON.stringify(live.body)).toContain('Heronfamily');
    // The game's page itself, read inside the same read-only snapshot as the names.
    const page = await w.ports.tracker.gameReadsOf(w.leagueId, (read) =>
      readGamePage(
        read.store,
        { gameId },
        {
          leagueId: w.leagueId,
          viewer: publicViewer(w.leagueId),
          audience: read.audience,
          policy: read.policy,
        },
      ),
    );
    expect(page).toMatchObject({ ok: true, value: { game: { id: gameId, status: 'live' } } });
    expect(JSON.stringify(page)).toContain('Heronfamily');
    // The standings wait for the end.
    expect(await w.standings()).toEqual(before);
    const ended = await send(scorer, gameId, sessionId, [tap({ type: 'end' })]);
    expect(ended).toMatchObject({ ok: true });
    expect(await w.gameOf(gameId)).toMatchObject({ status: 'final', homeScore: 3, awayScore: 0 });
    const afterEnd = await w.standings();
    expect(afterEnd['Lakeside Herons']).toEqual(plus(before['Lakeside Herons'], [1, 1, 0, 3, 0]));
    expect(afterEnd['Lakeside Otters']).toEqual(plus(before['Lakeside Otters'], [1, 0, 1, 0, 3]));
    // Reopened by the scorekeeper who ended it, within the league's time for it.
    w.clock.at += 5 * 60_000;
    const reopened = await reopenTrackedGame(
      scorer,
      { gameId, requestId: randomUUID(), reason: 'Ended by mistake' },
      w.ports.tracker.deps,
    );
    expect(reopened).toMatchObject({ ok: true });
    expect(await w.gameOf(gameId)).toMatchObject({ status: 'live' });
    expect(await w.standings()).toEqual(before);
    // And ended again, from the session it hands back.
    const back = await open(scorer, gameId);
    expect(await send(scorer, gameId, back, [tap({ type: 'end' })])).toMatchObject({ ok: true });
    expect(await w.standings()).toEqual(afterEnd);
    const final = await watched(gameId);
    expect(final.body).toMatchObject({ status: 'final', score: { home: 3, away: 0 } });
  });

  it("shows a watcher the names the league's settings allow, and the scorer every name", async () => {
    const gameId = w.take(w.live);
    const scorer = w.contextOf('scorekeeper');
    const sessionId = await open(scorer, gameId);
    await send(scorer, gameId, sessionId, [
      ...tipOff(),
      tap({ type: 'score', side: 'away', playerId: w.players.otters[1], points: 2 }),
    ]);
    const seen = async () => JSON.stringify((await watched(gameId)).body);
    expect(await seen()).toContain('Otterfamily');
    try {
      await saveSetting(publicNames.key, 'firstNameLastInitial');
      const initials = await seen();
      expect(initials).toContain('Player41 O.');
      expect(initials).not.toContain('Otterfamily');
      await saveSetting(publicNames.key, 'hidden');
      const hidden = await seen();
      expect(hidden).not.toContain('Otterfamily');
      expect(hidden).not.toContain('Player41');
      // The same through the one-snapshot read the game page uses.
      const page = await w.ports.tracker.gameReadsOf(w.leagueId, async (read) => ({
        policy: read.policy,
        snapshot: await readGameSnapshot(
          read.store,
          { gameId },
          {
            leagueId: w.leagueId,
            viewer: publicViewer(w.leagueId),
            audience: read.audience,
            policy: read.policy,
          },
          w.clock.at,
        ),
      }));
      // The settings it read are the league's saved ones, the same the names read alone gives.
      expect(page.policy).toEqual((await w.ports.tracker.namesShownOf(w.leagueId)).policy);
      expect(JSON.stringify(page.snapshot)).not.toContain('Player41');
      // The scorer's device lists every player in full, whatever the public setting.
      const rosters = await readTrackerRosters(scorer, { gameId }, w.ports.tracker.deps);
      expect(rosters.ok && rosters.value.players.map((p) => p.firstName)).toContain('Player41');
    } finally {
      await saveSetting(publicNames.key, 'fullName');
    }
  });
});

describe('what a watcher reads, in one snapshot (record 076)', () => {
  it("reads the game, the people and the league's name settings in one page snapshot", async () => {
    const opened: unknown[] = [];
    // The tracker's ports open league transactions only: the league's form of the helper.
    const counting = ((
      handle: database.DatabaseHandle,
      context: { readonly leagueId: string },
      work: (scope: database.LeagueScope) => Promise<unknown>,
      options?: { readonly snapshot?: 'page' },
    ) => {
      opened.push(options);
      return database.withTransaction(handle, context, work, options);
    }) as typeof database.withTransaction;
    const tracker = databaseTracker(
      { ...database, withTransaction: counting },
      w.db,
      w.ports.tracker.deps,
      { now: () => w.clock.at },
    );
    const gameId = w.take(w.live);
    const scorer = w.contextOf('scorekeeper');
    await send(scorer, gameId, await open(scorer, gameId), tipOff());
    const read = await tracker.gameReadsOf(w.leagueId, async ({ store, audience, policy }) =>
      readGameSnapshot(
        store,
        { gameId },
        { leagueId: w.leagueId, viewer: publicViewer(w.leagueId), audience, policy },
        w.clock.at,
      ),
    );
    expect(JSON.stringify(read)).toContain('Heronfamily');
    // One transaction for the whole read: REPEATABLE READ and READ ONLY (record 070).
    expect(opened).toEqual([{ snapshot: 'page' }]);
    // The store alone reads no person: a name only with the settings of the same snapshot.
    await expect(tracker.snapshotStoreOf(w.leagueId).people(w.players.herons)).rejects.toThrow(
      GameNamesOnlyWithSettings,
    );
    expect(await tracker.snapshotStoreOf(w.leagueId).findGame(gameId)).toMatchObject({
      status: 'live',
    });
  });
});

/** A command of the tracker's endpoints, run as one person on a game prepared for it. */
type Case = {
  readonly name: string;
  readonly game: () => Promise<string>;
  readonly run: (context: CommandContext, gameId: string) => Promise<unknown>;
  readonly writes: boolean;
};

const fresh = async () => w.take(w.live);
/** A fresh game held by the owner's tablet. */
const heldByOwner = async () => {
  const gameId = await fresh();
  await open(w.asOwner, gameId, 'owner-tablet');
  return gameId;
};
/** A fresh game under way on the owner's tablet: its sequence after the tip-off is 3. */
const underWay = async () => {
  const gameId = await fresh();
  await send(w.asOwner, gameId, await open(w.asOwner, gameId, 'owner-tablet'), tipOff());
  return gameId;
};
let readGame: string | undefined;
const shared = async () => (readGame ??= await underWay());

const cases: readonly Case[] = [
  {
    name: 'openScoringSession',
    game: fresh,
    run: (c, gameId) => openScoringSession(c, { gameId, deviceId: 'device' }, w.ports.tracker.deps),
    writes: true,
  },
  {
    name: 'renewScoringSession',
    game: fresh,
    run: async (c, gameId) =>
      renewScoringSession(
        c,
        { gameId, sessionId: await open(c, gameId, 'device') },
        w.ports.tracker.deps,
      ),
    writes: true,
  },
  {
    name: 'releaseScoringSession',
    game: fresh,
    run: async (c, gameId) =>
      releaseScoringSession(
        c,
        { gameId, sessionId: await open(c, gameId, 'device') },
        w.ports.tracker.deps,
      ),
    writes: true,
  },
  {
    name: 'takeOverScoring',
    game: heldByOwner,
    run: async (c, gameId) => {
      const seen = await openScoringSession(
        c,
        { gameId, deviceId: 'device' },
        w.ports.tracker.deps,
      );
      const since = seen.ok && seen.value.status === 'held-by-other' ? seen.value.holder.since : 0;
      return takeOverScoring(
        c,
        { gameId, deviceId: 'device', confirmed: true, expectedHolderSince: since },
        w.ports.tracker.deps,
      );
    },
    writes: true,
  },
  {
    name: 'applyTrackerCommands',
    game: fresh,
    run: async (c, gameId) => send(c, gameId, await open(c, gameId, 'device'), tipOff()),
    writes: true,
  },
  {
    name: 'readTrackerState',
    game: shared,
    run: (c, gameId) => readTrackerState(c, { gameId }, w.ports.tracker.deps),
    writes: false,
  },
  {
    name: 'readTrackerRosters',
    game: shared,
    run: (c, gameId) => readTrackerRosters(c, { gameId }, w.ports.tracker.deps),
    writes: false,
  },
  {
    name: 'markNotStarted',
    game: fresh,
    // Tipped off by the person themselves, holding the game (another's session is theirs).
    run: async (c, gameId) => {
      await send(c, gameId, await open(c, gameId, 'device'), tipOff());
      return markNotStarted(c, { gameId, sequence: 3 }, w.ports.tracker.deps);
    },
    writes: true,
  },
  {
    name: 'reopenTrackedGame',
    game: fresh,
    // Played and ended by the person themselves, then reopened within the time for it.
    run: async (c, gameId) => {
      await playAndEnd(c, gameId);
      return reopenTrackedGame(
        c,
        { gameId, requestId: randomUUID(), reason: 'Ended by mistake' },
        w.ports.tracker.deps,
      );
    },
    writes: true,
  },
];

describe.each(['anyScorekeeper', 'assignedOnly'] as const)(
  'the tracker on the database ports, role by role, with "%s"',
  (rule: Rule) => {
    beforeAll(async () => {
      await saveSetting(whoMayScore.key, rule);
    });

    describe.each(cases)('$name', (c) => {
      let refusedGame: string | undefined;
      it.each(actors)('as %s', async (actor) => {
        const allowed = (scorersUnder[rule] as readonly Actor[]).includes(actor);
        const gameId = allowed ? await c.game() : (refusedGame ??= await c.game());
        const before = c.writes ? await w.everything(w.leagueId, [gameId]) : undefined;
        const result = await c.run(w.contextOf(actor), gameId);
        if (allowed) {
          expect(result, actor).toMatchObject({ ok: true });
          if (c.name === 'openScoringSession' || c.name === 'takeOverScoring') {
            expect(result, actor).toMatchObject({ value: { status: 'held-by-you' } });
          }
        } else {
          expect(result, actor).toEqual(refused);
          if (c.writes) expect(await w.everything(w.leagueId, [gameId])).toEqual(before);
        }
      });
    });
  },
);

describe("another league's game", () => {
  it("a tap by one league's scorekeeper never reaches another league's game", async () => {
    await saveSetting(whoMayScore.key, 'anyScorekeeper');
    const theirs = await w.everything(w.otherLeagueId, [w.otherGameId]);
    const ours = await w.everything(w.leagueId, []);
    const scorer = w.contextOf('scorekeeper');
    // Through Lakeside's address, Maple Street's game is not there.
    expect(
      await openScoringSession(
        scorer,
        { gameId: w.otherGameId, deviceId: 'tablet' },
        w.ports.tracker.deps,
      ),
    ).toEqual({ ok: false, error: { code: 'game-not-found' } });
    const taps = tipOff();
    expect(await send(scorer, w.otherGameId, randomUUID(), taps)).toEqual(unknownGame(taps));
    expect(await readTrackerState(scorer, { gameId: w.otherGameId }, w.ports.tracker.deps)).toEqual(
      { ok: false, error: { code: 'game-not-found' } },
    );
    // Through Maple Street's, where the scorekeeper holds nothing, it is refused.
    const there = w.contextOf('scorekeeper', w.otherLeagueId);
    expect(
      await openScoringSession(
        there,
        { gameId: w.otherGameId, deviceId: 'tablet' },
        w.ports.tracker.deps,
      ),
    ).toEqual(refused);
    expect(await send(there, w.otherGameId, randomUUID(), tipOff())).toEqual(refused);
    // Nor does the visitor's snapshot of Lakeside answer for it.
    expect((await watched(w.otherGameId)).status).toBe(404);
    expect(await w.everything(w.otherLeagueId, [w.otherGameId])).toEqual(theirs);
    expect(await w.everything(w.leagueId, [])).toEqual(ours);
  });
});

describe('a season hidden again', () => {
  it('takes its games off the public snapshot, while its scorekeeper still scores', async () => {
    const gameId = w.take(w.live);
    const scorer = w.contextOf('scorekeeper');
    const sessionId = await open(scorer, gameId);
    await send(scorer, gameId, sessionId, tipOff());
    expect((await watched(gameId)).status).toBe(200);
    const season = async () => {
      const read = await getSeason(w.asOwner, { seasonId: w.seasonId }, w.ports.adminSettings.deps);
      if (!read.ok) throw new Error(read.error.code);
      return read.value;
    };
    const hide = await updateSeason(
      w.asOwner,
      { seasonId: w.seasonId, version: (await season()).version, status: 'draft' },
      w.ports.adminSettings.deps,
    );
    expect(hide).toMatchObject({ ok: true });
    try {
      expect((await watched(gameId)).status).toBe(404);
      expect(
        await w.ports.publicSchedule.gameFactsOf(w.leagueId, w.seasonId, gameId),
      ).toBeUndefined();
      // Still scored by its scorekeeper.
      const play = await send(scorer, gameId, sessionId, [
        tap({ type: 'score', side: 'home', playerId: w.players.herons[0], points: 2 }),
      ]);
      expect(play.ok && play.value.results.map((r) => r.status)).toEqual(['accepted']);
    } finally {
      await updateSeason(
        w.asOwner,
        { seasonId: w.seasonId, version: (await season()).version, status: 'active' },
        w.ports.adminSettings.deps,
      );
    }
    expect((await watched(gameId)).body).toMatchObject({ score: { home: 2, away: 0 } });
  });
});

describe("the tracker: who may reopen, and another league's admin", () => {
  it('a scorekeeper who did not end the game cannot reopen it; nothing changes', async () => {
    await saveSetting(whoMayScore.key, 'anyScorekeeper');
    const gameId = w.take(w.live);
    expect(await playAndEnd(w.contextOf('scorekeeper'), gameId)).toMatchObject({ ok: true });
    const before = await w.everything(w.leagueId, [gameId]);
    // May score the game, did not end it, and may not correct games.
    const tried = await reopenTrackedGame(
      w.contextOf('unassignedScorekeeper'),
      { gameId, requestId: randomUUID(), reason: 'Not mine to reopen' },
      w.ports.tracker.deps,
    );
    expect(tried).toEqual({
      ok: false,
      error: { code: 'not-ended-by-you', endedBy: w.accountOf.get('scorekeeper') },
    });
    expect(await w.everything(w.leagueId, [gameId])).toEqual(before);
    expect(await w.gameOf(gameId)).toMatchObject({ status: 'final' });
  });

  it("another league's admin, through their own league, never reaches this league's game", async () => {
    const gameId = await underWay();
    const before = await w.everything(w.leagueId, [gameId]);
    const theirs = await w.everything(w.otherLeagueId, [w.otherGameId]);
    const admin = w.contextOf('otherLeagueAdmin', w.otherLeagueId);
    const notFound = { ok: false, error: { code: 'game-not-found' } };
    expect(
      await openScoringSession(admin, { gameId, deviceId: 'tablet' }, w.ports.tracker.deps),
    ).toEqual(notFound);
    const taps = tipOff();
    expect(await send(admin, gameId, randomUUID(), taps)).toEqual(unknownGame(taps));
    expect(await readTrackerState(admin, { gameId }, w.ports.tracker.deps)).toEqual(notFound);
    expect(await readTrackerRosters(admin, { gameId }, w.ports.tracker.deps)).toEqual(notFound);
    expect(await markNotStarted(admin, { gameId, sequence: 3 }, w.ports.tracker.deps)).toEqual(
      notFound,
    );
    expect(
      await reopenTrackedGame(
        admin,
        { gameId, requestId: randomUUID(), reason: 'Not theirs' },
        w.ports.tracker.deps,
      ),
    ).toEqual(notFound);
    expect(await w.everything(w.leagueId, [gameId])).toEqual(before);
    expect(await w.everything(w.otherLeagueId, [w.otherGameId])).toEqual(theirs);
  });
});

describe('"Score this game" on the database ports (step 2.153)', () => {
  it("offers a game under way to its scorekeeper, never another league's game", async () => {
    const gameId = await underWay();
    const asked = { gameIds: [gameId, w.otherGameId] };
    expect(await listScoringOffers(w.contextOf('scorekeeper'), asked, w.ports.games.deps)).toEqual({
      ok: true,
      value: { games: [{ gameId, recording: 'live' }] },
    });
    expect(await listScoringOffers(w.contextOf('coach'), asked, w.ports.games.deps)).toEqual(
      refused,
    );
  });
});

describe('the state read, with a batch landing in the middle of it (step 2.242, T-356)', () => {
  // The read does not lock the game: a batch taken between its statements is cut off by
  // the state's sequence, so the device never takes somebody else's command for its own.
  type Deps = typeof w.ports.tracker.deps;
  type Point = 'findState' | 'lastEventSeq';
  /**
   * Reads the state, with the batch `between` taken right after `point` answered. The
   * made-up database has one connection (PGlite), so a second transaction would wait for
   * the read to end: the batch runs, through the real command, on the read's connection
   * between its statements, which see it exactly as they would see a batch committed
   * meanwhile (read committed).
   */
  async function readWithABatchBetween(
    gameId: string,
    point: Point,
    between: (deps: Deps) => Promise<unknown>,
  ) {
    const deps = w.ports.tracker.deps;
    let stops = 0;
    const wrapped: Deps = {
      ...deps,
      transaction: (context, work) =>
        deps.transaction(context, (tx) => {
          const after = async <T>(answer: Promise<T>): Promise<T> => {
            const value = await answer;
            stops += 1;
            if (stops === 1) await between({ ...deps, transaction: (_c, inner) => inner(tx) });
            return value;
          };
          return work({
            ...tx,
            liveGames: {
              ...tx.liveGames,
              ...(point === 'findState'
                ? { findState: (id: string) => after(tx.liveGames.findState(id)) }
                : { lastEventSeq: (id: string) => after(tx.liveGames.lastEventSeq(id)) }),
            },
          });
        }),
    };
    const read = await readTrackerState(w.asOwner, { gameId }, wrapped);
    expect(stops).toBe(1);
    if (!read.ok) throw new Error(read.error.code);
    return read.value;
  }
  const readNow = async (gameId: string) => {
    const read = await readTrackerState(w.asOwner, { gameId }, w.ports.tracker.deps);
    if (!read.ok) throw new Error(read.error.code);
    return read.value;
  };
  let jersey = 70;
  const add = () => {
    jersey += 1;
    return tap({
      type: 'add-player',
      side: 'away',
      playerId: randomUUID(),
      jersey: `${jersey}`,
      name: '',
    });
  };
  const sendV2 = async (
    gameId: string,
    sessionId: string,
    commands: readonly unknown[],
    deps: Deps = w.ports.tracker.deps,
  ) => {
    const sent = await applyTrackerCommands(
      w.asOwner,
      { gameId, protocolVersion: 2, sessionId, commands },
      deps,
    );
    expect(sent.ok && sent.value.results.map((r) => r.status)).toEqual(
      commands.map(() => 'accepted'),
    );
  };
  const idsOf = (commands: readonly { readonly commandId: string }[]) =>
    new Set(commands.map((c) => c.commandId.toLowerCase()));

  it('a state saved: the batch is after the state read, and the next read catches it', async () => {
    const gameId = await fresh();
    const sessionId = await open(w.asOwner, gameId, 'owner-tablet');
    const own = [add(), ...tipOff()];
    await sendV2(gameId, sessionId, own);
    const known = await readNow(gameId);
    // Somebody else's add and play, and one more of this device's own adds.
    const others = [
      add(),
      tap({ type: 'score', side: 'home', playerId: w.players.herons[0], points: 2 }),
    ];
    const mine = add();
    const during = await readWithABatchBetween(gameId, 'findState', (deps) =>
      sendV2(gameId, sessionId, [mine, ...others], deps),
    );
    const ownIds = idsOf([...own, mine]);
    // The read answers the state it found, with the list cut at its sequence.
    expect(during.sequence).toBe(known.sequence);
    expect(during.changes).toEqual(known.changes);
    expect(commandsSince(known, during, ownIds)).toBe('own');
    const now = await readNow(gameId);
    expect(now.sequence).toBe(known.sequence + 3);
    expect(commandsSince(known, now, ownIds)).toBe('somebody-else');
    expect(commandsSince(during, now, ownIds)).toBe('somebody-else');
  });

  for (const point of ['findState', 'lastEventSeq'] as const) {
    it(`no state saved, a batch after ${point}: never judged own`, async () => {
      const gameId = await fresh();
      const sessionId = await open(w.asOwner, gameId, 'owner-tablet');
      const own = [add()];
      await sendV2(gameId, sessionId, own);
      const known = await readNow(gameId);
      expect(known.sequence).toBe(1);
      // Somebody else's add, then plays (the first state saved).
      const others = [add(), ...tipOff()];
      const during = await readWithABatchBetween(gameId, point, (deps) =>
        sendV2(gameId, sessionId, others, deps),
      );
      const ownIds = idsOf(own);
      const judged = commandsSince(known, during, ownIds);
      // Read after the state was looked for: the other's add is named, the plays cut off.
      // Read after the last sequence was: the batch is cut off whole.
      expect([during.sequence, judged]).toEqual(
        point === 'findState' ? [2, 'somebody-else'] : [1, 'own'],
      );
      const now = await readNow(gameId);
      expect(now.sequence).toBe(5);
      expect(commandsSince(known, now, ownIds)).toBe('somebody-else');
      expect(commandsSince(during, now, ownIds)).toBe('somebody-else');
    });
  }
});
