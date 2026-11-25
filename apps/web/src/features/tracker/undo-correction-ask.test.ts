// Undo on a play a correction wrote (step 2.65, T-408): asked first, in plain words, and
// nothing happens unless "Take it back"; every other Undo goes on at once.
import { createTranslator, en } from '@srleagues/site';
import type { MouseEvent, ReactElement, ReactNode } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { played, tippedOff } from './scoring-test-game.test-helper.ts';
import { trackerCatalog } from './tracker-catalog.ts';
import { UndoCorrectionQuestion, undoTapped, undoesCorrection } from './undo-correction-ask.tsx';

const t = createTranslator('en', { en: trackerCatalog(en) });
type Tap = MouseEvent<HTMLButtonElement>;
const tapEvent = { timeStamp: 1 } as Tap;

const game = played(
  [
    { type: 'start' },
    { type: 'foul', side: 'home', playerId: 'h3' },
    { type: 'score', side: 'away', playerId: 'a3', points: 2 },
  ],
  tippedOff(),
);
const [, foulId = '', basketId = ''] = game.plays.slice(-3).map((play) => play.id);

/** The button the question draws with this mark, found in its tree. */
function button(tree: ReactNode, mark: string): ReactElement<{ onClick: (e: Tap) => void }> {
  const found: ReactElement<{ onClick: (e: Tap) => void }>[] = [];
  const walk = (node: ReactNode): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== 'object' || !('props' in node)) return;
    const element = node as ReactElement<Record<string, unknown>>;
    if (mark in element.props) found.push(element as ReactElement<{ onClick: (e: Tap) => void }>);
    walk(element.props['children'] as ReactNode);
  };
  walk(tree);
  const [only] = found;
  if (only === undefined || found.length !== 1) throw new Error(`no single ${mark}`);
  return only;
}

describe('the Undo of a correction’s play (T-408)', () => {
  it('asks only when the play Undo would take back is one a correction wrote', () => {
    expect(undoesCorrection(game, [basketId])).toBe(true);
    // The correction's play is further back: Undo takes the tablet's own first.
    expect(undoesCorrection(game, [foulId])).toBe(false);
    expect(undoesCorrection(game, [])).toBe(false);
    expect(undoesCorrection(null, [basketId])).toBe(false);
    expect(undoesCorrection(played([{ type: 'end' }], game), [basketId])).toBe(false);
  });

  it('does nothing unless confirmed, and is the ordinary Undo once it is', () => {
    const went: Tap[] = [];
    const go = (event: Tap) => went.push(event);
    let asked: ((event: Tap) => void) | null = null;
    const ask = (later: (event: Tap) => void) => {
      asked = later;
    };
    undoTapped(false, tapEvent, go, ask);
    expect([went, asked]).toEqual([[tapEvent], null]);
    went.length = 0;
    undoTapped(true, tapEvent, go, ask);
    expect(went).toEqual([]);
    expect(asked).toBe(go);
  });

  it('says it in plain words, and only "Take it back" undoes', () => {
    let left = 0;
    const taken: Tap[] = [];
    const props = {
      t,
      onLeave: () => (left += 1),
      onTakeBack: (event: Tap) => taken.push(event),
    };
    const html = renderToStaticMarkup(createElement(UndoCorrectionQuestion, props));
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('This was added by a correction after the game. Take it back?');
    expect(html).toContain('>Leave it</button>');
    expect(html).toContain('>Take it back</button>');
    const tree = UndoCorrectionQuestion(props);
    button(tree, 'data-undo-correction-leave').props.onClick(tapEvent);
    expect([left, taken]).toEqual([1, []]);
    button(tree, 'data-undo-correction-take').props.onClick(tapEvent);
    expect(taken).toEqual([tapEvent]);
  });
});
