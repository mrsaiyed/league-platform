import { describe, expect, it } from 'vitest';
import {
  gameNumberOf,
  localDateOf,
  matchTrackerGame,
  matchTrackerPlayers,
  matchTrackerTeams,
  splitName,
} from './tracker-matching.ts';
import type { TrackerGame, TrackerPlayer } from './tracker-transfer-data.ts';

const team = (id: string, name: string, school = '') => ({ id, name, school, tracked: false });

describe('matching tracker teams', () => {
  it('finds a team by name or school, whatever the capitals and spaces', () => {
    const matches = matchTrackerTeams(
      [
        team('t1', '  riverside   OWLS '),
        team('t2', 'Foxes', 'Hillcrest School'),
        team('t3', 'Elks'),
      ],
      [
        { id: 'a', name: 'Riverside Owls' },
        { id: 'b', name: 'Hillcrest School' },
      ],
    );
    expect(matches.get('t1')).toEqual({ kind: 'matched', teamId: 'a' });
    expect(matches.get('t2')).toEqual({ kind: 'matched', teamId: 'b' });
    expect(matches.get('t3')).toEqual({ kind: 'unmatched', reason: 'not-found' });
  });

  it('leaves two tracker teams that land on one team unmatched', () => {
    const matches = matchTrackerTeams(
      [team('t1', 'Owls'), team('t2', 'Riverside', 'Owls')],
      [{ id: 'a', name: 'Owls' }],
    );
    expect(matches.get('t1')).toEqual({ kind: 'unmatched', reason: 'shared' });
    expect(matches.get('t2')).toEqual({ kind: 'unmatched', reason: 'shared' });
  });

  it('leaves a tracker team unmatched when more than one team here has its name', () => {
    const matches = matchTrackerTeams(
      [team('t1', 'Owls'), team('t2', 'Foxes', 'Owls'), team('t3', 'Elks', 'Hillcrest')],
      [
        { id: 'a', name: 'Owls' },
        { id: 'b', name: ' owls ' },
        { id: 'c', name: 'Hillcrest' },
      ],
    );
    expect(matches.get('t1')).toEqual({ kind: 'unmatched', reason: 'several-here' });
    expect(matches.get('t2')).toEqual({ kind: 'unmatched', reason: 'several-here' });
    expect(matches.get('t3')).toEqual({ kind: 'matched', teamId: 'c' });
  });
});

describe('matching tracker games', () => {
  const teams = matchTrackerTeams(
    [team('home', 'Owls'), team('away', 'Foxes'), team('lost', 'Herons')],
    [
      { id: 'H', name: 'Owls' },
      { id: 'A', name: 'Foxes' },
    ],
  );
  const game = (over: Partial<TrackerGame> = {}): TrackerGame => ({
    id: 'g',
    homeTeamId: 'home',
    awayTeamId: 'away',
    startsAt: '2026-01-05T00:30:00Z',
    sourceRef: 'made-up:101',
    status: 'final',
    homeScore: 1,
    awayScore: 0,
    state: {},
    events: [],
    lines: [],
    ...over,
  });
  const fact = (
    id: string,
    number: number | null,
    localDate: string | null,
    home = 'H',
    away = 'A',
  ) => ({
    id,
    number,
    localDate,
    homeTeamId: home,
    awayTeamId: away,
    status: 'scheduled',
  });

  it('matches by the game number first, then by the day in the league’s time zone and teams', () => {
    const games = [fact('n', 101, '2026-02-01'), fact('d', null, '2026-01-04')];
    expect(matchTrackerGame(game(), teams, games, 'America/Chicago')).toEqual({
      kind: 'matched',
      gameId: 'n',
      by: 'number',
    });
    expect(matchTrackerGame(game({ sourceRef: null }), teams, games, 'America/Chicago')).toEqual({
      kind: 'matched',
      gameId: 'd',
      by: 'date',
    });
    // In UTC the game is on the 5th, so no game is found that day.
    expect(matchTrackerGame(game({ sourceRef: null }), teams, games, 'UTC')).toEqual({
      kind: 'unmatched',
      reason: 'not-found',
    });
  });

  it('says why a game is not matched', () => {
    const tz = 'America/Chicago';
    expect(matchTrackerGame(game({ awayTeamId: 'lost' }), teams, [], tz)).toMatchObject({
      reason: 'team-not-matched',
    });
    expect(matchTrackerGame(game(), teams, [fact('n', 101, null, 'A', 'H')], tz)).toMatchObject({
      reason: 'home-away-swapped',
    });
    expect(matchTrackerGame(game(), teams, [fact('n', 101, null, 'A', 'X')], tz)).toMatchObject({
      reason: 'number-other-teams',
    });
    const twice = [fact('a', null, '2026-01-04'), fact('b', null, '2026-01-04')];
    expect(matchTrackerGame(game({ sourceRef: null }), teams, twice, tz)).toMatchObject({
      reason: 'several',
    });
    expect(
      matchTrackerGame(game({ sourceRef: null, startsAt: null }), teams, twice, tz),
    ).toMatchObject({ reason: 'not-found' });
  });

  it('reads the number a reference ends with, and days in a time zone', () => {
    expect(gameNumberOf('made-up:653')).toBe(653);
    expect(gameNumberOf('653')).toBe(653);
    expect(gameNumberOf('no number')).toBeNull();
    expect(gameNumberOf(null)).toBeNull();
    expect(localDateOf('2026-01-05T00:30:00Z', 'America/Chicago')).toBe('2026-01-04');
    expect(localDateOf('not a date', 'UTC')).toBeNull();
  });
});

describe('matching tracker players', () => {
  const player = (id: string, name: string, jersey = ''): TrackerPlayer => ({
    id,
    teamId: 't',
    name,
    jersey,
    active: true,
  });
  const entry = (
    personId: string,
    firstName: string,
    lastName: string,
    jerseyNumber: string | null,
    publicName: string | null = null,
  ) => ({
    personId,
    firstName,
    lastName,
    publicName,
    jerseyNumber,
    leftOn: null,
  });

  it('finds people by name or shown name, adds the rest, and names its problems', () => {
    const matches = matchTrackerPlayers(
      [
        player('p1', 'Jo  testing', '6'),
        player('p2', 'Sam Example', '4'),
        player('p3', '', '12'),
        player('p4', 'Ali', '7'),
        player('p5', '', '99'),
        player('p6', 'Kai'),
      ],
      [
        entry('jo', 'Jo', 'Testing', '6'),
        entry('twelve', 'Rin', 'Number', '12'),
        entry('kai', 'Kaito', 'Sample', '5', 'Kai'),
      ],
    );
    expect(matches.get('p1')).toEqual({ kind: 'on-roster', personId: 'jo', jerseyNumber: '6' });
    expect(matches.get('p2')).toEqual({
      kind: 'add',
      firstName: 'Sam',
      lastName: 'Example',
      jerseyNumber: '4',
      personId: null,
    });
    expect(matches.get('p3')).toEqual({
      kind: 'on-roster',
      personId: 'twelve',
      jerseyNumber: '12',
    });
    expect(matches.get('p4')).toEqual({ kind: 'problem', reason: 'one-name' });
    expect(matches.get('p5')).toEqual({ kind: 'problem', reason: 'no-name' });
    expect(matches.get('p6')).toEqual({ kind: 'on-roster', personId: 'kai', jerseyNumber: '5' });
  });

  it('takes neither of two players with one name, nor two that are one person here', () => {
    const matches = matchTrackerPlayers(
      [
        player('p1', 'Sam Example', '4'),
        player('p2', 'sam example', '5'),
        player('p3', '', '6'),
        player('p4', 'Jo Testing'),
      ],
      [entry('jo', 'Jo', 'Testing', '6')],
    );
    expect(matches.get('p1')).toEqual({ kind: 'problem', reason: 'same-person' });
    expect(matches.get('p2')).toEqual({ kind: 'problem', reason: 'same-person' });
    expect(matches.get('p3')).toEqual({ kind: 'problem', reason: 'same-person' });
    expect(matches.get('p4')).toEqual({ kind: 'problem', reason: 'same-person' });
  });

  it('splits a name at its first space', () => {
    expect(splitName(' Mary  Ann Smith ')).toEqual({ firstName: 'Mary', lastName: 'Ann Smith' });
    expect(splitName('Ali')).toBeUndefined();
    expect(splitName('')).toBeUndefined();
  });
});
