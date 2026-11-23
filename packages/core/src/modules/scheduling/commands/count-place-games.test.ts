import { describe, expect, it } from 'vitest';
import type { DraftDocument } from '../draft-document.ts';
import {
  court,
  courtUuid,
  draftUuid,
  gameUuid,
  memoryScheduling,
  ownerId,
  schedulerGrant,
  schedulerId,
  seasonId,
  teamUuid,
  venue,
  venueUuid,
} from '../memory-scheduling.test-helper.ts';
import type { ScheduleGame } from '../rules/schedule-types.ts';
import { countPlaceGames } from './count-place-games.ts';

const game = (n: number, fields: Partial<ScheduleGame> = {}): ScheduleGame => ({
  id: gameUuid(n),
  roundId: null,
  date: '2026-12-06',
  time: '18:00',
  venueId: venueUuid(1),
  court: 'Court 1',
  homeTeamId: teamUuid(1),
  awayTeamId: teamUuid(2),
  status: 'scheduled',
  ...fields,
});

const draftOf = (changes: DraftDocument['changes']) => ({
  id: draftUuid(1),
  seasonId,
  changes: { version: 1 as const, changes },
  basedOnRevision: 1,
  version: 1,
});

describe('countPlaceGames', () => {
  it('counts each venue and court: played, to come, and to come only in the draft', async () => {
    const { deps, as } = memoryScheduling({
      venues: [venue(1), venue(2)],
      courts: [court(1, 1), court(2, 1)],
      placed: [
        { venueId: venueUuid(1), courtId: courtUuid(1), played: 4, toCome: 2 },
        { venueId: venueUuid(1), courtId: null, played: 1, toCome: 0 },
      ],
      // Published: game 1 at Court 1 (counted above), which the draft moves to Court 2.
      schedule: { rounds: [], games: [game(1)] },
      draft: draftOf([
        // A new game at Court 2, and game 1 moved there: both only in the draft.
        { kind: 'add-game', game: game(2, { court: 'Court 2' }) },
        {
          kind: 'move-game',
          gameId: gameUuid(1),
          to: {
            roundId: null,
            date: '2026-12-06',
            time: '19:00',
            venueId: venueUuid(1),
            court: 'Court 2',
          },
        },
        // A cancelled game holds nothing; a game at the other venue counts there.
        {
          kind: 'add-game',
          game: game(3, { court: 'Court 1', status: 'cancelled', time: '20:00' }),
        },
        { kind: 'add-game', game: game(4, { venueId: venueUuid(2), court: null }) },
      ]),
    });
    const result = await countPlaceGames(as(ownerId), {}, deps);
    expect(result).toEqual({
      ok: true,
      value: [
        {
          venueId: venueUuid(1),
          played: 5,
          toCome: 4,
          inDraft: 2,
          courts: {
            [courtUuid(1)]: { played: 4, toCome: 2, inDraft: 0 },
            [courtUuid(2)]: { played: 0, toCome: 2, inDraft: 2 },
          },
        },
        { venueId: venueUuid(2), played: 0, toCome: 1, inDraft: 1, courts: {} },
      ],
    });
  });

  it('adds nothing for a draft it cannot read, and none for a venue with no games', async () => {
    const { deps, as } = memoryScheduling({
      venues: [venue(1)],
      draft: { ...draftOf([]), changes: { version: 9 } as unknown as DraftDocument },
    });
    expect(await countPlaceGames(as(ownerId), {}, deps)).toEqual({
      ok: true,
      value: [{ venueId: venueUuid(1), played: 0, toCome: 0, inDraft: 0, courts: {} }],
    });
  });

  it('answers a scheduler, and nobody without venues.manage', async () => {
    const { deps, as } = memoryScheduling({ venues: [venue(1)], grants: [schedulerGrant] });
    expect(await countPlaceGames(as(schedulerId), {}, deps)).toMatchObject({ ok: true });
    expect(await countPlaceGames(as('someone'), {}, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
