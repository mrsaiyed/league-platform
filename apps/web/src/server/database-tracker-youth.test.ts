// A youth league's game on the database ports (step 2.93 part 6; the area 5 review's M1):
// the league's own audience, read from its row in the watcher's one snapshot (record 076),
// decides who counts as a child. In a youth league a player whose age is not known counts
// as one (R-15), a player added at the scorer's table among them, so a watcher's snapshot
// and the game's page show each by first name and last initial (R-14), and an adult in
// full; the scorer's device is given the same names (R-33, step 2.226: the league's
// "Scorekeepers see full names" starts off), as served, the surname nowhere. With the audience read wrong
// (as "adult"), the unknown-age players show in full and this test fails (tried).
import {
  applyTrackerCommands,
  openScoringSession,
  publicViewer,
  readGamePage,
  readTrackerRosters,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gamesWorld, type GamesWorld } from './database-games.test-helper.ts';
import { gameSnapshot } from './game-snapshot-endpoint.ts';
import { trackerRostersReply } from './tracker-rosters-reply.ts';

let w: GamesWorld;

beforeAll(async () => {
  w = await gamesWorld({ byHand: 0, live: 1, youth: true });
}, 300_000);

afterAll(async () => {
  await w.close();
});

let tapNumber = 0;
const tap = (input: unknown) => {
  tapNumber += 1;
  return { commandId: randomUUID(), at: w.clock.at - 60_000 + tapNumber, input };
};

describe('a youth league on the database ports', () => {
  it('shows a watcher a child and an unknown-age player by first name and last initial, the scorer the same', async () => {
    const gameId = w.take(w.live);
    const scorer = w.contextOf('scorekeeper');
    const opened = await openScoringSession(
      scorer,
      { gameId, deviceId: 'tablet' },
      w.ports.tracker.deps,
    );
    if (!opened.ok || opened.value.status !== 'held-by-you') throw new Error('not opened');
    const [child, unknownAge] = w.players.herons;
    const walkUp = randomUUID();
    const sent = await applyTrackerCommands(
      scorer,
      {
        gameId,
        // Version 2 carries the scorer's table's players (record 058).
        protocolVersion: 2,
        sessionId: opened.value.sessionId,
        commands: [
          // Added at the scorer's table: a name and no age (S-6).
          tap({
            type: 'add-player',
            side: 'away',
            playerId: walkUp,
            jersey: '77',
            name: 'Yusuf Ali',
          }),
          tap({ type: 'lineup', side: 'home', playerIds: w.players.herons }),
          tap({
            type: 'lineup',
            side: 'away',
            playerIds: [walkUp, ...w.players.otters.slice(0, 4)],
          }),
          tap({ type: 'start' }),
          tap({ type: 'score', side: 'home', playerId: child, points: 2 }),
          tap({ type: 'score', side: 'home', playerId: unknownAge, points: 2 }),
          tap({ type: 'score', side: 'away', playerId: walkUp, points: 3 }),
          tap({ type: 'score', side: 'away', playerId: w.players.otters[0], points: 2 }),
        ],
      },
      w.ports.tracker.deps,
    );
    expect(sent.ok && sent.value.results.map((r) => r.status)).toEqual(
      Array.from({ length: 8 }, () => 'accepted'),
    );

    // The watcher's snapshot, through the endpoint's own code.
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
    expect(answer.status).toBe(200);
    /** What a watcher may see: a child and anyone of unknown age shortened, an adult in full. */
    const watcherSees = (shown: string) => {
      expect(shown).toContain('Player30 H.');
      expect(shown).toContain('Player31 H.');
      expect(shown).not.toContain('Heronfamily');
      expect(shown).toContain('Yusuf A.');
      expect(shown).not.toContain('Yusuf Ali');
      // An adult recorded as one is shown in full.
      expect(shown).toContain('Player40 Otterfamily');
    };
    watcherSees(JSON.stringify(answer.body));
    // And the game's page, read in the same one snapshot as the names settings.
    let audienceRead: string | undefined;
    const page = await w.ports.tracker.gameReadsOf(w.leagueId, async (read) => {
      audienceRead = read.audience;
      return readGamePage(
        read.store,
        { gameId },
        {
          leagueId: w.leagueId,
          viewer: publicViewer(w.leagueId),
          audience: read.audience,
          policy: read.policy,
        },
      );
    });
    expect(page.ok).toBe(true);
    watcherSees(JSON.stringify(page));
    // The same one snapshot read the youth league's own audience.
    expect(audienceRead).toBe('youth');

    // The scorer's device is given the names the public sees (R-33): a staff read, as served.
    const rosters = await readTrackerRosters(scorer, { gameId }, w.ports.tracker.deps);
    if (!rosters.ok) throw new Error(rosters.error.code);
    const names = rosters.value.players.map((p) => `${p.firstName} ${p.lastName}`.trim());
    expect(names).toEqual(
      expect.arrayContaining(['Player30 H.', 'Player31 H.', 'Yusuf A.', 'Player40 Otterfamily']),
    );
    const served = JSON.stringify(trackerRostersReply(rosters.value));
    expect(served).not.toContain('Heronfamily');
    expect(served).not.toContain('Yusuf Ali');
  });
});
