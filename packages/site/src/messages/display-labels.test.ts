import { describe, expect, it } from 'vitest';
import { displayLabels, finalLinkState, finalPillText } from './display-labels.ts';
import { createTranslator } from './messages.ts';

describe('display labels', () => {
  it('finds every word the shared display pieces need in the message file', () => {
    const labels = displayLabels(createTranslator('en'));
    const words: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'string') words.push(v);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(labels);
    expect(words.length).toBeGreaterThan(20);
    expect(words.every((w) => w.trim().length > 0)).toBe(true);
    expect(labels.game.live).toBe('Live');
  });

  it('words a final game that went to overtime, and nothing more for one that did not (step 2.200)', () => {
    const t = createTranslator('en');
    expect(finalPillText(t, 1)).toBe('Final, OT');
    expect(finalPillText(t, 2)).toBe('Final, 2OT');
    expect(finalPillText(t, 3)).toBe('Final, 3OT');
    expect(finalPillText(t, 0)).toBeUndefined();
    expect(finalPillText(t, null)).toBeUndefined();
    expect(finalLinkState(t, 1)).toBe('final after overtime');
    expect(finalLinkState(t, 2)).toBe('final after 2 overtimes');
    expect(finalLinkState(t, 0)).toBeUndefined();
    expect(finalLinkState(t, null)).toBeUndefined();
  });
});
