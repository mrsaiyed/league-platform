import { describe, expect, it } from 'vitest';
import type { GridGame } from './build-grid.ts';
import { publishLines, publishWarnings } from './publish-summary.ts';

const teams = [
  { id: 'owls', name: 'Owls' },
  { id: 'bears', name: 'Bears' },
];
const slot = (date: string, time: string | null) => ({
  roundId: null,
  date,
  time,
  venueId: null,
  court: null,
});
const gridGame = (over: Partial<GridGame>): GridGame => ({
  id: 'g1',
  homeTeamId: 'bears',
  awayTeamId: 'owls',
  homeName: 'Bears',
  awayName: 'Owls',
  roundId: null,
  date: '2027-01-31',
  time: '18:00',
  place: '',
  placeLabel: 'Main Gym, Court 1',
  recording: null,
  status: 'scheduled',
  editable: true,
  clashed: false,
  offRoundDate: null,
  outsideRound: false,
  ...over,
});

describe('publishLines (step 2.53)', () => {
  it('names each game with its old and new day and time', () => {
    const lines = publishLines(
      [
        {
          gameId: 'a',
          kind: 'added',
          homeTeamId: 'bears',
          awayTeamId: 'owls',
          before: null,
          after: slot('2026-11-29', '18:00'),
        },
        {
          gameId: 'm',
          kind: 'moved',
          homeTeamId: 'owls',
          awayTeamId: 'bears',
          before: slot('2026-11-29', '18:00'),
          after: slot('2026-12-06', '19:30'),
        },
        {
          gameId: 'r',
          kind: 'removed',
          homeTeamId: 'bears',
          awayTeamId: 'gone',
          before: slot('2026-11-29', null),
          after: null,
        },
      ],
      teams,
    );
    expect(lines.map((l) => l.text)).toEqual([
      'New: Owls at Bears, Sun, Nov 29 at 6:00 PM.',
      'Moved: Bears at Owls, from Sun, Nov 29 at 6:00 PM to Sun, Dec 6 at 7:30 PM.',
      'Removed: a team no longer in the season at Bears, was Sun, Nov 29, no time yet.',
    ]);
  });
});

describe('publishLines: what of a slot changed (step 2.53 fix round)', () => {
  const at = (venueId: string | null, court: string | null, roundId: string | null = null) => ({
    ...slot('2026-11-29', '18:00'),
    venueId,
    court,
    roundId,
  });
  const places = {
    placeOf: (venueId: string | null, court: string | null) =>
      venueId === 'gym' ? `Main Gym${court === null ? '' : `, ${court}`}` : null,
    roundOf: (roundId: string | null) => (roundId === 'r2' ? 'Round 2: Week 2' : null),
  };
  const moved = (before: ReturnType<typeof at>, after: ReturnType<typeof at>) =>
    publishLines(
      [{ gameId: 'm', kind: 'moved', homeTeamId: 'owls', awayTeamId: 'bears', before, after }],
      teams,
      places,
    )[0]?.text;

  it('names a court-only move by its courts, not the same time twice', () => {
    expect(moved(at('gym', 'Court 1'), at('gym', 'Court 2'))).toBe(
      'Moved: Bears at Owls, Main Gym, Court 2 instead of Main Gym, Court 1.',
    );
  });

  it('names a round change, and a postponed game back on its own date', () => {
    expect(moved(at('gym', 'Court 1'), at('gym', 'Court 1', 'r2'))).toBe(
      'Moved: Bears at Owls, now in Round 2: Week 2.',
    );
    expect(moved(at('gym', 'Court 1'), at('gym', 'Court 1'))).toBe(
      'Back on its date: Bears at Owls, Sun, Nov 29 at 6:00 PM. Publishing makes it scheduled again.',
    );
  });
});

describe('publishWarnings (S-53, S-62)', () => {
  it('names a standing clash and a game outside its round, as a question', () => {
    const said = publishWarnings(
      [
        {
          kind: 'team-in-two-places',
          teamId: 'owls',
          date: '2026-11-29',
          time: '18:00',
          gameIds: ['g1', 'g2'],
        },
        {
          kind: 'court-booked-twice',
          venueId: 'v',
          court: 'Court 1',
          date: '2026-11-29',
          time: '18:00',
          gameIds: ['g1', 'g2'],
        },
      ],
      [gridGame({ outsideRound: true })],
      teams,
    );
    expect(said).toEqual([
      'Owls: booked twice on Sun, Nov 29 at 6:00 PM.',
      'Main Gym, Court 1 is booked twice on Sun, Nov 29 at 6:00 PM.',
      '1 game is outside its round: Owls at Bears, Sun, Jan 31.',
    ]);
  });

  it('says nothing when nothing is odd', () => {
    expect(publishWarnings([], [gridGame({})], teams)).toEqual([]);
  });
});
