// The home page's leaders section as it is drawn (step 2.147 part 2), with made-up
// leaders: across the page under its own title, or under the standings with the players'
// names one heading level further down.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { HomeLeader } from '../stats-pages/index.ts';
import { HomeLeaders } from './home-leaders.tsx';

const leader = (place: string, name: string, team?: HomeLeader['team']): HomeLeader => ({
  id: `p-${place}-${name}`,
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
const render = (leaders: readonly HomeLeader[], placing: 'across' | 'beside') =>
  renderToStaticMarkup(
    createElement(HomeLeaders, { leaders, placing, statsHref: '/x/stats?season=fall' }),
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
    // Only the first card carries the main color.
    expect(html.match(/data-first="true"/g)).toHaveLength(1);
    expect(html.indexOf('data-first="true"')).toBeLessThan(html.indexOf('Sam R.'));
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
    expect(html).toContain(
      '<div class="home-leaders-head"><h3 class="ui-kicker">Leading the way</h3><a class="ui-more" href="/x/stats?season=fall">All player stats</a></div>',
    );
    expect(html).toContain('<h4 class="ui-spot-name" dir="auto">Sam R.</h4>');
    expect(html).not.toContain('<h2');
    expect(html).not.toContain('data-across');
    expect(html.match(/<article class="ui-spot" data-first="true"/g)).toHaveLength(1);
  });

  it('is not drawn at all with no leaders', () => {
    expect(render([], 'across')).toBe('');
    expect(render([], 'beside')).toBe('');
  });
});
