// Under a final or forfeited game (step 2.154): "Correct this result" for whoever may
// reopen it, with until when where the league's minutes apply; who can, for everyone else.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReopenLine } from './reopen-line.tsx';
import type { ReopenView } from './reopen-view.ts';

const times = { locale: 'en-US', timeZone: 'America/Chicago' };
const href = '/north-valley/admin/games/01900000-0000-7000-8000-006a00000005';
const draw = (view: ReopenView | undefined) =>
  renderToStaticMarkup(createElement(ReopenLine, { view, href, times }));

describe('the line about putting a result right', () => {
  it('leads whoever may reopen the game to its reopen form', () => {
    const html = draw({ kind: 'correct', door: 'by-hand', until: null });
    expect(html).toBe(
      `<p data-reopen="correct"><a class="ui-button" href="${href}">Correct this result</a></p>`,
    );
  });

  it("says until when, in the league's time, where the scorekeeper's minutes apply", () => {
    // 1:42 AM UTC on 16 November is 7:42 PM the evening before in Chicago.
    const until = Date.UTC(2026, 10, 16, 1, 42);
    const html = draw({ kind: 'correct', door: 'tracked', until });
    expect(html).toContain('You ended this game in the tracker, so you can reopen it until 7:42');
    expect(html).toContain('Correct this result</a>');
  });

  it('says who can to everyone else, with no way to reopen', () => {
    expect(draw({ kind: 'who', because: 'admins' })).toBe(
      '<p data-reopen="who">Only a league admin or a scheduler can reopen this game.</p>',
    );
    expect(draw({ kind: 'who', because: 'time-over' })).toContain(
      'Your time to reopen this game is over.',
    );
  });

  it('draws nothing for a game no one may reopen here, or one not decided', () => {
    expect(draw({ kind: 'none' })).toBe('');
    expect(draw(undefined)).toBe('');
  });
});
