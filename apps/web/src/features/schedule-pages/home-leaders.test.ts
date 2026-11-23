// The home page's leaders section as it is drawn (step 2.147 part 2), with made-up
// leaders: across the page under its own title, or under the standings with the players'
// names one heading level further down.
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fitHomeLeaders, type HomeLeader } from '../stats-pages/index.ts';
import { HomeLeaders } from './home-leaders.tsx';

const leader = (place: string, name: string, team?: HomeLeader['team']): HomeLeader => ({
  id: `p-${place}-${name}`,
  rank: Number(place),
  label: `${place} / Points`,
  value: '17.0',
  unit: 'per game',
  name,
  detail: `${team?.name ?? 'Owls, Hawks'} · 6 games`,
  team,
});
const three = [
  leader('01', 'Sam R.', { name: 'Comets', color: '#e8a33d' }),
  leader('01', 'نور ح.', { name: 'Rockets', color: null }),
  leader('03', 'A player (name not shown)'),
];
const render = (
  leaders: readonly HomeLeader[],
  placing: 'across' | 'beside',
  levelCut?: { readonly place: number; readonly count: number },
) =>
  renderToStaticMarkup(
    createElement(HomeLeaders, { leaders, levelCut, placing, statsHref: '/x/stats?season=fall' }),
  );

describe('the home page’s leaders section', () => {
  it('across the page: its own title with a kicker, the way to every player’s numbers, the cards in a row', () => {
    const html = render(three, 'across');
    expect(html).toContain(
      '<div class="ui-section-title"><p class="ui-kicker">The players to watch</p><h2>Leading the way</h2></div>',
    );
    expect(html).toContain('<a class="ui-more" href="/x/stats?season=fall">All player stats</a>');
    expect(html).toContain('<ul class="ui-spot-row" data-across="three">');
    expect(html.match(/<article class="ui-spot"/g)).toHaveLength(3);
    // Two level for first: no card is drawn as the lone leader's, and a line says so.
    expect(html).not.toContain('data-first="true"');
    expect(html).toContain('<p class="home-leaders-level">2 players are level for first.</p>');
    // With one leader, only the first card carries the main color.
    const ahead = render([three[0] ?? leader('01', 'Sam R.'), leader('02', 'Ben')], 'across');
    expect(ahead.match(/data-first="true"/g)).toHaveLength(1);
    expect(ahead.indexOf('data-first="true"')).toBeLessThan(ahead.indexOf('Sam R.'));
    expect(ahead).not.toContain('home-leaders-level');
    // The names are titles one level under the section's, each in its own direction, and
    // written exactly as they were given: the page never works a name out itself.
    expect(html).toContain('<h3 class="ui-spot-name" dir="auto">Sam R.</h3>');
    expect(html).toContain('<h3 class="ui-spot-name" dir="auto">نور ح.</h3>');
    expect(html).toContain('<h3 class="ui-spot-name" dir="auto">A player (name not shown)</h3>');
    // Players who are level show the place they share.
    expect(html.match(/01 \/ Points/g)).toHaveLength(2);
    // A shield for a player of one team; none for a player of several.
    expect(html.match(/<svg class="ui-emblem"/g)).toHaveLength(2);
    expect(render(three.slice(0, 2), 'across')).toContain('data-across="two"');
    expect(render(three.slice(0, 1), 'across')).toContain('data-across="one"');
  });

  it('under the standings: a small heading, and the names one level further down', () => {
    const html = render(three.slice(0, 1), 'beside');
    // A kicker and a title (a phone draws both; a laptop draws the title as a small label).
    expect(html).toContain(
      '<div class="home-leaders-head"><div class="home-leaders-title"><p class="ui-kicker">The players to watch</p><h3>Leading the way</h3></div><h3 class="ui-kicker home-leaders-label">Leading the way</h3><a class="ui-more" href="/x/stats?season=fall">All player stats</a></div>',
    );
    // The title is written twice, for a phone and for a laptop; the stylesheet draws
    // exactly one of them at any width.
    const css = readFileSync(
      new URL('../../app/[league]/league-site.css', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    const phone = css.slice(0, css.indexOf('@media (min-width: 64rem) {\n  .home-leaders-beside'));
    const laptop = css.slice(phone.length);
    expect(phone).toMatch(/\.league-site \.home-leaders-label \{\s*display: none;/);
    expect(phone).not.toMatch(/\.home-leaders-title \{[^}]*display: none;/);
    expect(laptop).toMatch(
      /\.home-leaders-title \{\s*display: none;\s*\}\s*\.league-site \.home-leaders-label \{\s*display: flex;/,
    );
    expect(html).toContain('<h4 class="ui-spot-name" dir="auto">Sam R.</h4>');
    expect(html).not.toContain('<h2');
    expect(html).not.toContain('data-across');
    expect(html.match(/<article class="ui-spot" data-first="true"/g)).toHaveLength(1);
  });

  it('draws a shared place whole or not at all (the review, M2)', () => {
    // A 50, B 40, C 30, D 30, all in 3 games: C and D are both third.
    const four = [leader('01', 'A'), leader('02', 'B'), leader('03', 'C'), leader('03', 'D')];
    expect(fitHomeLeaders(four, 6).leaders.map((one) => one.name)).toEqual(['A', 'B', 'C', 'D']);
    expect(fitHomeLeaders(four, 3)).toEqual({
      leaders: four.slice(0, 2),
      levelCut: { place: 3, count: 2 },
    });
    expect(fitHomeLeaders(four, 2)).toEqual({ leaders: four.slice(0, 2) });
    // Two level for first and room for one card: neither is drawn as the lone leader.
    const level = [leader('01', 'A'), leader('01', 'B'), leader('03', 'C')];
    expect(fitHomeLeaders(level, 1)).toEqual({ leaders: [], levelCut: { place: 1, count: 2 } });
    expect(fitHomeLeaders(level, 0)).toEqual({ leaders: [] });
    const html = render([], 'beside', { place: 1, count: 2 });
    expect(html).toContain(
      '<p class="home-leaders-level">2 players are level in place 1. <a href="/x/stats?season=fall">All player stats</a></p>',
    );
    expect(html).not.toContain('<article');
    // Five level for first all come, and are drawn as level.
    const five = ['A', 'B', 'C', 'D', 'E'].map((name) => leader('01', name));
    expect(fitHomeLeaders(five, 6).leaders).toHaveLength(5);
    expect(render(five, 'across')).toContain('5 players are level for first.');
  });

  it('is not drawn at all with no leaders', () => {
    expect(render([], 'across')).toBe('');
    expect(render([], 'beside')).toBe('');
  });
});
