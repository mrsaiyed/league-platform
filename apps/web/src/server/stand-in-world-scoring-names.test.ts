import { describe, expect, it } from 'vitest';
import { standInSeedCast } from './stand-in-cast.ts';
import { withScoringNames } from './stand-in-world-scoring-names.ts';
import { madeUpLeagues } from './stand-in-world-seed.ts';

const at = '2026-11-16T18:00:00Z';
const made = () => madeUpLeagues(standInSeedCast, new Date(at));

describe('LOCAL_SCORING_NAMES (step 2.226)', () => {
  it('makes the league a youth league with a removed child #12 and an adult shown as initials on its game under way', () => {
    const leagues = made();
    const league = leagues.find((l) => l.slug === 'north-valley');
    if (league === undefined) throw new Error('no league');
    const others = leagues.filter((l) => l !== league).map((l) => JSON.stringify(l));
    const game = league.games.find((g) => g.status === 'live');
    const { removed, initials } = withScoringNames(leagues, 'north-valley', at);
    expect(league.audience).toBe('youth');
    const person = (id: string) => league.people.find((p) => p.id === id);
    const place = (id: string) => league.roster.find((r) => r.personId === id);
    expect(person(removed)).toMatchObject({
      lastName: 'Zabrowskiyy',
      visibility: 'removed',
      sensitive: { isMinor: true },
    });
    expect(place(removed)).toMatchObject({ jerseyNumber: '12', teamId: game?.homeTeamId });
    expect(person(initials)).toMatchObject({
      firstName: 'Robin',
      lastName: 'Quillfeatherz',
      visibility: 'initials',
      sensitive: { isMinor: false },
    });
    expect(place(initials)?.teamId).toBe(game?.awayTeamId);
    expect(
      league.settings.find((s) => s.key === 'privacy.playersMayAskForInitials')?.document.value,
    ).toBe(true);
    expect(leagues.filter((l) => l !== league).map((l) => JSON.stringify(l))).toEqual(others);
  });

  it('stops the app for a league that is not there or has no game under way', () => {
    expect(() => withScoringNames(made(), 'no-such-league', at)).toThrow(/LOCAL_SCORING_NAMES/);
    expect(() => withScoringNames(made(), 'old-meadow', at)).toThrow(/LOCAL_SCORING_NAMES/);
  });
});
