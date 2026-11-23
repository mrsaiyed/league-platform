// A phone that sleeps with plays waiting and no signal (the code review's M3): its steady
// clock stands still, so the 5-minute warning is counted on the wall clock too.
import { describe, expect, it } from 'vitest';
import { games, hawks, liveLeagueId } from '../../server/tracker-endpoints.test-helper.ts';
import { endpointNetwork } from './endpoint-network.test-helper.ts';
import { createFetchCommandTransport } from './fetch-command-transport.ts';
import { createFetchTrackerServer } from './fetch-tracker-server.ts';
import { createMemoryQueueStorage } from './memory-queue-storage.ts';
import { createTrackerController } from './tracker-controller.ts';
import { createManualClock } from './tracker-queue.test-helper.ts';

const gameId = games.hawksBears;

describe('the offline warning after a sleep (review M3)', () => {
  it('woken after 10 minutes asleep with plays waiting and no signal, it warns', async () => {
    const network = endpointNetwork();
    const clock = createManualClock();
    let slept = 0;
    const fetch = network.fetchAs('scorekeeper');
    const controller = createTrackerController({
      gameId,
      deviceId: 'phone-1',
      storage: createMemoryQueueStorage(),
      clock,
      wallClock: () => clock.now() + slept,
      random: () => 1,
      transport: createFetchCommandTransport({ leagueId: liveLeagueId, gameId, fetch }),
      server: createFetchTrackerServer({ leagueId: liveLeagueId, gameId, fetch }),
    });
    await controller.start();
    await controller.idle();
    await controller.tap({ type: 'lineup', side: 'home', playerIds: hawks });
    await controller.idle();
    network.mode = 'down';
    await controller.tap({ type: 'score', side: 'home', playerId: hawks[0] ?? '', points: 2 });
    await clock.advance(30_000);
    controller.hidden();
    // Ten minutes asleep: the wall clock moves, the steady clock stands still.
    slept += 10 * 60_000;
    controller.awake();
    await clock.advance(10_000);
    expect(controller.status().queue.waiting).toBe(1);
    expect(controller.status().offlineLong).toBe(true);
    await controller.leave();
  });
});
