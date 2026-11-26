import { describe, expect, it } from 'vitest';
import { defaultNamePolicy, type NamePolicy } from '../people/index.ts';
import { readScoringNameView } from './queries/read-scoring-name-view.ts';
import {
  scoringNames,
  type PlayerForScoring,
  type ScoringName,
  type ScoringNameView,
} from './scoring-names.ts';

// R-33 (step 2.226): the scoring screens show the name the public sees, a person's own
// "initials" or "removed" always holds, and "Scorekeepers see full names" shows everyone
// else in full. A youth league on the starting policy, as the done test says.
const home = 'home';
const away = 'away';

function player(over: Partial<PlayerForScoring>): PlayerForScoring {
  return {
    teamId: home,
    firstName: 'Ada',
    lastName: 'Example',
    isMinor: false,
    nameRequest: 'none',
    jerseyNumber: '4',
    ...over,
  };
}

const view = (over: Partial<ScoringNameView> = {}): ScoringNameView => ({
  audience: 'youth',
  policy: defaultNamePolicy,
  scorekeepersSeeFullNames: false,
  ...over,
});

const one = (p: PlayerForScoring, v: ScoringNameView): ScoringName => {
  const [name] = scoringNames([p], v);
  if (name === undefined) throw new Error('no name given');
  return name;
};

const removedChild = player({
  firstName: 'Zara',
  lastName: 'Quintrell',
  isMinor: true,
  nameRequest: 'removed',
  jerseyNumber: '12',
});
const adultWithInitials = player({
  firstName: 'Omar',
  lastName: 'Vandersloot',
  nameRequest: 'initials',
  jerseyNumber: '7',
});

describe('scoringNames (R-33)', () => {
  it('shows a removed child by number only, with the setting off and on', () => {
    for (const on of [false, true]) {
      expect(one(removedChild, view({ scorekeepersSeeFullNames: on }))).toEqual({
        firstName: '',
        lastName: '',
        ordinal: null,
      });
    }
  });

  it('shows an adult who asked for initials by initials, with the setting off and on', () => {
    for (const on of [false, true]) {
      expect(one(adultWithInitials, view({ scorekeepersSeeFullNames: on }))).toEqual({
        firstName: 'O. V.',
        lastName: '',
        ordinal: null,
      });
    }
  });

  it('with the setting off, shows everyone else as the public sees them', () => {
    const child = player({ firstName: 'Sam', lastName: 'Lee', isMinor: true });
    expect(one(child, view())).toEqual({ firstName: 'Sam L.', lastName: '', ordinal: null });
    expect(one(player({}), view())).toEqual({
      firstName: 'Ada',
      lastName: 'Example',
      ordinal: null,
    });
    // A person of unknown age in a youth league counts as a child (R-28).
    expect(one(player({ isMinor: null }), view()).firstName).toBe('Ada E.');
    // A league that hides names shows its players by number on these screens too.
    const hidden: NamePolicy = { ...defaultNamePolicy, names: 'hidden' };
    expect(one(player({}), view({ policy: hidden }))).toEqual({
      firstName: '',
      lastName: '',
      ordinal: null,
    });
  });

  it('with the setting on, shows everyone else in full, a child and a hidden league included', () => {
    const on = view({ scorekeepersSeeFullNames: true });
    const child = player({ firstName: ' Sam ', lastName: 'Lee', isMinor: true });
    expect(one(child, on)).toEqual({ firstName: 'Sam', lastName: 'Lee', ordinal: null });
    const hidden = view({
      scorekeepersSeeFullNames: true,
      policy: { ...defaultNamePolicy, names: 'hidden' },
    });
    expect(one(player({}), hidden)).toEqual({
      firstName: 'Ada',
      lastName: 'Example',
      ordinal: null,
    });
    // A person's own initials hold there too, whatever the league's choice.
    expect(one(adultWithInitials, hidden).firstName).toBe('O. V.');
    // A request it does not know counts as removed, never as nothing asked.
    expect(one(player({ nameRequest: 'gone' }), on)).toEqual({
      firstName: '',
      lastName: '',
      ordinal: null,
    });
  });

  it('tells two who would read the same apart by their numbers, else by their place', () => {
    const sam = player({ firstName: 'Sam', lastName: 'Lee', isMinor: true, jerseyNumber: '4' });
    const sal = player({ firstName: 'Sam', lastName: 'Long', isMinor: true, jerseyNumber: '5' });
    expect(scoringNames([sam, sal], view()).map((n) => [n.firstName, n.ordinal])).toEqual([
      ['Sam L.', null],
      ['Sam L.', null],
    ]);
    const unnumbered = [
      { ...sam, jerseyNumber: null },
      { ...sal, jerseyNumber: ' ' },
    ];
    expect(scoringNames(unnumbered, view()).map((n) => [n.firstName, n.ordinal])).toEqual([
      ['Sam L.', 1],
      ['Sam L.', 2],
    ]);
    // On another team, the same reading tells them apart already.
    const apart = [
      { ...sam, jerseyNumber: null },
      { ...sal, jerseyNumber: null, teamId: away },
    ];
    expect(scoringNames(apart, view()).map((n) => n.ordinal)).toEqual([null, null]);
  });

  it('gives one with no number and no name to show "Player 1", "Player 2" by team, in roster order', () => {
    const nameless = { ...removedChild, jerseyNumber: null };
    const names = scoringNames(
      [nameless, player({}), { ...nameless, teamId: away }, { ...nameless }],
      view({ scorekeepersSeeFullNames: true }),
    );
    expect(names.map((n) => n.ordinal)).toEqual([1, null, 1, 2]);
  });

  it('keeps a number-only player (S-34) as "#12": no name, no place', () => {
    expect(one(player({ firstName: '', lastName: '', jerseyNumber: '12' }), view())).toEqual({
      firstName: '',
      lastName: '',
      ordinal: null,
    });
  });
});

describe('readScoringNameView', () => {
  const rows = (document: unknown) => async (key: string) =>
    key === 'privacy.scorekeepersSeeFullNames' ? [{ level: 'league' as const, document }] : [];

  it('starts off, reads the league value, and counts a value it cannot read as off', async () => {
    expect((await readScoringNameView(async () => [])).scorekeepersSeeFullNames).toBe(false);
    const on = await readScoringNameView(rows({ version: 1, value: true }));
    expect(on).toEqual({ policy: defaultNamePolicy, scorekeepersSeeFullNames: true });
    for (const damaged of [null, { version: 2, value: true }, { value: true }]) {
      const read = await readScoringNameView(rows(damaged));
      expect(read.scorekeepersSeeFullNames, JSON.stringify(damaged)).toBe(false);
    }
  });
});
