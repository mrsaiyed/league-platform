// The scorer's rosters keep their shape (T-483, step 2.226): a page opened before the
// step reads the rosters address's answer with the contract it was built with, strictly,
// so a new key would fail its refresh mid-game. The places the scoring screens' rule
// gives ("Player 1") are worded into the name fields instead.
import { TrackerRosters } from '@srleagues/contracts';
import type { TrackerRosters as RostersRead } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { trackerRostersReply } from './tracker-rosters-reply.ts';

// The contract as it was before step 2.226, copied from
// `git show build/stage-1:packages/contracts/src/tracker-protocol.ts` (lines 551 to 597),
// with the pieces it imports (`Jersey` from live-stats.ts, `RecordingMode` from
// season-rules.ts). Never changed: it is the page already open on a scorer's phone.
const Id = z.uuid();
const Jersey = z
  .string()
  .trim()
  .regex(/^(?:|0|00|[1-9][0-9]?)$/, 'Use a jersey number from 0–99 or 00.');
const RecordingMode = z.enum(['final-score', 'box-score', 'live']);
const OldTrackerRosterPlayer = z.strictObject({
  teamId: Id,
  personId: Id,
  firstName: z.string().max(200),
  lastName: z.string().max(200),
  jerseyNumber: Jersey.min(1).nullable(),
  left: z.boolean(),
  addedAtGameId: Id.nullable(),
  toReview: z.boolean(),
});
const OldTrackerRosters = z.strictObject({
  gameId: Id,
  homeTeamId: Id,
  awayTeamId: Id,
  recording: RecordingMode.optional(),
  status: z.string().max(20),
  uniqueJerseys: z.boolean(),
  allowTies: z.boolean(),
  statistics: z.array(z.string().max(40)).max(40),
  players: z.array(OldTrackerRosterPlayer).max(1000),
});

const home = '00000000-0000-4000-8000-0000000000a1';
const away = '00000000-0000-4000-8000-0000000000a2';
const person = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
type Player = RostersRead['players'][number];
const player = (n: number, over: Partial<Player>): Player => ({
  teamId: home,
  personId: person(n),
  firstName: '',
  lastName: '',
  ordinal: null,
  jerseyNumber: null,
  left: false,
  ...over,
});

const read: RostersRead = {
  gameId: '00000000-0000-4000-8000-0000000000f1',
  homeTeamId: home,
  awayTeamId: away,
  recording: 'live',
  status: 'scheduled',
  uniqueJerseys: true,
  allowTies: false,
  statistics: ['points'],
  players: [
    player(1, { jerseyNumber: '12' }),
    player(2, { firstName: 'Sam L.' }),
    player(3, { ordinal: 1 }),
    player(4, { firstName: 'Ana B.', ordinal: 1, teamId: away }),
    player(5, { firstName: 'Ana B.', ordinal: 2, teamId: away }),
    player(6, { firstName: 'Jordan', lastName: 'Ellis', ordinal: 2 }),
  ],
};

describe('the scorer’s rosters as served (T-483)', () => {
  const served = trackerRostersReply(read);

  it('is accepted by the contract of before step 2.226, and by today’s', () => {
    expect(OldTrackerRosters.safeParse(served).success).toBe(true);
    expect(TrackerRosters.safeParse(served).success).toBe(true);
    // Byte for byte the old keys: a stricter reader of the old shape finds nothing new.
    expect(Object.keys(served.players[0] ?? {}).sort()).toEqual(
      Object.keys(OldTrackerRosterPlayer.shape).sort(),
    );
  });

  it('words a place into the name, from the messages, and leaves the rest as given', () => {
    expect(served.players.map((p) => [p.jerseyNumber, p.firstName, p.lastName])).toEqual([
      ['12', '', ''],
      [null, 'Sam L.', ''],
      [null, 'Player 1', ''],
      [null, 'Ana B. (player 1)', ''],
      [null, 'Ana B. (player 2)', ''],
      [null, 'Jordan Ellis (player 2)', ''],
    ]);
  });
});
