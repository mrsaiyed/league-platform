import { describe, expect, it } from 'vitest';
import { panelWords } from './panel-words.ts';

const seasonName = 'Winter 2027';
/** Words that say visitors see the season now, untrue while the league is not public. */
const seenNow = /Everyone can see|Visitors can see|Visitors will see its/;

describe('panelWords', () => {
  it('says visitors see a shown season in a published league', () => {
    const words = panelWords({ visibility: 'shown', leagueShown: true, seasonName });
    expect(words.state).toBe('Everyone can see Winter 2027.');
    expect(words.leagueNote).toBeUndefined();
    expect(words.shown).toBe('Visitors can see Winter 2027 now.');
    expect(words.showAsk).toBe(
      'Show Winter 2027 to visitors? Visitors will see its teams, schedule and results.',
    );
  });

  it('never says visitors see it while the league is not published', () => {
    for (const visibility of ['hidden', 'shown', 'over'] as const) {
      const words = panelWords({ visibility, leagueShown: false, seasonName });
      for (const said of [words.state, words.leagueNote ?? '', words.showAsk, words.shown]) {
        expect(said).not.toMatch(seenNow);
      }
    }
    const shown = panelWords({ visibility: 'shown', leagueShown: false, seasonName });
    expect(shown.state).toBe(
      'Winter 2027 is shown, but visitors cannot see this league until it is published.',
    );
    expect(shown.shown).toBe(
      'Winter 2027 is shown. Visitors will see it once the league is published.',
    );
    expect(shown.showAsk).toBe(
      'Show Winter 2027 to visitors? Once the league is published, they will see its teams, schedule and results.',
    );
  });

  it('adds the league line to a hidden season of a league not published', () => {
    expect(panelWords({ visibility: 'hidden', leagueShown: false, seasonName }).leagueNote).toBe(
      'Visitors cannot see this league until it is published, so they will see this season only after that.',
    );
    expect(
      panelWords({ visibility: 'hidden', leagueShown: true, seasonName }).leagueNote,
    ).toBeUndefined();
  });
});
