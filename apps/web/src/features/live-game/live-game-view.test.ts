// The public game page says who shoots the bonus as the tracker's badge does (step 2.123),
// from the count and the season's bonus the snapshot carries, and what the count counts.
import { describe, expect, it } from 'vitest';
import { liveGameLabels } from './build-game.ts';
import { bonusWords } from './live-game-view.tsx';

const teams = { home: { name: 'Hawks' }, away: { name: 'Lions' } };
const labels = liveGameLabels('live').bonus;
const byHalf = { counted: 'half', bonusFouls: 7, doubleBonusFouls: 10 } as const;

describe('the bonus on the public game page', () => {
  it('names the team the other team’s fouls put there, and the double bonus', () => {
    expect(bonusWords(byHalf, { home: 7, away: 0 }, teams, labels)).toBe(' Lions shoot the bonus.');
    expect(bonusWords(byHalf, { home: 6, away: 10 }, teams, labels)).toBe(
      ' Hawks shoot the double bonus.',
    );
    expect(bonusWords(byHalf, { home: 10, away: 7 }, teams, labels)).toBe(
      ' Lions shoot the double bonus. Hawks shoot the bonus.',
    );
    expect(
      bonusWords({ ...byHalf, doubleBonusFouls: null }, { home: 12, away: 0 }, teams, labels),
    ).toBe(' Lions shoot the bonus.');
  });

  it('says nothing under the bonus, or when the snapshot does not say how fouls count', () => {
    expect(bonusWords(byHalf, { home: 6, away: 6 }, teams, labels)).toBe('');
    expect(bonusWords(undefined, { home: 9, away: 9 }, teams, labels)).toBe('');
  });

  it('says what the count counts', () => {
    expect(liveGameLabels('live').teamFouls).toMatch(/^Team fouls this period:/);
    expect(liveGameLabels('live', undefined, 'half').teamFouls).toMatch(/^Team fouls this half:/);
    expect(liveGameLabels('live', undefined, 'game').teamFouls).toMatch(/^Team fouls this game:/);
  });
});
