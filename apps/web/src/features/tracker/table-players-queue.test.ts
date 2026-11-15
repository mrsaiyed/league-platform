// The device's queue carries the players the scorer's table adds and changes (record
// 058) in order with the plays, through the real commands address over the stand-in: a
// visiting team with no roster is entered by number with no signal, #12 scores, and
// once the network is back everything arrives in order, the players before the plays
// that name them; an answer lost on the way adds no one twice. A change the server
// turns away is set aside with why, and who wears a number already worn.
import type { BatchCommand, TablePlayerInput, TrackerCommand } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { scoringSessionRequest } from '../../server/scoring-session-endpoint.ts';
import { games, hawks, liveLeagueId } from '../../server/tracker-endpoints.test-helper.ts';
import { trackerRostersRequest } from '../../server/tracker-rosters-endpoint.ts';
import { trackerStateRequest } from '../../server/tracker-state-endpoint.ts';
import { endpointNetwork, type EndpointNetwork } from './endpoint-network.test-helper.ts';
import { createFetchCommandTransport } from './fetch-command-transport.ts';
import { createMemoryQueueStorage } from './memory-queue-storage.ts';
import { createFakeServer, createManualClock } from './tracker-queue.test-helper.ts';
import { createTrackerQueue } from './tracker-queue.ts';

const gameId = games.hawksBears;
const walkUp = (n: number) => `01900000-0000-7000-8000-0000000fb${String(n).padStart(3, '0')}`;
let commandNumber = 0;
const command = (input: TrackerCommand['input'] | TablePlayerInput): BatchCommand => {
  commandNumber += 1;
  const commandId = `01900000-0000-7000-8000-00e0${commandNumber.toString(16).padStart(8, '0')}`;
  return { commandId, at: Date.now(), input } as BatchCommand;
};

async function openedQueue(network: EndpointNetwork) {
  const context = await network.world.contextAs('scorekeeper', 'live', [
    'games',
    gameId,
    'session',
  ]);
  const opened = await scoringSessionRequest(
    context,
    gameId,
    { type: 'open', deviceId: 'tablet-1' },
    network.world.tracker,
  );
  const { sessionId } = opened.body as { sessionId: string };
  const clock = createManualClock();
  const queue = createTrackerQueue({
    gameId,
    storage: createMemoryQueueStorage(),
    transport: createFetchCommandTransport({
      leagueId: liveLeagueId,
      gameId,
      fetch: network.fetchAs('scorekeeper'),
    }),
    clock,
    sessionId: () => sessionId,
    random: () => 1,
  });
  await queue.start();
  return { queue, clock };
}

async function serverView(network: EndpointNetwork) {
  const ask = async (part: string) =>
    network.world.contextAs('scorekeeper', 'live', ['games', gameId, part]);
  const rosters = await trackerRostersRequest(await ask('rosters'), gameId, network.world.tracker);
  const state = await trackerStateRequest(await ask('state'), gameId, network.world.tracker);
  return {
    rosters: rosters.body as {
      players: { personId: string; jerseyNumber: string | null; firstName: string }[];
    },
    state: state.body as {
      sequence: number;
      state: { plays: { type: string; playerId?: string; points?: number }[] };
    },
  };
}

const numbers = ['3', '5', '10', '12', '14', '21', '23', '30'];

describe('the device’s queue and the players at the table (record 058)', () => {
  it('enters a team by number with no signal and sends it, players first, once the network is back', async () => {
    const network = endpointNetwork();
    const { queue, clock } = await openedQueue(network);
    network.mode = 'down';
    const adds = numbers.map((jersey, i) =>
      command({ type: 'add-player', side: 'away', playerId: walkUp(i + 1), jersey, name: '' }),
    );
    const plays = [
      command({ type: 'lineup', side: 'home', playerIds: hawks }),
      command({ type: 'lineup', side: 'away', playerIds: [1, 2, 3, 4, 5].map(walkUp) }),
      command({ type: 'start' }),
      command({ type: 'score', side: 'away', playerId: walkUp(4), points: 2 }),
    ];
    for (const c of [...adds, ...plays]) await queue.enqueue(c);
    await clock.advance(60_000);
    expect(queue.status().waiting).toBe(12);
    expect(queue.status().unansweredSince).not.toBeNull();

    // The server does the work but the answer is lost: sent again, nothing counts twice.
    network.mode = 'answers-lost';
    queue.wake();
    await queue.idle();
    expect(queue.status().waiting).toBe(12);
    network.mode = 'up';
    queue.wake();
    await queue.idle();
    expect(queue.status()).toMatchObject({ waiting: 0, refused: [], halted: null });

    // Sent in the order they were made, so the players were on the team before the plays
    // that name them: had they not been, the lineup and the basket would be refused.
    const { rosters, state } = await serverView(network);
    const ids = new Set(numbers.map((_, i) => walkUp(i + 1)));
    const visitors = rosters.players.filter((p) => ids.has(p.personId));
    expect(visitors.map((p) => [p.jerseyNumber, p.firstName])).toEqual(numbers.map((n) => [n, '']));
    expect(state.sequence).toBe(12);
    expect(state.state.plays.map((p) => p.type)).toEqual(['lineup', 'lineup', 'score']);
    expect(state.state.plays.at(-1)).toMatchObject({
      type: 'score',
      playerId: walkUp(4),
      points: 2,
    });
  });

  it('sets aside a change of players the server turns away, keeping why and who wears the number', async () => {
    const clock = createManualClock();
    const server = createFakeServer(clock);
    const queue = createTrackerQueue({
      gameId,
      storage: createMemoryQueueStorage(),
      transport: server.transport,
      clock,
      sessionId: () => '01900000-0000-7000-8000-0000000005e5',
      random: () => 1,
    });
    await queue.start();
    const refused = command({
      type: 'add-player',
      side: 'away',
      playerId: walkUp(9),
      jersey: '5',
      name: '',
    });
    const next = command({ type: 'start' });
    server.answerWith = {
      kind: 'reply',
      reply: {
        protocolVersion: 2,
        sequence: 1,
        results: [
          {
            commandId: refused.commandId,
            status: 'refused',
            reason: {
              code: 'rule',
              message: 'Number 5 is already worn by another player on this team.',
              problem: 'jersey-taken',
              wornBy: walkUp(1),
            },
          },
          { commandId: next.commandId, status: 'accepted' },
        ],
      },
    };
    await queue.enqueue(refused);
    await queue.enqueue(next);
    await queue.idle();
    expect(server.received[0]).toMatchObject({ protocolVersion: 2 });
    expect(queue.status().halted).toBeNull();
    expect(queue.status().refused).toEqual([
      {
        command: refused,
        refusal: {
          code: 'rule',
          message: 'Number 5 is already worn by another player on this team.',
          problem: 'jersey-taken',
          wornBy: walkUp(1),
        },
      },
    ]);
  });
});
