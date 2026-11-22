// Step 2.181: a round drawn from data says how many games it holds and whether it can be
// removed as the rule counts them: a game with no date yet holds the round and is counted
// in its one pill; "Remove this round" is offered only when no game is in it.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GridGame, GridRound } from './build-grid.ts';
import { RoundFacts, RoundRemoval } from './round-parts.tsx';

const roundId = '01900000-0000-7000-8000-0000000b9006';
const game = (n: number): GridGame => ({
  id: `01900000-0000-7000-8000-0000000c900${n}`,
  homeTeamId: 'h',
  awayTeamId: 'a',
  homeName: 'Badgers',
  awayName: 'Otters',
  roundId,
  date: '2026-11-30',
  time: '18:00',
  place: '',
  placeLabel: null,
  recording: null,
  status: 'scheduled',
  editable: true,
  clashed: false,
  offRoundDate: null,
  outsideRound: false,
});
const round = (games: number, undated: number): GridRound => ({
  id: roundId,
  number: 6,
  label: 'Round 6',
  date: '2026-11-30',
  games: Array.from({ length: games }, (_, i) => game(i + 1)),
  undated,
  removed: [],
});
const action = async (): Promise<never> => {
  throw new Error('not posted in a test');
};
const facts = (r: GridRound) => renderToStaticMarkup(createElement(RoundFacts, { round: r }));
const removal = (r: GridRound) =>
  renderToStaticMarkup(
    createElement(RoundRemoval, {
      round: r,
      action,
      fields: createElement('input', { type: 'hidden', name: 'roundId', value: r.id }),
    }),
  );

describe("a round's count and its removal (step 2.181)", () => {
  it('counts a game with no date yet in one true pill, and offers no removal', () => {
    const only = round(0, 1);
    expect(facts(only)).toContain(
      '<span class="staff-pill" data-kind="plain">1 game, with no date yet</span>',
    );
    expect(facts(only)).not.toContain('0 games');
    const html = removal(only);
    expect(html).not.toContain('Remove this round');
    expect(html).not.toContain('It has no games');
    expect(html).toContain(
      `data-remove-round-blocked="${roundId}">This round has 1 game with no date yet, so it cannot be removed.</p>`,
    );
  });

  it('counts placed games and games with no date together', () => {
    expect(facts(round(2, 1))).toContain('3 games, 1 of them with no date yet');
    expect(removal(round(2, 1))).toContain(
      'This round has 2 games, so it cannot be removed. Move or remove its games first.',
    );
  });

  it('offers "Remove this round" only to a round with no game at all', () => {
    expect(facts(round(0, 0))).toContain('>0 games</span>');
    const html = removal(round(0, 0));
    expect(html).toContain('It has no games, so it can be removed from the draft.');
    expect(html).toContain('data-kind="danger">Remove this round</button>');
    expect(html).toContain(`data-remove-round="${roundId}"`);
  });
});

describe('a round with games the draft removes (step 2.185)', () => {
  const struck = (games: number, removed: number): GridRound => ({
    ...round(games, 0),
    removed: Array.from({ length: removed }, (_, i) => ({
      ...game(i + 5),
      roundGone: null,
      teamInBin: false,
    })),
  });

  it('says its games and the struck ones apart', () => {
    expect(facts(struck(7, 3))).toContain('>7 games, 3 removed in this draft</span>');
    expect(facts(struck(1, 1))).toContain('>1 game, 1 removed in this draft</span>');
  });

  it('can be removed when only struck games are in it (S-60)', () => {
    const html = removal(struck(0, 2));
    expect(facts(struck(0, 2))).toContain('>0 games, 2 removed in this draft</span>');
    expect(html).toContain('data-kind="danger">Remove this round</button>');
  });
});
