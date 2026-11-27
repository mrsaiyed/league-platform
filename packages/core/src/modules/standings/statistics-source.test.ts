// The statistics lines' names where the league hides them (R-24) or none was recorded
// (S-34): each shows the player's own jersey number, so no two lines read the same (2.146).
import { describe, expect, it } from 'vitest';
import { defaultNamePolicy, publicViewer, type NamePolicy } from '../people/index.ts';
import {
  leagueId,
  memoryStandingsRead,
  openTeam,
  seasonId,
} from './memory-standings-read.test-helper.ts';
import type { StandingsReadStore } from './read-ports.ts';
import { statisticsSource } from './statistics-source.ts';

const id = (n: number) => `01900000-0000-7000-8000-0000000e00${String(n).padStart(2, '0')}`;
const players = [
  { id: id(1), first: 'Noor', last: 'Haddad', number: '12', visibility: 'none' },
  { id: id(2), first: 'Jay', last: 'Whitaker', number: '7', visibility: 'none' },
  // Added at the scorer's table by number only: no name at all (S-34).
  { id: id(3), first: '', last: '', number: '30', visibility: 'none' },
  // Asked to be taken off: a nameless line, never their number (R-17).
  { id: id(4), first: 'Tess', last: 'Moreno', number: '5', visibility: 'removed' },
  // No number on their roster place: nothing to show in place of the name.
  { id: id(5), first: 'Lena', last: 'Ortiz', number: null, visibility: 'none' },
] as const;

function store(): StandingsReadStore {
  const base = memoryStandingsRead();
  return {
    ...base,
    playerTotals: async () =>
      players.map((p) => ({
        personId: p.id,
        gamesPlayed: 1,
        secondsPlayed: 0,
        secondsGames: 0,
        stats: { version: 1, stats: { points: { total: 4, gamesRecorded: 1 } } },
      })),
    playerTeams: async () =>
      players.map((p) => ({ personId: p.id, teamId: openTeam, jerseyNumber: p.number })),
    people: async (ids) =>
      players
        .filter((p) => ids.includes(p.id))
        .map((p) => ({
          id: p.id,
          firstName: p.first,
          lastName: p.last,
          isMinor: true,
          visibility: p.visibility,
        })),
  };
}

const namesUnder = async (policy: NamePolicy) => {
  const source = await statisticsSource(store(), seasonId, {
    leagueId,
    viewer: publicViewer(leagueId),
    audience: 'youth',
    policy,
  });
  return source?.players.map((p) => [p.name.text, p.name.number]);
};

describe('a statistics line where the name is not shown', () => {
  it('carries the jersey number under "Hidden", each child their own (R-24)', async () => {
    expect(await namesUnder({ ...defaultNamePolicy, names: 'hidden' })).toEqual([
      [null, '12'],
      [null, '7'],
      [null, '30'],
      [null, null],
      [null, null],
    ]);
  });

  it('carries the number for a player with no name (S-34), and none where the name shows', async () => {
    expect(await namesUnder({ ...defaultNamePolicy, names: 'first_name_last_initial' })).toEqual([
      ['Noor H.', null],
      ['Jay W.', null],
      [null, '30'],
      [null, null],
      ['Lena O.', null],
    ]);
  });
});
