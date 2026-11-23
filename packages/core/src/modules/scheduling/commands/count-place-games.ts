// How many games each venue and court of the league has played and still has to come
// (step 2.49), for Admin → Schedule → Venues, which says it before anything is removed: a
// court or a venue with games to come is not removed (remove-court.ts, remove-venue.ts),
// so the screen says why and draws no button that could only be refused. It changes
// nothing, but runs in the same shape as a command (record 014), for those who may manage
// venues (`venues.manage`), whose screen it is. It still answers in an archived league.
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { placeGamesOf, type VenueGames } from '../place-games.ts';
import { mayReadSchedule } from '../policy.ts';
import type { SchedulingTx } from '../ports.ts';

export const countPlaceGames = defineCommand({
  name: 'scheduling.count_place_games',
  permission: 'venues.manage',
  input: z.object({}),
  allowed: (context, _input, tx: SchedulingTx) => mayReadSchedule(context, tx, 'venues.manage'),
  run: async ({ tx }): Promise<Result<readonly VenueGames[], never>> =>
    ok(await placeGamesOf(tx, await tx.scheduling.listVenues())),
});
