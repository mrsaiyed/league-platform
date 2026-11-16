import { describe, expect, it } from 'vitest';
import { panelWords, type PanelFacts } from './panel-words.ts';

const seasonName = 'Winter 2027';
/** Words that say visitors see the season now, untrue while the league is not public. */
const seenNow = /Everyone can see|Visitors can see|Visitors will see its/;
const facts = (change: Partial<PanelFacts>): PanelFacts => ({
  visibility: 'shown',
  leagueShown: true,
  seasonName,
  isCurrent: false,
  gameUnderWay: false,
  ...change,
});
const hideAsk =
  'Hide Winter 2027 from visitors? Its teams, schedule, results and standings disappear from the public site, and its address shows "Page not found". Nothing is deleted, and you can show it again.';
const current =
  "It is the league's current season, so the league's home page and its season picker will show another season visitors can see instead, or no season if there is none.";
const live =
  'A game of Winter 2027 is being scored right now: its scorekeeper can keep saving it, but people following it will stop getting updates.';

describe('panelWords', () => {
  it('says visitors see a shown season in a published league', () => {
    const words = panelWords(facts({}));
    expect(words.state).toBe('Everyone can see Winter 2027.');
    expect(words.leagueNote).toBeUndefined();
    expect(words.shown).toBe('Visitors can see Winter 2027 now.');
    expect(words.showAsk).toBe(
      'Show Winter 2027 to visitors? Visitors will see its teams, schedule and results.',
    );
  });

  it('never says visitors see it while the league is not published', () => {
    for (const visibility of ['hidden', 'shown', 'over'] as const) {
      const words = panelWords(facts({ visibility, leagueShown: false }));
      for (const said of [words.state, words.leagueNote ?? '', words.showAsk, words.shown]) {
        expect(said).not.toMatch(seenNow);
      }
    }
    const shown = panelWords(facts({ leagueShown: false }));
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
    expect(panelWords(facts({ visibility: 'hidden', leagueShown: false })).leagueNote).toBe(
      'Visitors cannot see this league until it is published, so they will see this season only after that.',
    );
    expect(panelWords(facts({ visibility: 'hidden' })).leagueNote).toBeUndefined();
  });

  it('says before hiding what else changes, only when it applies', () => {
    expect(panelWords(facts({})).hideAsk).toBe(hideAsk);
    expect(panelWords(facts({ isCurrent: true })).hideAsk).toBe(`${hideAsk} ${current}`);
    expect(panelWords(facts({ gameUnderWay: true })).hideAsk).toBe(`${hideAsk} ${live}`);
    expect(panelWords(facts({ isCurrent: true, gameUnderWay: true })).hideAsk).toBe(
      `${hideAsk} ${current} ${live}`,
    );
  });
});
